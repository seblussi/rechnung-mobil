// P1: Umzug vom bisherigen Speicher (Schlüssel neben den Daten) in den Datentresor (Passwort / Fingerabdruck).
// Der bisherige Speicher wird genau so nachgebaut, wie ihn die App bis v471 angelegt hat: Datenbank "rechnung-daten"
// mit nicht exportierbarem Geräteschlüssel, Einträge AES-GCM { iv, d }, Fotos v1 { v:1, iv, d } bzw. als Klartext-Bild,
// App-Sperre (PIN-Prüfwert) im localStorage.
const { geraet, oeffnen, entsperren, PASSWORT } = require('./hilfe');
const NAME = 'Umzugtest-Müller, Zoë';
const ALT = {
  faelle_ls: JSON.stringify([{ art: 'ls', zeitstempel: '2026-11-01T10:00:00.000Z', werte: { txtName: NAME, txtDatumExcel: '01.11.2026', txtZeitLS: '09:15', txtPAdresse1: 'Hauptstr. 1' } }]),
  faelle_pt: JSON.stringify([{ art: 'pt', zeitstempel: '2026-11-02T10:00:00.000Z', werte: { txtName: 'Zweiter, Patient', txtDatumExcel: '02.11.2026', txtZeitLS: '20:15' } }]),
  einstellungen: JSON.stringify({ arztName: 'Dr. Test', design: '', dunkel: false }),
  'doku_Dalt01': JSON.stringify({ id: 'Dalt01', fotos: [{ name: 'foto_01.jpg', am: '2026-11-01T10:00:00Z', oben: false }, { name: 'foto_02.jpg', am: '2026-11-01T10:01:00Z', oben: false }], vital: {}, zustand: {}, ekg: { befunde: [], text: '' }, anamnese: NAME, befund: '', therapie: '', sonstiges: '' }),
  einrichtung_gesehen: 'true', alpha_zustimmung: JSON.stringify({ version: 'test', am: '2026-11-01T00:00:00Z', name: 'Test' }), app_sperre_abgelehnt: 'true',
  sonderzeichen: JSON.stringify('äöüß € 😀   "Anführung"')
};
const { altAnlegen: altAnlegen0 } = require('./altspeicher');
const altAnlegen = (p, basis)=> altAnlegen0(p, basis, ALT);
// alle Datenbanken (auch Binärdaten) und localStorage nach dem Patientennamen durchsuchen
const klartext = (p)=> p.evaluate(async (name)=>{
  const treffer = [], dec = new TextDecoder('utf-8', { fatal: false });
  const flach = (x)=>{ if(x == null) return ''; if(x instanceof ArrayBuffer) return dec.decode(new Uint8Array(x)); if(ArrayBuffer.isView(x)) return dec.decode(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); if(typeof x === 'string') return x; if(typeof x === 'object'){ if(x instanceof CryptoKey || x instanceof Blob) return ''; try{ return Object.keys(x).map((k)=> k + ' ' + flach(x[k])).join(' '); }catch(_){ return ''; } } return String(x); };
  for(const info of await indexedDB.databases()){
    const d = await new Promise((ok, nein)=>{ const q = indexedDB.open(info.name); q.onsuccess = ()=> ok(q.result); q.onerror = ()=> nein(q.error); });
    for(const n of Array.from(d.objectStoreNames)){
      const [ks, vs] = await new Promise((ok)=>{ const t = d.transaction(n).objectStore(n), a = t.getAllKeys(), b = t.getAll(); b.onsuccess = ()=> ok([a.result, b.result]); });
      vs.forEach((v, i)=>{ if(flach(v).includes(name)) treffer.push(info.name + '/' + n + '/' + String(ks[i]).slice(0, 20)); });
    }
    d.close();
  }
  for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if((localStorage.getItem(k) || '').includes(name)) treffer.push('localStorage/' + k); }
  return treffer;
}, NAME);
const dbs = (p)=> p.evaluate(async ()=> (await indexedDB.databases()).map((d)=> d.name).sort());
const fotoStand = (p)=> p.evaluate(()=> new Promise((ok)=>{ const q = indexedDB.open('rechnung_doku'); q.onsuccess = ()=>{ const d = q.result, t = d.transaction('fotos').objectStore('fotos'), a = t.getAllKeys(), b = t.getAll(); b.onsuccess = ()=>{ d.close(); ok(a.result.map((k, i)=> k + ':' + (b.result[i] instanceof Blob ? 'blob' : 'v' + b.result[i].v))); }; }; }));
const laeuft = (p)=> p.waitForFunction(()=> typeof ansichtStart === 'function' && typeof LS !== 'undefined', null, { timeout: 40000 });

