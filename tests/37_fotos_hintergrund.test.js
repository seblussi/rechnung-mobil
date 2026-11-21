// Dokumentation: Fotos laden im Hintergrund hoch (Wunsch 21.11.2026). Speichern schließt sofort, oben eine kleine
// Anzeige mit Fortschritt; Fehler bleiben mit „Erneut“ stehen; Weiterbearbeiten während des Hochladens geht nicht verloren.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  const bild = Buffer.from(await p.evaluate(()=>{ const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await p.evaluate(()=>{ window.__up = { ms: 1200, fehler: false, fotos: 0 }; const alt = msGraphDateiHochladen;
    window.msGraphDateiHochladen = async (t, pfad, inhalt, typ)=>{ if(/\.jpg$/.test(pfad)){ await new Promise((r)=> setTimeout(r, __up.ms)); if(__up.fehler) throw new Error('Netzwerkfehler (Test)'); __up.fotos++; } return alt(t, pfad, inhalt, typ); }; });
  const doku = (id)=> p.evaluate((id)=> LS.get('doku_' + id, null), id);
  const fotosDazu = async (n)=>{ const vorher = await p.locator('.doku-foto').count();
    await p.setInputFiles('#dokuGalerie', Array.from({ length: n }, (_, i)=> ({ name: 'b' + i + '.png', mimeType: 'image/png', buffer: bild })));
    await p.waitForFunction((z)=> document.querySelectorAll('.doku-foto').length === z, vorher + n, { timeout: 15000 }); };
  const oeffneDoku = async (id)=>{ await p.evaluate((id)=>{ dokuOeffnen({ id, name: 'Test, Anna', datum: '2026-11-21', zeit: '10:00', artText: 'Test' }); }, id); await p.waitForSelector('#dokuFertig'); };

  // 1) drei Fotos, Speichern schließt sofort
  await oeffneDoku('DT1'); await fotosDazu(3);
  const t0 = Date.now(); await p.click('#dokuFertig');
  await p.waitForSelector('.doku-overlay', { state: 'detached', timeout: 5000 });
  const dauer = Date.now() - t0;
  const a = await p.evaluate(()=>{ const e = document.getElementById('dokuUpAnzeige'); return { sicht: !!e && !e.hidden && e.offsetWidth > 0, text: e ? e.textContent : '', balken: !!(e && e.querySelector('.doku-up-balken')), hoch: __up.fotos }; });
  pr('Speichern schließt sofort (' + dauer + ' ms), Fotos laden noch', dauer < 1500 && a.hoch < 3, { dauer, hoch: a.hoch });
  pr('Anzeige oben: „Fotos hochladen x/3“ mit Fortschrittsbalken', a.sicht && /Fotos hochladen \d\/3/.test(a.text) && a.balken, a);
  if(process.env.BILDER){ await p.waitForTimeout(1500); await p.screenshot({ path: process.env.BILDER + '/37_laeuft.png' }); }
  await p.waitForFunction(()=> /3 Fotos in OneDrive/.test((document.getElementById('dokuUpAnzeige') || {}).textContent || ''), null, { timeout: 15000 });
  let d = await doku('DT1');
  pr('Fertig: „3 Fotos in OneDrive“, alle Fotos als hochgeladen vermerkt', d.fotos.length === 3 && d.fotos.every((f)=> f.oben) && !!d.obenAm, d.fotos);
  await p.waitForTimeout(3000);
  pr('Erfolgsmeldung verschwindet von selbst', await p.evaluate(()=> document.getElementById('dokuUpAnzeige').hidden));

  // 2) Fehler: Anzeige bleibt mit „Erneut“
  await p.evaluate(()=>{ __up.fehler = true; __up.ms = 300; });
  await oeffneDoku('DT2'); await fotosDazu(1); await p.click('#dokuFertig');
  await p.waitForSelector('.doku-up.fehl', { timeout: 10000 });
  const f = await p.evaluate(()=> ({ text: document.getElementById('dokuUpAnzeige').textContent, neu: !!document.querySelector('[data-upneu]') }));
  d = await doku('DT2');
  pr('Fehler: rote Anzeige „Hochladen fehlgeschlagen“ mit „Erneut“, Foto bleibt im Gerät (nicht hochgeladen)', /fehlgeschlagen/.test(f.text) && f.neu && d.fotos.length === 1 && !d.fotos[0].oben, { f, fotos: d.fotos });
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/37_fehler.png' });
  await p.waitForTimeout(3000);
  pr('Fehlermeldung bleibt stehen', await p.evaluate(()=> !document.getElementById('dokuUpAnzeige').hidden));
  await p.evaluate(()=>{ __up.fehler = false; }); await p.click('[data-upneu]');
  await p.waitForSelector('.doku-up.ok', { timeout: 10000 });
  d = await doku('DT2');
  pr('„Erneut“: Foto hochgeladen', d.fotos[0].oben && !!d.obenAm, d.fotos);

  // 3) während des Hochladens weiter bearbeiten: nichts geht verloren, nichts doppelt
  await p.evaluate(()=>{ __up.ms = 1500; __up.fotos = 0; });
  await oeffneDoku('DT3'); await fotosDazu(2); await p.click('#dokuFertig');
  await p.waitForSelector('.doku-overlay', { state: 'detached' });
  await oeffneDoku('DT3'); await p.fill('textarea[data-t="anamnese"]', 'Nachgetragen'); await p.click('#dokuFertig');
  await p.waitForSelector('.doku-up.ok', { timeout: 20000 }); await p.evaluate(()=> DokuUpload.warten());
  d = await doku('DT3');
  const n = await p.evaluate(()=> __up.fotos);
  pr('Weiterbearbeitet während des Hochladens: Text bleibt, beide Fotos hochgeladen, keines doppelt', d.anamnese === 'Nachgetragen' && d.fotos.length === 2 && d.fotos.every((x)=> x.oben) && n === 2, { anamnese: d.anamnese, fotos: d.fotos, n });
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
