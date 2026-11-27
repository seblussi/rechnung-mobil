// Wunsch 27.11.2026: abgeschnittene Namen nach links schieben (schnappt zurueck); „unfertig“ rechts; GKV „ohne Dienst“; Info nur Anzahl
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const n = [...document.querySelectorAll('button')].find(b=> /Nein, danke/.test(b.textContent)); if(n) n.click(); });
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); betaEntwurfSpeichern({ id: 'e1', art: 'ls', am: new Date().toISOString(), werte: { txtName: 'Langnamige-Musterfrau von Hohenzollern-Sigmaringen, Wilhelmine', txtDatumExcel: '27.11.2026' } }); });
  await p.evaluate(async ()=>{ await ansichtRechnungenGesamt(false); }); await p.waitForTimeout(2500);
  const info = await p.evaluate(()=>{ const n = document.querySelector('.fall-zeile.unfertig .name'); const r = n.getBoundingClientRect();
    return { x: r.left + 120, y: r.top + r.height / 2, rechts: (n.closest('.fall-zeile').querySelector('.uf-rechts') || {}).textContent || '', alt: /anklicken zum Weitermachen/.test(document.body.innerHTML) }; });
  pr('Unfertig: nur „unfertig“ rechts', info.rechts === 'unfertig' && !info.alt, info);
  const cdp = await p.context().newCDPSession(p);
  const tp = (type, x)=> cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: info.y }] });
  await tp('touchStart', info.x); for(let i = 1; i <= 10; i++){ await tp('touchMove', info.x - i * 25); await p.waitForTimeout(20); }
  const mitte = await p.evaluate(()=>{ const n = document.querySelector('.fall-zeile.unfertig .name'); return { s: n.scrollLeft, tr: n.closest('.fall-zeile').style.transform || '' }; });
  await tp('touchEnd'); await p.waitForTimeout(700);
  const nach = await p.evaluate(()=> ({ s: document.querySelector('.fall-zeile.unfertig .name').scrollLeft, liste: !!document.getElementById('gesamtListe') }));
  pr('Abgeschnittener Name lässt sich nach links schieben, ohne die Zeile zu wischen', mitte.s > 100 && !/translate/.test(mitte.tr), mitte);
  pr('Beim Loslassen schnappt der Name zurück, nichts wird geöffnet', nach.s === 0 && nach.liste, nach);
  const g = await p.evaluate(async ()=>{ ansichtGkvVerwaltung(); await new Promise(r=> setTimeout(r, 2500));
    const L = document.getElementById('gvListe'), i = L.querySelector('.gv-info'), kinder = [...L.children];
    const pos = i ? kinder.indexOf(i) : -1, nachUnfertig = kinder.slice(0, pos).every(k=> k.matches('.gesamt-abschnitt, .wisch-huelle'));
    return { info: i ? i.textContent : '', pos, nachUnfertig, html: L.innerHTML }; });
  pr('GKV: Info nur „… noch nicht im Fahrtenbuch“, unter „Unfertig“ über den fertigen Fällen', /^\d+ noch nicht im Fahrtenbuch$/.test(g.info.trim()) && g.pos >= 0 && g.nachUnfertig, { info: g.info, pos: g.pos, nachUnfertig: g.nachUnfertig });
  pr('GKV: statt „offen“ steht „ohne Dienst“ bzw. „nicht eingetragen“', !/>offen</.test(g.html) && /(ohne Dienst|nicht eingetragen)</.test(g.html));
  await p.context().close();
};
