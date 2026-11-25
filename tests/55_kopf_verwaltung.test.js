// Wünsche 25.11.2026: Überschrift genau mittig; Rechnungsverwaltung ohne Knopfleiste, Kontoauszug bei „Offene Rechnungen“;
// GKV-Liste zeigt gleich so viele Fälle wie PT/LS (bis 200)
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  const mitte = ()=> p.evaluate(()=>{ const e = document.getElementById('titel'), r = e.getBoundingClientRect(); return { m: Math.round((r.left + r.right) / 2), ab: e.scrollWidth > e.clientWidth + 1, frei: e.classList.contains('frei') }; });
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(800);
  const a = await mitte();
  await p.evaluate(async ()=>{ await ansichtRechnungenGesamt(false); }); await p.waitForTimeout(2500);
  const b = await mitte();
  pr('Überschrift genau mittig (Start und Rechnungsverwaltung), nicht abgeschnitten', Math.abs(a.m - 206) <= 1 && Math.abs(b.m - 206) <= 1 && !a.ab && !b.ab && !b.frei, { a, b });
  const v = await p.evaluate(()=> ({ neu: !!document.getElementById('btnGesamtNeu'), excel: !!document.getElementById('btnGesamtExcel'), bankAlt: !!document.getElementById('btnGesamtBank'), bank: !!document.querySelector('.offen-dash #btnOffenBank') }));
  pr('Keine Leiste „Neu laden/Excel/Kontoauszug“; Kontoauszug bei „Offene Rechnungen“', !v.neu && !v.excel && !v.bankAlt && v.bank, v);
  await p.evaluate(()=> ansichtGkvVerwaltung()); await p.waitForTimeout(5000);
  const g = await p.evaluate(()=> ({ n: document.querySelectorAll('#gvListe .gv-fall').length, lokal: gkvFaelleLaden().length }));
  pr('GKV: gleich bis zu 200 Fälle (Gerät + Fahrtenbuch), nicht nur 25', g.n > 25 && g.n <= 200, g);
  await p.context().close();
};
