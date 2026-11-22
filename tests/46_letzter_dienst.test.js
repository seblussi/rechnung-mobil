// „Letzter Dienst“ (Wunsch 22.11.2026): kleine Ecke rechts neben „Neuen Dienst starten“ zeigt Uhr und Übersicht des letzten Dienstes.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 1300 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const start = async ()=>{ await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(1200);
    await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); }); };
  // ein Dienst von gestern, 13 h nach Ende abgelaufen -> wird als „letzter“ gemerkt
  await p.evaluate(()=>{ LS.set('live_auto', false); const g = new Date(Date.now() - 30 * 3600000); LS.set('live_dienst', { datum: liveIso(g), von: '08:00', bis: '18:00', art: 'Fahrdienst', schicht: '2' }); LS.set('fb_dienste_cache', null); liveDienstLaden(); });
  await start();
  const a = await p.evaluate(()=> ({ ring: !!document.getElementById('dsRing'), knopf: !!document.getElementById('dsLetzter'), neben: (()=>{ const s = document.getElementById('dsDienstStart').getBoundingClientRect(), l = document.getElementById('dsLetzter').getBoundingClientRect(); return Math.abs(s.top - l.top) < 4 && l.left > s.right && l.width < 90; })(), gemerkt: !!LS.get('live_dienst_letzt', null) }));
  pr('Kein Dienst: keine Uhr, Ecke „letzter Dienst“ rechts neben „Neuen Dienst starten“', !a.ring && a.knopf && a.neben && a.gemerkt, a);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/46_ecke.png' });
  await p.evaluate(()=> document.getElementById('dsLetzter').click()); await p.waitForTimeout(1000);
  const b = await p.evaluate(()=> ({ ring: !!document.getElementById('dsRing'), modus: designDienstInfo().modus, titel: (document.querySelector('.ds-dz') || {}).textContent || '', knopf: (document.getElementById('dsLetzter') || {}).textContent, fuer: !!liveDienstFuer(new Date()) }));
  pr('Klick: Uhr und Übersicht des letzten Dienstes (beendet)', b.ring && b.modus === 'vorbei' && /Dienst beendet/.test(b.titel) && /08:00–18:00/.test(b.titel) && /ausblenden/.test(b.knopf), b);
  pr('Neue Fälle hängen sich nicht an den letzten Dienst', !b.fuer);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/46_letzter.png' });
  await p.evaluate(()=> document.getElementById('dsLetzter').click()); await p.waitForTimeout(800);
  pr('Nochmal: wieder ausgeblendet', await p.evaluate(()=> !document.getElementById('dsRing') && /letzter Dienst/.test(document.getElementById('dsLetzter').textContent)));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
