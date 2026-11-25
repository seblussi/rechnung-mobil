// „Alle Dienste“ (Wunsch 25.11.2026): wie die Quartalsübersicht -- Jahr aus der Liste (mit „Zeitraum …“), daneben Q1–Q4, Suche darunter
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); LS.set('fb_zeitraum', 'jahr'); LS.set('fb_ansicht', 'a'); ansichtFahrtenbuch(); }); await p.waitForTimeout(4000);
  const n = ()=> p.evaluate(()=> document.querySelectorAll('#fbxInhalt [data-fbdienst]').length);
  const a = await p.evaluate(()=>{ const s = document.getElementById('fbxJahr'), q = document.querySelectorAll('[data-fbq]'), r = s.getBoundingClientRect(), r1 = q[0].getBoundingClientRect(), su = document.getElementById('fbxSuche').getBoundingClientRect();
    return { optionen: [...s.options].map(o=> o.textContent), q: q.length, eineReihe: Math.abs(r.top - r1.top) < 6, sucheDarunter: su.top > r.bottom - 2 }; });
  const alle = await n();
  await p.evaluate(()=> document.querySelector('[data-fbq="q4"]').click()); await p.waitForTimeout(600);
  const q4 = await n(), an = await p.evaluate(()=> document.querySelector('[data-fbq="q4"]').classList.contains('an'));
  await p.evaluate(()=> document.querySelector('[data-fbq="q4"]').click()); await p.waitForTimeout(600);
  const wieder = await n();
  await p.evaluate(()=>{ const s = document.getElementById('fbxJahr'); s.value = '__eigen'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(400);
  const eigen = await p.evaluate(()=> ({ sichtbar: !document.getElementById('fbxEigen').hidden, qWeg: [...document.querySelectorAll('[data-fbq]')].every(b=> b.hidden) }));
  await p.evaluate(()=>{ LS.set('fb_zeitraum', 'jahr'); });
  pr('Eine Reihe: Jahr-Liste (mit „Zeitraum …“) und Q1–Q4, Suche darunter', a.optionen.includes('Zeitraum …') && a.q === 4 && a.eineReihe && a.sucheDarunter, a);
  pr('Q4 anklicken filtert, nochmal anklicken = ganzes Jahr', an && q4 <= alle && wieder === alle, { alle, q4, wieder });
  pr('„Zeitraum …“ zeigt von/bis, Quartale ausgeblendet', eigen.sichtbar && eigen.qWeg, eigen);
  await p.context().close();
};
