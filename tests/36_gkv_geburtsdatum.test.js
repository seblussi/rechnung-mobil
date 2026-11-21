// GKV-Patient: optionales Geburtsdatum (Wunsch 21.11.2026) – Kurzeingabe, Prüfung, Speichern, Liste, Bearbeiten,
// Zwischenablage; bei der Sammelerfassung ausgeblendet.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  await p.evaluate(()=>{ const h = new Date(), vor = new Date(h.getTime() - 3600000), bis = new Date(h.getTime() + 5 * 3600000); const z = (d)=> String(d.getHours()).padStart(2, '0') + ':00';
    LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Sitzdienst', schicht: '' }); LS.set('gkv_entwurf', null); gkvEntwurf = null; ansichtGkv(); });
  await p.waitForSelector('#gkvGeb');
  const feld = await p.evaluate(()=>{ const g = document.getElementById('gkvGeb'), n = document.getElementById('gkvName'); return { sichtbar: g.offsetWidth > 0, unterName: g.getBoundingClientRect().top > n.getBoundingClientRect().top, text: g.closest('label').textContent, leer: g.value === '' }; });
  pr('Feld „Geburtsdatum (optional)“ unter dem Namen, leer', feld.sichtbar && feld.unterName && /optional/.test(feld.text) && feld.leer, feld);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/36_gkv_geb.png' });
  await p.fill('#gkvName', 'Muster, Erika');
  await p.fill('#gkvGeb', '1.2.50'); await p.locator('#gkvGeb').blur();
  pr('Kurzeingabe „1.2.50“ wird zu 01.02.1950', (await p.inputValue('#gkvGeb')) === '01.02.1950', await p.inputValue('#gkvGeb'));
  await p.evaluate(()=>{ const h = document.querySelector('#gkvListe .gkv-pos:not(.an) .gkv-pos-haupt'); if(h) h.click(); });
  // ungültig -> nicht speichern
  await p.fill('#gkvGeb', '31.02.1950'); await p.evaluate(()=> document.getElementById('gkvSpeichern').click()); await p.waitForTimeout(400);
  const u = await p.evaluate(()=> ({ n: gkvFaelleLaden().filter((x)=> x.name === 'Muster, Erika').length, rot: document.getElementById('gkvGeb').classList.contains('pflichtfeld-fehlt'), m: document.getElementById('gkvMeldung').textContent }));
  pr('Ungültiges Datum: markiert, Hinweis, nicht gespeichert', u.n === 0 && u.rot && /Geburtsdatum/.test(u.m), u);
  await p.fill('#gkvGeb', '01.02.1950'); await p.evaluate(()=> document.getElementById('gkvSpeichern').click());
  for(let i = 0; i < 40; i++){
    if(await p.evaluate(()=> (gkvFaelleLaden().find((x)=> x.name === 'Muster, Erika') || {}).status === 'eingetragen')) break;
    await p.evaluate(()=>{ const o = document.querySelector('.beta-overlay.aktiv'); if(o){ const b = o.querySelector('.beta-overlay-knoepfe .btn-primaer'); if(b) b.click(); } });
    await p.waitForTimeout(500);
  }
  const f = await p.evaluate(()=> gkvFaelleLaden().find((x)=> x.name === 'Muster, Erika') || null);
  pr('Gespeichert mit Geburtsdatum', f && f.geb === '01.02.1950', f);
  await p.waitForTimeout(500);
  const liste = await p.evaluate(()=> (document.getElementById('gkvVerlauf') || {}).textContent || '');
  pr('Liste der GKV-Patienten zeigt „* 01.02.1950“', /Muster, Erika\s*\* 01\.02\.1950/.test(liste), liste.slice(0, 200));
  await p.evaluate((id)=> ansichtGkv(id), f && f.id); await p.waitForSelector('#gkvGeb');
  pr('Bearbeiten: Geburtsdatum wieder im Feld', (await p.inputValue('#gkvGeb')) === '01.02.1950');
  // ohne Geburtsdatum geht es wie bisher
  await p.evaluate(()=>{ gkvEntwurf = null; ansichtGkv(); }); await p.waitForSelector('#gkvGeb');
  // Zwischenablage
  await p.evaluate(()=>{ Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async ()=> 'Patient: Becker, Klaus\ngeb. 03.04.1938\nStraße: Hauptstr. 5\nOrt: 77652 Offenburg', writeText: async ()=>{} } }); });
  await p.evaluate(()=> document.getElementById('gkvZwischenablage').click()); await p.waitForTimeout(800);
  const z = await p.evaluate(()=> ({ geb: document.getElementById('gkvGeb').value, h: document.getElementById('gkvZwHinweis').textContent }));
  pr('Aus Zwischenablage: Geburtsdatum übernommen und genannt', z.geb === '03.04.1938' && /Geburtsdatum/.test(z.h), z);
  await p.evaluate(()=> ansichtGkv(null, { sammel: true })); await p.waitForTimeout(400);
  pr('Sammelerfassung: kein Geburtsdatum', await p.evaluate(()=> getComputedStyle(document.getElementById('gkvGeb').closest('label')).display === 'none'));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
