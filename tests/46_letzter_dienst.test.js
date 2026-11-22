// „Letzter Dienst“ und Blättern (Wunsch 22.11.2026): kleine Ecke rechts neben „Neuen Dienst starten“ zeigt den zuletzt beendeten
// Dienst wie zum Dienstende (ohne Unschärfe). Wischen über die Uhr zeigt Pfeile; erst weiter zurück wird die Umgebung unscharf
// und die Uhr zeigt die Dienstzeit groß.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 1300 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const start = async ()=>{ await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(1200);
    await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); }); };
  const unscharf = ()=> p.evaluate(()=>{ const f = (sel)=>{ const e = document.querySelector(sel); return e ? getComputedStyle(e).filter : 'none'; };
    return { app: document.getElementById('app').classList.contains('ds-vergangen'), kacheln: f('.kachelreihe'), start: f('#dsDienstStart'), aus: f('#dsLetzter'), uhr: f('.ds-ring-block'), dz: f('.ds-dz'), karte: f('.ds-live .sk-karte') }; });
  // ein Dienst von gestern, 13 h nach Ende abgelaufen -> wird als „letzter“ gemerkt
  await p.evaluate(()=>{ LS.set('live_auto', false); const g = new Date(Date.now() - 30 * 3600000); LS.set('live_dienst', { datum: liveIso(g), von: '08:00', bis: '18:00', art: 'Fahrdienst', schicht: '2' }); LS.set('fb_dienste_cache', null); liveDienstLaden(); });
  await start();
  const a = await p.evaluate(()=> ({ ring: !!document.getElementById('dsRing'), knopf: !!document.getElementById('dsLetzter'), neben: (()=>{ const s = document.getElementById('dsDienstStart').getBoundingClientRect(), l = document.getElementById('dsLetzter').getBoundingClientRect(); return Math.abs(s.top - l.top) < 4 && l.left > s.right && l.width < 90; })(), gemerkt: !!LS.get('live_dienst_letzt', null) }));
  pr('Kein Dienst: keine Uhr, Ecke „letzter Dienst“ rechts neben „Neuen Dienst starten“', !a.ring && a.knopf && a.neben && a.gemerkt, a);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/46_ecke.png' });
  await p.evaluate(()=> document.getElementById('dsLetzter').click()); await p.waitForTimeout(1000);
  const b = await p.evaluate(()=> ({ ring: !!document.getElementById('dsRing'), modus: designDienstInfo().modus, titel: (document.querySelector('.ds-dz') || {}).textContent || '', knopf: (document.getElementById('dsLetzter') || {}).textContent, fuer: !!liveDienstFuer(new Date()), uhr: !!document.getElementById('dsUhr') }));
  pr('Klick: Uhr und Übersicht des letzten Dienstes wie zum Dienstende (Uhrzeit, „Dienst beendet“)', b.ring && b.modus === 'vorbei' && /Dienst beendet/.test(b.titel) && /08:00–18:00/.test(b.titel) && /ausblenden/.test(b.knopf) && b.uhr, b);
  pr('Neue Fälle hängen sich nicht an den letzten Dienst', !b.fuer);
  const u0 = await unscharf();
  pr('Neuester (zuletzt beendeter) Dienst: nichts unscharf', !u0.app && !/blur/.test(u0.kacheln) && !/blur/.test(u0.start), u0);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/46_letzter.png' });
  await p.evaluate(()=> document.getElementById('dsLetzter').click()); await p.waitForTimeout(800);
  pr('Nochmal: wieder ausgeblendet', await p.evaluate(()=> !document.getElementById('dsRing') && /letzter Dienst/.test(document.getElementById('dsLetzter').textContent)));

  // Blättern: zwei frühere Dienste aus dem Fahrtenbuch
  await p.evaluate(()=>{ const T = 86400000, h = (tage, std)=>{ const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - tage * T + std * 3600000; };
    LS.set('fb_dienste_cache', { dienste: [{ von: h(4, 8), bis: h(4, 18), art: 'Fahrdienst 1' }, { von: h(3, 18), bis: h(2, 8), art: 'Fahrdienst 3' }] }); });
  await start();
  await p.evaluate(()=> document.getElementById('dsLetzter').click()); await p.waitForTimeout(1000);
  const kn = await p.locator('.ds-ring-block').boundingBox();
  const wisch = async (dx)=>{ await p.mouse.move(kn.x + kn.width / 2 - dx / 2, kn.y + kn.height / 2); await p.mouse.down(); await p.mouse.move(kn.x + kn.width / 2 + dx / 2, kn.y + kn.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(900); };
  const zeit = ()=> p.evaluate(()=> (document.querySelector('.ds-ring-zeit') || {}).textContent);
  const vorWisch = await p.evaluate(()=> !document.querySelector('.ds-ring-block.pfeile'));
  const z0 = await zeit();
  await wisch(140);
  const erst = await p.evaluate(()=> ({ pfeile: !!document.querySelector('.ds-ring-block.pfeile'), links: !!document.querySelector('.ds-pfeil.links'), rechts: !!document.querySelector('.ds-pfeil.rechts'), sicht: getComputedStyle(document.querySelector('.ds-pfeil.links')).display !== 'none', zeit: document.querySelector('.ds-ring-zeit').textContent, dialog: !!document.querySelector('.beta-overlay.aktiv') }));
  pr('Erstes Wischen: nur die Pfeile, kein Sprung; neuester Dienst -> kein Pfeil nach rechts', vorWisch && erst.pfeile && erst.sicht && erst.links && !erst.rechts && erst.zeit === z0 && !erst.dialog, erst);
  await wisch(140);
  const nach = await p.evaluate(()=> ({ zeit: document.querySelector('.ds-ring-zeit').textContent, rechts: !!document.querySelector('.ds-pfeil.rechts') }));
  pr('Zweites Wischen: früherer Dienst, Dienstzeit groß (18:00–08:00), jetzt auch Pfeil nach rechts', nach.zeit === '18:00–08:00' && nach.rechts, nach);
  const u1 = await unscharf();
  pr('Weiter zurück: Umgebung unscharf; Uhr, Übersicht, Karte, „ausblenden“ scharf', u1.app && /blur/.test(u1.kacheln) && /blur/.test(u1.start) && !/blur/.test(u1.aus) && !/blur/.test(u1.uhr) && !/blur/.test(u1.dz) && !/blur/.test(u1.karte), u1);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/46_blaettern.png' });
  await p.evaluate(()=> document.querySelector('.ds-pfeil.links').click()); await p.waitForTimeout(800);
  const z1 = await zeit(), linksAus = await p.evaluate(()=> !document.querySelector('.ds-pfeil.links'));
  pr('‹: noch früher (08:00–18:00), ältester -> kein Pfeil ‹', z1 === '08:00–18:00' && linksAus, { z1, linksAus });
  await p.evaluate(()=> document.querySelector('.ds-pfeil.rechts').click()); await p.waitForTimeout(800);
  await p.evaluate(()=> document.querySelector('.ds-pfeil.rechts').click()); await p.waitForTimeout(800);
  const z3 = await p.evaluate(()=> ({ uhr: !!document.getElementById('dsUhr'), rechtsAus: !document.querySelector('.ds-pfeil.rechts'), unscharf: document.getElementById('app').classList.contains('ds-vergangen') }));
  pr('› zweimal: wieder beim letzten Dienst – Uhrzeit, nicht unscharf, kein Pfeil ›', z3.uhr && z3.rechtsAus && !z3.unscharf, z3);
  // Tipp ins Unscharfe: zurück
  await p.evaluate(()=> document.querySelector('.ds-pfeil.links').click()); await p.waitForTimeout(800);
  await p.mouse.click(200, (await p.locator('.kachelreihe').boundingBox()).y + 20); await p.waitForTimeout(900);
  pr('Tipp auf die unscharfen Kacheln: zurück, nichts geöffnet', await p.evaluate(()=> !document.getElementById('app').classList.contains('ds-vergangen') && !document.getElementById('dsRing') && !!document.querySelector('.kachelreihe')));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
