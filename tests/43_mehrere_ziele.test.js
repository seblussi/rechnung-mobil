// Mehrere Ziele: beste Reihenfolge (Wunsch 21.11.2026). Ortssuche und Routendienst sind nachgebildet.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
const ORTE = { 'offenburg': [48.4721, 7.9437], 'kehl': [48.5726, 7.8156], 'willstätt': [48.5418, 7.8962], 'appenweier': [48.5394, 7.9799], 'oberkirch': [48.5316, 8.0791], 'gengenbach': [48.4043, 8.0162], 'hauptstraße 5, appenweier': [48.5401, 7.9812] };
const hav = (a, b)=>{ const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 1400 });
  const c = p.context(); const log = { suche: [], table: 0, route: 0 };
  await c.route(/nominatim\.openstreetmap\.org/, (r)=>{ const q = new URL(r.request().url()).searchParams.get('q') || ''; log.suche.push(q); const k = q.toLowerCase().trim(), g = ORTE[k];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(g ? [{ lat: String(g[0]), lon: String(g[1]), display_name: q + ', Ortenaukreis, Baden-Württemberg, Deutschland' }] : []) }); });
  await c.route(/router\.project-osrm\.org/, (r)=>{ const u = new URL(r.request().url()); const pts = u.pathname.split('/').pop().split(';').map((s)=> s.split(',').map(Number)).map(([lo, la])=> [la, lo]);
    const j = (o)=> r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if(/\/table\//.test(u.pathname)){ log.table++; return j({ code: 'Ok', durations: pts.map((a)=> pts.map((b)=> hav(a, b) * 1.3 / 60 * 3600)), distances: pts.map((a)=> pts.map((b)=> hav(a, b) * 1300)) }); }
    log.route++; let km = 0; for(let i = 1; i < pts.length; i++) km += hav(pts[i - 1], pts[i]) * 1.3;
    return j({ code: 'Ok', routes: [{ distance: km * 1000, duration: km / 60 * 3600, geometry: { type: 'LineString', coordinates: pts.map(([la, lo])=> [lo, la]) } }] }); });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.waitForTimeout(800); await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=> ansichtLuftlinienTool()); await p.waitForSelector('#btnTourPlanen');
  await p.evaluate(()=> document.getElementById('btnTourPlanen').click()); await p.waitForSelector('#tourZiele');
  await p.fill('#tourVonStr', ''); await p.fill('#tourVonOrt', 'Offenburg');
  await p.fill('#tourZiele', 'Oberkirch\nKehl\nHauptstraße 5, Appenweier\nWillstätt\nGibtsnicht');
  await p.evaluate(()=> document.getElementById('tourLos').click());
  await p.waitForFunction(()=> /nach Fahrzeit/.test((document.querySelector('.tour-kopf') || {}).textContent || ''), null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(()=> ({ liste: [...document.querySelectorAll('.tour-liste li > span:nth-child(2) b')].map((b)=> b.textContent), kopf: document.querySelector('.tour-kopf').textContent, fehlt: (document.querySelector('.tour-fehlt') || {}).textContent || '', nummern: document.querySelectorAll('.tour-karte .karte-fall.tour, .tour-karte .vk-fall.tour').length, maps: !document.querySelector('.tour-maps').disabled }));
  // kuerzeste Fahrzeit ab Offenburg (offenes Ende): Oberkirch -> Appenweier -> Willstaett -> Kehl
  pr('Reihenfolge nach Fahrzeit: Oberkirch, Appenweier, Willstätt, Kehl', JSON.stringify(r.liste) === JSON.stringify(['Offenburg', 'Oberkirch', 'Hauptstraße 5, Appenweier', 'Willstätt', 'Kehl']), r.liste);
  pr('Gesamt km und Fahrzeit, nicht gefundenes Ziel genannt', /gesamt [\d,]+ km · ca\. \d+ min/.test(r.kopf) && /Gibtsnicht/.test(r.fehlt), { kopf: r.kopf, fehlt: r.fehlt });
  pr('Karte mit nummerierten Zielen, Knopf Google Maps', r.nummern === 4 && r.maps, r);
  pr('Fahrzeiten mit einem Aufruf (Tabelle) und eine Route', log.table === 1 && log.route === 1, log);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/43_ziele.png', fullPage: true });
  const url = await p.evaluate(()=> tourMapsUrl([{ lat: 48.47, lon: 7.94 }, { lat: 48.53, lon: 8.08 }, { lat: 48.57, lon: 7.82 }]));
  pr('Google Maps: Start, Zwischenziel, Ziel', /origin=48\.47.*destination=48\.57.*waypoints=48\.53/.test(url), url);
  // zurück zum Start
  await p.check('#tourRueck'); await p.evaluate(()=> document.getElementById('tourLos').click());
  await p.waitForFunction(()=> /nach Fahrzeit/.test((document.querySelector('.tour-kopf') || {}).textContent || '') && /zurück zum Start/.test(document.querySelector('.tour-liste').textContent), null, { timeout: 30000 });
  pr('„zurück zum Start“: letzte Zeile ist der Rückweg', await p.evaluate(()=> /zurück zum Start/.test([...document.querySelectorAll('.tour-liste li')].pop().textContent)));
  // nur Luftlinie (Routendienst weg)
  await c.unroute(/router\.project-osrm\.org/); await c.route(/router\.project-osrm\.org/, (r)=> r.abort());
  await p.uncheck('#tourRueck'); await p.evaluate(()=> document.getElementById('tourLos').click());
  await p.waitForFunction(()=> /nicht verfügbar/.test((document.querySelector('.tour-kopf') || {}).textContent || ''), null, { timeout: 30000 });
  pr('Ohne Routendienst: Reihenfolge nach Luftlinie', await p.evaluate(()=> /nach Luftlinie/.test(document.querySelector('.tour-kopf').textContent) && document.querySelectorAll('.tour-liste li').length === 5));
  pr('Reihenfolge exakt (Test mit Matrix)', await p.evaluate(()=> JSON.stringify(tourReihenfolge([[0, 5, 1, 9], [5, 0, 2, 1], [1, 2, 0, 7], [9, 1, 7, 0]], false)) === '[0,2,1,3]'));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await c.close();
};
