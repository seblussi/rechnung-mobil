// Startseite, laufender Dienst (Wunsch 21.11.2026): kleinere Kästen, „Gesamt“ zwischen LS und €/h, GKV/PT/LS in ihren Farben;
// in der Uhr die laufende Gesamtsumme aller Fälle.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 360, height: 1300 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(3000);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.waitForSelector('.ds-zahlen');
  const r = await p.evaluate(()=>{ const e = document.querySelector('.ds-dz .ds-zahlen'), k = [...e.children];
    const zahl = (s)=> Number(String(s).replace(/\./g, '').replace(',', '.'));
    const w = Object.fromEntries(k.map((x)=> [x.firstElementChild.textContent.split(' ')[0], x.querySelector('b').textContent]));
    const anz = Object.fromEntries(k.map((x)=> [x.firstElementChild.textContent.split(' ')[0], (x.querySelector('.z-anz') || {}).textContent || null]));
    const fl = standortKarteFaelle(designDienstInfo()); const soll = (a)=> String(fl.filter((f)=> f.art === a && !f.sammel).length);
    const farbe = (c)=> getComputedStyle(e.querySelector(c)).backgroundColor;
    return { anz, soll: { gkv: soll('gkv'), pt: soll('pt'), ls: soll('ls') }, titel: k.map((x)=> x.firstElementChild.textContent.split(' ')[0]), w, summe: Math.round((zahl(w.GKV) + zahl(w.PT) + zahl(w.LS)) * 100) / 100, gesamt: zahl(w.Gesamt),
      ueber: k.some((x)=> x.querySelector('b').scrollWidth > x.querySelector('b').clientWidth + 1), breiten: k.map((x)=> [x.querySelector('b').scrollWidth, x.querySelector('b').clientWidth, x.querySelector('b').textContent]), hoehe: k[0].getBoundingClientRect().height,
      farben: [farbe('.z-gkv'), farbe('.z-pt'), farbe('.z-ls'), farbe('.z-sum')], ring: (document.querySelector('.ds-ring-summen') || {}).textContent || '' }; });
  pr('Kästen: GKV, PT, LS, Gesamt, €/h (kein eigener Kasten „Fälle“)', JSON.stringify(r.titel.slice(0, 4)) === JSON.stringify(['GKV', 'PT', 'LS', 'Gesamt']) && (r.titel.length === 4 || r.titel[4] === '€/h'), r.titel);
  pr('Anzahl der Fälle je Art im Kasten', parseInt(r.anz.GKV) === +r.soll.gkv && r.anz.PT === r.soll.pt && r.anz.LS === r.soll.ls, { anz: r.anz, soll: r.soll });
  pr('Gesamt = GKV + PT + LS (' + r.gesamt + ')', Math.abs(r.summe - r.gesamt) < 0.02, r.w);
  pr('Kleine Kästen, nichts abgeschnitten (360 px breit)', !r.ueber && r.hoehe < 46, { hoehe: r.hoehe, b: r.breiten });
  pr('GKV/PT/LS dezent eingefärbt, verschieden', new Set(r.farben.slice(0, 3)).size === 3 && r.farben[3] !== r.farben[0], r.farben);
  pr('Uhr: „Σ … €“ = Gesamtsumme', r.ring.indexOf('Σ ' + Math.round(r.gesamt).toLocaleString('de-DE') + ' €') >= 0, r.ring);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
