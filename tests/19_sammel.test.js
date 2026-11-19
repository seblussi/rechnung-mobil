// GKV-Sammelerfassung (Wunsch 18.11.2026, eigener Knopf): nur Anzahl je Ziffer, ohne Namen; eine Zeile je Dienst
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  await p.evaluate(()=>{ const h = new Date(), vor = new Date(h.getTime() - 3600000), bis = new Date(h.getTime() + 5 * 3600000); const z = (d)=> String(d.getHours()).padStart(2, '0') + ':00';
    // die Demo bringt einen laufenden Dienst samt Sammelerfassung mit -- hier ohne, damit der Test seine eigene anlegt
    gkvFaelleSpeichern(gkvFaelleLaden().filter((x)=> !x.sammel));
    LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Sitzdienst', schicht: '' }); ansichtGkv(); });
  await p.waitForSelector('#gkvSammel');
  const einzel = await p.evaluate(()=> ({ name: getComputedStyle(document.getElementById('gkvName').closest('label')).display !== 'none', sammelKnopf: !!document.getElementById('gkvSammel') }));
  pr('Einzelerfassung mit Namen bleibt Standard, Sammelerfassung als eigener Knopf', einzel.name && einzel.sammelKnopf, einzel);
  await p.click('#gkvSammel'); await p.waitForSelector('.gkv-sammel-info');
  const prof = await p.evaluate(()=> ({ aktiv: (document.querySelector('#gkvProfile .profil-chip.aktiv:not(.gkv-sonder)') || {}).textContent, sonder: [...document.querySelectorAll('#gkvProfile .gkv-sonder')].map((b)=> b.textContent) }));
  pr('Sammelerfassung neben den Profilen, startet mit Profil Sitzdienst', prof.aktiv === 'Sitzdienst' && prof.sonder.some((t)=> /Sammelerfassung/.test(t)), prof);
  // erste Position waehlen und auf 14 zaehlen
  await p.evaluate(()=>{ const h = document.querySelector('#gkvListe .gkv-pos:not(.an) .gkv-pos-haupt') ; if(h) h.click(); });
  await p.waitForTimeout(200);
  const k = await p.evaluate(()=> (document.querySelector('#gkvListe .gkv-pos.an') || {}).dataset ? document.querySelector('#gkvListe .gkv-pos.an').dataset.k : null);
  for(let i = 0; i < 13; i++){ await p.evaluate((k)=> document.querySelector('#gkvListe [data-plus="' + k + '"]').click(), k); }
  await p.waitForTimeout(200);
  const ui = await p.evaluate(()=> ({ nameSichtbar: getComputedStyle(document.getElementById('gkvName').closest('label')).display !== 'none', adresse: document.getElementById('gkvAdrBlock').style.display, anz: (document.querySelector('#gkvListe .gkv-pos.an .gkv-anz b') || {}).textContent, summe: document.getElementById('gkvSumme').textContent }));
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/19_sammel.png', fullPage: true });
  pr('Sammelerfassung: kein Name, keine Adresse, Zähler je Ziffer (14×)', !ui.nameSichtbar && ui.adresse === 'none' && ui.anz === '14×', ui);
  await p.click('#gkvSpeichern');
  // fehlt der Dienst im Fahrtenbuch, fragt die App ihn ab: übernehmen
  for(let i = 0; i < 40; i++){
    if(await p.evaluate(()=> (gkvFaelleLaden().find((x)=> x.sammel) || {}).status === 'eingetragen')) break;
    await p.evaluate(()=>{ const o = document.querySelector('.beta-overlay.aktiv'); if(o && o.querySelector('#fbArzt, #fbDatum')){ const b = o.querySelector('.beta-overlay-knoepfe .btn-primaer'); if(b) b.click(); } });
    await p.waitForTimeout(500);
  }
  const f = await p.evaluate(()=> gkvFaelleLaden().find((x)=> x.sammel) || null);
  const zeile = await p.evaluate(async ()=>{ try{ const t = await msGraphTokenHolen(); const b = msGraphPfadUrl(MSGRAPH_PFAD_FAHRTENBUCH); const info = await fahrdienstBlaetter(t, b);
    for(const bl of info.blaetter){ const ur = await gx(t, 'GET', fahrdienstBlattUrl(b, bl) + '/usedRange?$select=values'); const z = (ur.values || []).find((r)=> r.some((c)=> c === 'Sammelerfassung')); if(z) return z.filter((c)=> c !== '' && c != null).slice(0, 8); } return { blaetter: info.blaetter }; }catch(e){ return 'Fehler ' + e.message; } });
  pr('gespeichert und ins Fahrtenbuch eingetragen: Name „Sammelerfassung“, Anzahl 14, ohne Adresse', f && f.name === 'Sammelerfassung' && f.status === 'eingetragen' && f.positionen.some((x)=> x.anz === 14) && !f.adresse && !f.geo, f);
  pr('Fahrtenbuch: eine Zeile „Sammelerfassung“ mit der Anzahl 14 in der Ziffern-Spalte', Array.isArray(zeile) && zeile.includes(14), zeile);
  // erneut „Sammelerfassung“: dieselbe wird geöffnet (keine zweite Zeile, die die erste überschreibt)
  await p.evaluate(()=> ansichtGkv(null, { sammel: true })); await p.waitForTimeout(300);
  const zweit = await p.evaluate(()=> ({ anz: (document.querySelector('#gkvListe .gkv-pos.an .gkv-anz b') || {}).textContent, knopf: document.getElementById('gkvSpeichern').textContent, faelle: gkvFaelleLaden().filter((x)=> x.sammel).length }));
  pr('erneut geöffnet: dieselbe Sammelerfassung zum Ergänzen (14×, „Fahrtenbuch aktualisieren“)', zweit.anz === '14×' && /aktualisieren/.test(zweit.knopf) && zweit.faelle === 1, zweit);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
