// Verschlüsselter Abgleich der Privatversion: Die Abgleichsdatei liegt nur noch verschlüsselt im OneDrive, alle
// Geräte eines Nutzers verwenden denselben Tresorschlüssel. OneDrive und Microsoft-Anmeldung sind nachgebildet.
//  A: erstes Gerät mit Tresor – liest die bisherige Klartext-Datei, schreibt verschlüsselt, löscht den Klartext
//  B: Gerät noch ohne Tresor – gleicht nicht mehr ab; Umstellung mit dem Passwort von A
//  C: neues Gerät mit eigenem Passwort – „Jetzt verbinden“ übernimmt den Schlüssel von A
const { geraet, oeffnen, entsperren, PASSWORT } = require('./hilfe');
const { nachbau } = require('./graph_nachbau');
const { altAnlegen } = require('./altspeicher');
const PW_C = 'Ganz-Anderes-Passwort-Geraet-C!';
const fall = (name, nr)=> ({ art: 'ls', zeitstempel: '2026-11-0' + nr + 'T10:00:00.000Z', werte: { txtName: name, txtDatumExcel: '0' + nr + '.11.2026', txtZeitLS: '09:15' }, _t: Date.now() - nr * 1000 });
const laeuft = (p)=> p.waitForFunction(()=> typeof ansichtStart === 'function' && typeof msGraphStatus !== 'undefined' && msGraphStatus === 'angemeldet', null, { timeout: 40000 });
const namen = (p)=> p.evaluate(()=> ladeFaelle('ls').map((f)=> f.werte.txtName).sort());
const sync = (p)=> p.evaluate(async ()=>{ await Speicher.warten(); await faelleAbgleichen(true); await Speicher.warten(); return { pause: syncPause, fremd: !!syncFremd }; });

