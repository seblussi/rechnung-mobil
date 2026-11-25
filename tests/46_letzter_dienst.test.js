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
  const sofort = await p.evaluate(()=> ({ pfeile: !!document.querySelector('.ds-ring-block.pfeile'), links: !!document.querySelector('.ds-pfeil.links'), rechts: !!document.querySelector('.ds-pfeil.rechts'), sicht: getComputedStyle(document.querySelector('.ds-pfeil.links')).display !== 'none' }));
  pr('Klick auf „letzter Dienst“: Pfeile sofort da (ohne Wischen), neuester -> kein Pfeil nach rechts', sofort.pfeile && sofort.sicht && sofort.links && !sofort.rechts, sofort);
  await wisch(140);
  const nach = await p.evaluate(()=> ({ zeit: document.querySelector('.ds-ring-zeit').textContent, rechts: !!document.querySelector('.ds-pfeil.rechts'), dialog: !!document.querySelector('.beta-overlay.aktiv') }));
  pr('Wischen nach rechts: früherer Dienst, Dienstzeit groß (18:00–08:00), Pfeil nach rechts, kein Dialog', nach.zeit === '18:00–08:00' && nach.rechts && !nach.dialog, nach);
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
  // Fälle eines vergangenen Dienstes: auch LS/PT, deren Dienst-Schluessel nicht genau zur Fahrtenbuch-Zeit passt (Wunsch 25.11.2026)
  const fa = await p.evaluate(()=>{ const T = 86400000, d0 = new Date(); d0.setHours(0, 0, 0, 0); const tag = new Date(d0.getTime() - 4 * T); const iso = liveIso(tag);
    const ls = ladeFaelle('ls'); ls.push({ werte: { txtName: 'Lenient, Lea', txtDatumExcel: iso, txtZeitLS: '12:00', txtDienst: iso + '|06:00|15:00|Fahrdienst|1|', txtBetrag: '111,00' } }); speichereFaelle('ls', ls);
    const pt = ladeFaelle('pt'); pt.push({ werte: { txtName: 'Peter, Paul', txtDatumExcel: iso, txtZeitLS: '09:30', txtBetrag: '55,00' } }); speichereFaelle('pt', pt);
    dsDienstWahl = dsDienstListe().map(dsDienstSchluessel).find((k)=> k.startsWith(iso + ' 08:00')); const i = designDienstInfo(); const f = standortKarteFaelle(i);
    return { wahl: dsDienstWahl, namen: f.map((x)=> x.art + ':' + x.name) }; });
  pr('Vergangener Dienst: auch LS/PT-Fälle (Schlüssel weicht ab, Zeit passt)', fa.namen.includes('ls:Lenient, Lea') && fa.namen.includes('pt:Peter, Paul'), fa);
  // ohne Dienst: alle Fälle des letzten Dienstes bis 24 h nach Dienstende, auch wenn der Fall selbst älter als 24 h ist
  const oh = await p.evaluate(()=>{ dsDienstWahl = null; const jetzt = Date.now(), v = new Date(jetzt - 30 * 3600000), b = new Date(jetzt - 20 * 3600000), z = (d)=> zz2(d.getHours()) + ':' + zz2(d.getMinutes());
    LS.set('fb_dienste_cache', null); LS.set('live_dienst', null); LS.set('live_dienst_letzt', { datum: liveIso(v), von: z(v), bis: z(b), art: 'Fahrdienst', schicht: '', beendet: b.toISOString() });
    const t = new Date(jetzt - 29 * 3600000); const ls = ladeFaelle('ls'); ls.push({ werte: { txtName: 'Alt, Anna', txtDatumExcel: liveIso(t), txtZeitLS: z(t), txtBetrag: '80,00' } }); speichereFaelle('ls', ls);
    return standortKarteFaelle({ modus: 'leer', fenster: null }).map((x)=> x.name); });
  pr('Ohne Dienst: Fall des letzten Dienstes (29 h alt, Dienstende vor 20 h) wird gezeigt', oh.includes('Alt, Anna'), oh);
  // Reiter „Letzte Dienste“ im Fahrtenbuch
  await p.evaluate(()=>{ const T = 86400000, h = (tage, std)=>{ const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - tage * T + std * 3600000; };
    LS.set('fb_dienste_cache', { dienste: [{ von: h(4, 8), bis: h(4, 18), art: 'Fahrdienst 1' }, { von: h(3, 18), bis: h(2, 8), art: 'Fahrdienst 3' }] }); ansichtFahrtenbuch(); });
  await p.waitForSelector('[data-fbtab="letzte"]');
  const reiter = await p.evaluate(()=> [...document.querySelectorAll('.fbx-tabs button')].map((b)=> b.textContent));
  await p.evaluate(()=> document.querySelector('[data-fbtab="letzte"]').click()); await p.waitForTimeout(1200);
  const fb = await p.evaluate(()=> ({ ring: !!document.querySelector('.fb-letzte .ds-ring-block'), pfeile: !!document.querySelector('.fb-letzte .ds-ring-block.pfeile .ds-pfeil.links'), karte: !!document.getElementById('skKarte'), an: (document.querySelector('.fbx-tabs .an') || {}).textContent }));
  pr('Fahrtenbuch: Reiter „Letzte Dienste“ vor „Dienste/Quartale“, Uhr mit Pfeilen und Karte', reiter[0] === 'Letzte Dienste' && reiter[1] === 'Dienste' && fb.ring && fb.pfeile && fb.karte && fb.an === 'Letzte Dienste', { reiter, fb });
  const zf0 = await p.evaluate(()=> document.querySelector('.ds-schicht small').textContent);
  await p.evaluate(()=> document.querySelector('.ds-pfeil.links').click()); await p.waitForTimeout(1000);
  const zf1 = await p.evaluate(()=> ({ zeit: (document.querySelector('.ds-schicht small') || {}).textContent, imFb: !!document.querySelector('.fb-letzte'), titel: document.querySelector('.fbx-tabs .an') && document.querySelector('.fbx-tabs .an').textContent }));
  pr('Pfeil im Reiter: früherer Dienst, bleibt im Fahrtenbuch', zf1.imFb && zf1.zeit !== zf0 && zf1.titel === 'Letzte Dienste', { zf0, zf1 });
  await p.evaluate(()=> ansichtStart()); await p.waitForTimeout(800);
  pr('Zurück zur Startseite: wieder der aktuelle Stand (nichts unscharf)', await p.evaluate(()=> !document.getElementById('app').classList.contains('ds-vergangen') && dsDienstWahl === null));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