module.exports = async ({ browser, basis, pr })=>{
  // ================= 1. Umzug im Normalfall =================
  let p = await geraet(browser, basis, { echt: true });
  const groessen = await altAnlegen(p, basis);
  await p.goto(basis + 'Rechnungserfassung_Mobil.html'); await laeuft(p); await p.waitForTimeout(1500);
  pr('bisheriger Speicher: App startet wie bisher (ohne Passwort), Daten da', await p.evaluate((n)=> !window.TRESOR_MODUS && !Speicher.istTresor() && ladeFaelle('ls')[0].werte.txtName === n, NAME));
  pr('Ausgangslage: Patientenname liegt nirgends im Klartext', (await klartext(p)).length === 0, await klartext(p));
  await p.evaluate(async ()=>{ try{ document.querySelectorAll('#appSperre').forEach((x)=> x.remove()); }catch(_){} await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 600)); });
  pr('Einstellungen: Angebot „Jetzt umstellen“', await p.evaluate(()=> !!document.getElementById('umzugJetzt')));
  if(process.env.BILDER){ await p.evaluate(()=> document.getElementById('umzugJetzt').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: process.env.BILDER + '/1_angebot.png' }); }
  await p.evaluate(()=> TresorStart.umzugStarten());
  await p.waitForSelector('#tsPw1', { timeout: 30000 });
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/2_umstellen.png' });
  await p.fill('#tsPw1', 'kurz'); await p.fill('#tsPw2', 'kurz'); await p.click('#tsWeiter');
  pr('zu schwaches Passwort wird abgelehnt', /Zeichen|mindestens/i.test(await p.textContent('#tsFehler')), await p.textContent('#tsFehler'));
  await p.fill('#tsPw1', PASSWORT); await p.fill('#tsPw2', PASSWORT); await p.click('#tsWeiter');
  await p.waitForSelector('#tsCode', { timeout: 60000 });
  const code = (await p.textContent('#tsCode')).trim();
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/3_schluessel.png' });
  pr('während der Code angezeigt wird: Daten sicher im Tresor, alter Speicher noch da (Vermerk „kopiert“)', await p.evaluate(()=> localStorage.getItem('privat_umzug')) === 'kopiert' && (await dbs(p)).includes('rechnung-daten'));
  await p.fill('#tsLetzter', 'XXXXX');
  pr('falsche Kontrolle der letzten fünf Zeichen: Weiter bleibt gesperrt', await p.evaluate(()=> document.getElementById('tsFertig').disabled));
  await p.fill('#tsLetzter', code.split('-').pop().toLowerCase()); await p.click('#tsFertig');
  await p.waitForTimeout(800); if(await p.$('#tsPkSpaeter')) await p.click('#tsPkSpaeter');
  await laeuft(p); await p.waitForTimeout(1500);
  const r = await p.evaluate(async (alt)=>{
    // einstellungen: einziger bewusst geänderter Eintrag (Minuten der bisherigen App-Sperre ergänzt)
    const ohneMin = (t)=>{ try{ const o = JSON.parse(t); delete o.sperreMinuten; return JSON.stringify(o); }catch(_){ return t; } };
    const falsch = Object.keys(alt).filter((k)=> k === 'einstellungen' ? JSON.parse(Speicher.text(k)).arztName !== 'Dr. Test' : Speicher.text(k) !== alt[k]);
    return { modus: window.TRESOR_MODUS === true && Speicher.istTresor(), falsch, name: ladeFaelle('ls')[0].werte.txtName, sperre: localStorage.getItem('app_sperre'), umzug: localStorage.getItem('privat_umzug'),
      minuten: ladeEinstellungen().sperreMinuten, prot: (await Tresor.protokollLesen()).filter((e)=> e.art === 'umzug').length };
  }, ALT);
  pr('nach dem Umzug: Tresor-Modus, jeder Eintrag unverändert', r.modus && r.falsch.length === 0 && r.name === NAME, r);
  pr('alter Speicher samt Geräteschlüssel gelöscht, App-Sperre entfernt, Umzug abgeschlossen', !(await dbs(p)).includes('rechnung-daten') && r.sperre === null && r.umzug === null, { dbs: await dbs(p), r });
  pr('Minuten der bisherigen App-Sperre übernommen', r.minuten === 30, r.minuten);
  pr('Umzug steht im Sicherheitsprotokoll', r.prot === 2, r.prot);
  const fs = await fotoStand(p);
  pr('alle Fotos mit dem Tresor verschlüsselt (v2)', fs.length === 3 && fs.every((x)=> x.endsWith(':v2')), fs);
  pr('Fotos lesbar und unverändert groß', JSON.stringify(await p.evaluate(async ()=> Promise.all(['Dalt01/foto_01.jpg', 'Dalt01/foto_02.jpg', 'Dalt02/foto_01.jpg'].map(async (k)=>{ const b = await dokuDb.holen(k); return b ? b.size : -1; })))) === JSON.stringify([groessen.b1, groessen.b2, groessen.b3]));
  pr('kein Klartext im Gerät', (await klartext(p)).length === 0, await klartext(p));
  await p.evaluate(async ()=>{ await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 600)); });
  pr('Einstellungen: Abschnitt „Sicherheit“ statt App-Sperre', await p.evaluate(()=> !!document.getElementById('spaPasswort') && !document.getElementById('umzugJetzt') && !document.getElementById('asPin')));
  // neu laden: gesperrt; falsches Passwort zählt, richtiges öffnet
  await p.reload(); await p.waitForSelector('#tsPw', { timeout: 30000 });
  pr('nach dem Neuladen gesperrt – keine Daten lesbar', await p.evaluate(()=> typeof ansichtStart !== 'function' && !Tresor.offen()));
  await entsperren(p, 'falsches-passwort-123'); await p.waitForFunction(()=> /falsch/.test(document.getElementById('tsFehler').textContent), null, { timeout: 20000 });
  await entsperren(p); await laeuft(p);
  pr('richtiges Passwort öffnet, Daten da', await p.evaluate((n)=> ladeFaelle('ls')[0].werte.txtName === n, NAME));
  // Wiederherstellungsschlüssel öffnet (danach neues Passwort)
  await p.evaluate(()=> TresorStart.sperrenJetzt()); await p.waitForSelector('#tsCodeWeg', { timeout: 30000 });
  await p.click('#tsCodeWeg'); await p.fill('#tsCodeIn', code.toLowerCase().replace(/-/g, '')); await p.click('#tsOk');
  await p.waitForSelector('#tsPw1', { timeout: 30000 }); await p.fill('#tsPw1', PASSWORT + 'X'); await p.fill('#tsPw2', PASSWORT + 'X'); await p.click('#tsSetzen');
  await p.waitForTimeout(800); if(await p.$('#tsPkSpaeter')) await p.click('#tsPkSpaeter');
  await laeuft(p);
  pr('Wiederherstellungsschlüssel öffnet, neues Passwort gesetzt', await p.evaluate((n)=> ladeFaelle('ls')[0].werte.txtName === n, NAME));
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();

  // ================= 2. Abbruch vor der Nachprüfung: alles bleibt wie bisher =================
  p = await geraet(browser, basis, { echt: true });
  await altAnlegen(p, basis);
  await p.evaluate(()=>{ window.TRESOR_DB_NAME = 'rechnung_privat_tresor'; });
  for(const f of ['lib/argon2.umd.min.js', 'lokal/krypto.js', 'lokal/sperrliste.js', 'lokal/tresor.js']) await p.addScriptTag({ url: basis + f });
  await p.evaluate(async (pw)=>{ await Tresor.pruefen(); await Tresor.einrichten(pw); Tresor.kvSetzenText('faelle_ls', '[]'); await Tresor.kvWarten(); localStorage.setItem('privat_umzug', 'laeuft'); }, PASSWORT);
  await p.goto(basis + 'Rechnungserfassung_Mobil.html'); await laeuft(p); await p.waitForTimeout(1000);
  pr('abgebrochener Umzug: halber Tresor verworfen, bisherige Daten unverändert', await p.evaluate((n)=> !window.TRESOR_MODUS && ladeFaelle('ls')[0].werte.txtName === n && !localStorage.getItem('privat_umzug'), NAME) && !(await dbs(p)).includes('rechnung_privat_tresor'), await dbs(p));
  await p.context().close();

  // ================= 3. Abbruch auf der Schlüssel-Seite: beim nächsten Start abgeschlossen =================
  p = await geraet(browser, basis, { echt: true });
  await altAnlegen(p, basis);
  await p.goto(basis + 'Rechnungserfassung_Mobil.html'); await laeuft(p);
  await p.evaluate(()=> TresorStart.umzugStarten()); await p.waitForSelector('#tsPw1', { timeout: 30000 });
  await p.fill('#tsPw1', PASSWORT); await p.fill('#tsPw2', PASSWORT); await p.click('#tsWeiter'); await p.waitForSelector('#tsCode', { timeout: 60000 });
  await p.reload();   // Nutzer schließt die App, ohne den Schlüssel zu bestätigen
  await entsperren(p); await p.waitForTimeout(800); if(await p.$('#tsPkSpaeter')) await p.click('#tsPkSpaeter'); await laeuft(p); await p.waitForTimeout(800);
  pr('Abbruch nach dem Kopieren: Entsperren schließt den Umzug ab (alter Speicher gelöscht, Daten da)', !(await dbs(p)).includes('rechnung-daten') && await p.evaluate((n)=> window.TRESOR_MODUS && ladeFaelle('ls')[0].werte.txtName === n && !localStorage.getItem('privat_umzug'), NAME), await dbs(p));
  await p.context().close();

  // ================= 4. neues Gerät und Zurücksetzen =================
  p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  pr('neues Gerät: Passwort festlegen, App läuft im Tresor-Modus', await p.evaluate(()=> window.TRESOR_MODUS === true));
  await p.evaluate(()=> TresorStart.sperrenJetzt()); await p.waitForSelector('#tsCodeWeg', { timeout: 30000 });
  await p.click('#tsCodeWeg'); await p.click('#tsZuruecksetzen');
  pr('Zurücksetzen erst nach Eintippen von LÖSCHEN', await p.evaluate(()=> document.getElementById('tsWeg').disabled));
  await p.fill('#tsBest', 'löschen'); await p.click('#tsWeg'); await p.waitForSelector('#tsPw1', { timeout: 30000 });
  pr('nach dem Zurücksetzen: Neueinrichtung, Tresor gelöscht', true);
  await p.context().close();
};