module.exports = async ({ browser, basis, pr })=>{
  const od = nachbau();
  // bisheriger Stand im OneDrive: Klartext-Abgleichsdatei + Kopie unter "Sicherungen"
  const klar = JSON.stringify({ version: 2, faelle: [fall('Klartext-Altfall, Anna', 1)], gkv: [], geloescht: {}, saetze: {} });
  od.setzen('ROOT/KVBW Onedrive/rechnungserfassung_app_sicherung.json', klar);
  od.setzen('ROOT/KVBW Onedrive/Sicherungen/2026-11-10 08-00/rechnungserfassung_app_sicherung.json', klar);
  od.setzen('ROOT/KVBW Onedrive/Sicherungen/2026-11-10 08-00/Übersicht gestellter Rechnungen.xlsx', 'xlsx');

  // ================= A: erstes Gerät mit Tresor =================
  const A = await geraet(browser, basis, { echt: true }); await od.verbinden(A, basis, true);
  await oeffnen(A, basis, { einrichten: true }); await laeuft(A); await A.waitForTimeout(1500);
  await A.evaluate((f)=> LS.set('faelle_ls', [f]), fall('Geraet-A-Fall, Bernd', 2));
  let r = await sync(A);
  pr('A: Abgleich läuft, Altfall aus der Klartext-Datei übernommen', !r.pause && JSON.stringify(await namen(A)) === JSON.stringify(['Geraet-A-Fall, Bernd', 'Klartext-Altfall, Anna']), { r, n: await namen(A) });
  pr('A: Abgleichsdatei und Schlüsselinfo liegen im OneDrive', od.dateien.has('ROOT/KVBW Onedrive/rechnungserfassung_abgleich.rsync') && od.dateien.has('ROOT/KVBW Onedrive/tresor_schluessel.json'));
  pr('Klartext-Datei und ihre Kopie unter „Sicherungen“ gelöscht, Excel-Kopie bleibt', !od.dateien.has('ROOT/KVBW Onedrive/rechnungserfassung_app_sicherung.json') && ![...od.dateien.keys()].some((k)=> /Sicherungen\/.*rechnungserfassung_app_sicherung/.test(k)) && [...od.dateien.keys()].some((k)=> /Sicherungen\/.*xlsx/.test(k)), [...od.dateien.keys()]);
  pr('kein Patientenname mehr im Klartext im OneDrive', od.klartext('Altfall').length === 0 && od.klartext('Geraet-A').length === 0, od.klartext('Altfall').concat(od.klartext('Geraet-A')));
  pr('Schlüsselinfo enthält nur den verpackten Schlüssel (kein Passwort)', !od.klartext(PASSWORT).length && /"pw"/.test(od.dateien.get('ROOT/KVBW Onedrive/tresor_schluessel.json').bytes.toString()));
  pr('Wechsel steht im Sicherheitsprotokoll', await A.evaluate(async ()=> (await Tresor.protokollLesen()).some((e)=> /Abgleich jetzt verschlüsselt/.test(e.text))));

  // ================= B: Gerät noch ohne Tresor =================
  const B = await geraet(browser, basis, { echt: true }); await od.verbinden(B, basis, false);
  await altAnlegen(B, basis, { faelle_ls: JSON.stringify([fall('Geraet-B-Fall, Clara', 3)]), einrichtung_gesehen: 'true', alpha_zustimmung: JSON.stringify({ version: 'x' }), app_sperre_abgelehnt: 'true' });
  await B.evaluate(()=> localStorage.removeItem('app_sperre'));
  await B.goto(basis + 'Rechnungserfassung_Mobil.html'); await B.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 });
  await B.evaluate(()=>{ msGraphStatus = 'angemeldet'; window.msGraphTokenHolen = async ()=> 'AT Files.ReadWrite'; });
  r = await sync(B);
  pr('B (ohne Tresor): gleicht nicht mehr ab und erklärt, was zu tun ist', !!r.pause && /Passwortschutz/.test(r.pause) && await B.evaluate(()=> !!sessionStorage.getItem('umzug_fern_info')), r);
  pr('B: schreibt keine Klartext-Datei mehr', !od.dateien.has('ROOT/KVBW Onedrive/rechnungserfassung_app_sicherung.json'));
  // Umstellung auf B mit dem Passwort von A
  await B.evaluate(()=> TresorStart.umzugStarten()); await B.waitForSelector('#tsPw', { timeout: 30000 });
  pr('B: Umstellung fragt nach dem Passwort des anderen Geräts', /anderen Gerät/.test(await B.textContent('#tresorSeite')));
  if(process.env.BILDER) await B.screenshot({ path: process.env.BILDER + '/5_umstellen_zweites_geraet.png' });
  await B.fill('#tsPw', 'falsches-passwort-xyz'); await B.click('#tsWeiter'); await B.waitForFunction(()=> /passt nicht/.test(document.getElementById('tsFehler').textContent), null, { timeout: 20000 });
  pr('B: falsches Passwort wird abgewiesen, nichts verändert', await B.evaluate(()=> !localStorage.getItem('privat_umzug')));
  await B.fill('#tsPw', PASSWORT); await B.click('#tsWeiter');
  await B.waitForFunction(()=> typeof ansichtStart === 'function' && window.TRESOR_MODUS, null, { timeout: 60000 }).catch(()=>{});
  await B.waitForTimeout(500); if(await B.$('#tsPkSpaeter')) await B.click('#tsPkSpaeter');
  await B.waitForFunction(()=> window.TRESOR_MODUS === true, null, { timeout: 30000 });
  await B.evaluate(()=>{ msGraphStatus = 'angemeldet'; window.msGraphTokenHolen = async ()=> 'AT Files.ReadWrite'; });
  r = await sync(B);
  pr('B: nach der Umstellung gleicher Schlüssel wie A, Abgleich läuft, alle Fälle da', !r.pause && JSON.stringify(await namen(B)) === JSON.stringify(['Geraet-A-Fall, Bernd', 'Geraet-B-Fall, Clara', 'Klartext-Altfall, Anna']), { r, n: await namen(B) });
  await sync(A);
  pr('A bekommt den Fall von B', (await namen(A)).includes('Geraet-B-Fall, Clara'));

  // ================= C: neues Gerät mit eigenem Passwort =================
  const C = await geraet(browser, basis, { echt: true }); await od.verbinden(C, basis, true);
  await C.goto(basis + 'Rechnungserfassung_Mobil.html');
  await C.waitForSelector('#tsPw1', { timeout: 30000 }); await C.fill('#tsPw1', PW_C); await C.fill('#tsPw2', PW_C); await C.click('#tsWeiter');
  await C.waitForSelector('#tsCode'); const codeC = (await C.textContent('#tsCode')).trim(); await C.fill('#tsLetzter', codeC.split('-').pop()); await C.click('#tsFertig');
  await C.waitForTimeout(500); if(await C.$('#tsPkSpaeter')) await C.click('#tsPkSpaeter');
  await laeuft(C); await C.waitForTimeout(1000);
  await C.evaluate((f)=> LS.set('faelle_ls', [f]), fall('Geraet-C-Fall, Dora', 4));
  r = await sync(C);
  pr('C (eigener Schlüssel): Abgleich angehalten, nichts überschrieben', r.fremd === true && od.klartext('Dora').length === 0 && (await namen(A)).length === 3, r);
  // „Jetzt verbinden“ mit dem Passwort von A
  await C.waitForSelector('.beta-overlay.aktiv', { timeout: 15000 });
  pr('C: Rückfrage „Jetzt verbinden“', /Jetzt verbinden/.test(await C.textContent('.beta-overlay.aktiv')));
  await C.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await C.waitForSelector('.beta-overlay.aktiv input[type=password]', { timeout: 15000 }); await C.waitForTimeout(200);
  await C.fill('.beta-overlay.aktiv input[type=password]', PASSWORT); await C.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await C.waitForFunction(()=> /verbunden/.test((document.querySelector('.beta-overlay.aktiv .beta-overlay-text') || {}).textContent || ''), null, { timeout: 60000 });
  await C.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe button').click());
  await C.waitForTimeout(500); r = await sync(C);
  pr('C: verbunden, eigener Fall erhalten und abgeglichen', !r.pause && JSON.stringify(await namen(C)) === JSON.stringify(['Geraet-A-Fall, Bernd', 'Geraet-B-Fall, Clara', 'Geraet-C-Fall, Dora', 'Klartext-Altfall, Anna']), { r, n: await namen(C) });
  await C.evaluate(()=> TresorStart.sperrenJetzt()); await C.waitForSelector('#tsPw', { timeout: 30000 });
  await entsperren(C, PW_C); await C.waitForFunction(()=> /falsch/.test(document.getElementById('tsFehler').textContent), null, { timeout: 20000 });
  await entsperren(C, PASSWORT); await C.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 });
  pr('C: danach öffnet das Passwort von A, das eigene nicht mehr', (await namen(C)).includes('Geraet-C-Fall, Dora'));

  // ================= Passwortwechsel auf A wird von B übernommen =================
  const NEU = PASSWORT + '-neu';
  await A.evaluate(async ([a, n])=>{ await Tresor.passwortAendern(a, false, n); LS.set('sync_schluessel_zeit', new Date().toISOString()); }, [PASSWORT, NEU]);
  await sync(A); await sync(B);
  await B.evaluate(()=> TresorStart.sperrenJetzt()); await B.waitForSelector('#tsPw', { timeout: 30000 });
  await entsperren(B, NEU); await B.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 }).catch(()=>{});
  pr('Passwortwechsel auf A gilt nach dem Abgleich auch auf B', await B.evaluate(()=> typeof ansichtStart === 'function'));
  // ================= Schlüssel erneuern auf A (über die Einstellungen) =================
  const NEU2 = 'Erneuerter-Schluessel-Passwort-2027';
  const vorher = { schl: od.dateien.get('ROOT/KVBW Onedrive/tresor_schluessel.json').bytes.toString(), enc: od.dateien.get('ROOT/KVBW Onedrive/rechnungserfassung_abgleich.rsync').bytes.toString('base64') };
  od.setzen('ROOT/KVBW Onedrive/Sicherungen/2026-11-15 08-00/rechnungserfassung_abgleich.rsync', od.dateien.get('ROOT/KVBW Onedrive/rechnungserfassung_abgleich.rsync').bytes);
  await A.evaluate(async ()=>{ await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 700)); document.getElementById('spaSchluesselNeu').click(); });
  const ok = async ()=>{ await A.waitForSelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer', { timeout: 30000 }); await A.waitForTimeout(250); await A.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click()); await A.waitForTimeout(300); };
  const eingabe = async (w)=>{ await A.waitForSelector('.beta-overlay.aktiv input[type=password]', { timeout: 15000 }); await A.waitForTimeout(200); await A.fill('.beta-overlay.aktiv input[type=password]', w); await ok(); };
  await ok(); await eingabe(NEU); await eingabe(NEU2); await eingabe(NEU2);
  await A.waitForFunction(()=> /Der Schlüssel ist erneuert/.test((document.querySelector('.beta-overlay.aktiv .beta-overlay-text') || {}).textContent || ''), null, { timeout: 60000 });
  const meldungA = await A.textContent('.beta-overlay.aktiv .beta-overlay-text');
  await A.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe button').click());
  await A.waitForSelector('#tsCode', { timeout: 15000 }); const codeA = (await A.textContent('#tsCode')).trim(); await A.fill('#tsLetzter', codeA.split('-').pop()); await A.click('#tsFertig');
  pr('Schlüssel erneuert: OneDrive ersetzt (Meldung)', /Schlüsselinfo und Abgleichsdatei ersetzt/.test(meldungA), meldungA.slice(0, 300));
  const nachher = { schl: od.dateien.get('ROOT/KVBW Onedrive/tresor_schluessel.json').bytes.toString(), enc: od.dateien.get('ROOT/KVBW Onedrive/rechnungserfassung_abgleich.rsync').bytes.toString('base64') };
  pr('OneDrive: neue Schlüsselinfo und neu verschlüsselte Abgleichsdatei, alte Kopie unter „Sicherungen“ gelöscht', nachher.schl !== vorher.schl && nachher.enc !== vorher.enc && ![...od.dateien.keys()].some((k)=> /Sicherungen\/.*rechnungserfassung_abgleich/.test(k)), [...od.dateien.keys()]);
  pr('A: Daten weiterhin vollständig', (await namen(A)).length === 4, await namen(A));
  pr('alte Abgleichsdatei mit B (alter Schlüssel) nicht mehr lesbar', await B.evaluate(async (b64)=>{ try{ await Tresor.ent(Uint8Array.from(atob(b64), (c)=> c.charCodeAt(0))); return false; }catch(_){ return true; } }, nachher.enc));
  await A.evaluate(()=> TresorStart.sperrenJetzt()); await A.waitForSelector('#tsPw', { timeout: 30000 });
  await entsperren(A, NEU); await A.waitForFunction(()=> /falsch/.test(document.getElementById('tsFehler').textContent), null, { timeout: 20000 });
  await entsperren(A, NEU2); await A.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 });
  pr('A: altes Passwort öffnet nicht mehr, neues schon', (await namen(A)).length === 4);
  // B (alter Schlüssel): Abgleich angehalten, verbinden mit dem neuen Passwort
  await B.evaluate(()=>{ msGraphStatus = 'angemeldet'; window.msGraphTokenHolen = async ()=> 'AT Files.ReadWrite'; });
  r = await sync(B);
  pr('B: Abgleich angehalten (anderer Schlüssel), nichts überschrieben', r.fremd === true && od.dateien.get('ROOT/KVBW Onedrive/rechnungserfassung_abgleich.rsync').bytes.toString('base64') === nachher.enc, r);
  await B.waitForSelector('.beta-overlay.aktiv', { timeout: 15000 });
  await B.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await B.waitForSelector('.beta-overlay.aktiv input[type=password]', { timeout: 15000 }); await B.waitForTimeout(200);
  await B.fill('.beta-overlay.aktiv input[type=password]', NEU2); await B.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await B.waitForFunction(()=> /verbunden/.test((document.querySelector('.beta-overlay.aktiv .beta-overlay-text') || {}).textContent || ''), null, { timeout: 60000 });
  await B.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe button').click());
  r = await sync(B);
  pr('B: mit dem neuen Passwort verbunden, Abgleich läuft wieder', !r.pause && (await namen(B)).length === 4, { r, n: await namen(B) });
  // ================= D: weiteres Gerät über die Startseite (anmelden, Passwort des anderen Geräts) =================
  const D = await geraet(browser, basis, { echt: true }); await od.verbinden(D, basis, false);
  await D.goto(basis + 'Rechnungserfassung_Mobil.html'); await D.waitForSelector('#tsAnderesGeraet', { timeout: 30000 });
  if(process.env.BILDER) await D.screenshot({ path: process.env.BILDER + '/8_neues_geraet_start.png' });
  await D.click('#tsAnderesGeraet');
  await D.waitForSelector('#tsPw', { timeout: 30000 });
  pr('D: nach der Anmeldung fragt die App nach dem Passwort des anderen Geräts (kein zweites Passwort)', /anderen Gerät/.test(await D.textContent('#tresorSeite')) && !(await D.$('#tsPw1')) && !/code=/.test(D.url()));
  if(process.env.BILDER) await D.screenshot({ path: process.env.BILDER + '/9_neues_geraet_passwort.png' });
  await D.fill('#tsPw', 'voellig-falsches-passwort'); await D.click('#tsWeiter'); await D.waitForFunction(()=> /passt nicht/.test(document.getElementById('tsFehler').textContent), null, { timeout: 20000 });
  pr('D: falsches Passwort abgewiesen', true);
  await D.fill('#tsPw', NEU2); await D.click('#tsWeiter');
  await D.waitForTimeout(800); if(await D.$('#tsPkSpaeter')) await D.click('#tsPkSpaeter');
  await D.waitForFunction(()=> typeof ansichtStart === 'function' && typeof msGraphStatus !== 'undefined' && msGraphStatus === 'angemeldet', null, { timeout: 40000 });
  pr('D: angemeldet, Anmeldung nur verschlüsselt im Tresor', await D.evaluate(()=> window.TRESOR_MODUS && MsEigen.angemeldet() && !Object.keys(localStorage).some((k)=> /RT-|refresh/i.test(k + localStorage.getItem(k)))));
  r = await sync(D);
  pr('D: gleicher Schlüssel, Abgleich läuft, alle Fälle da', !r.pause && (await namen(D)).length === 4, { r, n: await namen(D) });
  await D.evaluate(()=> TresorStart.sperrenJetzt()); await D.waitForSelector('#tsPw', { timeout: 30000 });
  await entsperren(D, NEU2); await D.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 });
  pr('D: öffnet mit dem gemeinsamen Passwort', (await namen(D)).length === 4);
  await D.context().close();
  pr('keine Skriptfehler', [...A.fehler, ...B.fehler, ...C.fehler].length === 0, [...A.fehler, ...B.fehler, ...C.fehler].slice(0, 4));
  for(const x of [A, B, C]) await x.context().close();
};
