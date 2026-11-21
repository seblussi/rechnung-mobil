// Fahrtenbuch und GKV-Listen: Multiplikator vor der Ziffer (Wunsch 21.11.2026): „3×40190“ statt „40190×3“.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const html = await p.evaluate(()=> fbZiffernHtml([{ gop: '40190', anz: 3 }, { gop: '01412', anz: 1 }]));
  pr('Fahrtenbuch: „3×40190“, einfache Ziffer ohne Zahl', /3×40190/.test(html) && !/40190×/.test(html) && />01412</.test(html), html);
  await p.evaluate(()=>{ const a = gkvFaelleLaden(); a.push({ id: 'gm1', name: 'Mehrfach, Max', datum: liveIso(new Date()), zeit: '10:00', positionen: [{ gop: '40190', anz: 3 }], euro: 12, status: 'offen' }); gkvFaelleSpeichern(a); ansichtGkv(); });
  await p.waitForSelector('#gkvVerlauf', { state: 'attached' }); await p.waitForTimeout(300);
  const t = await p.evaluate(()=> document.getElementById('gkvVerlauf').textContent);
  pr('GKV-Liste: „3×40190“', /3×40190/.test(t) && !/40190×3/.test(t), t.slice(0, 200));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
