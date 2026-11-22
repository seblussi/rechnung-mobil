// L11: Updates über den Service Worker. Eine neue Version wird nur übernommen, wenn sie vollständig und unverändert
// geladen wurde (Prüfsummen); bis dahin läuft die alte weiter -- auch offline. Umgeschaltet wird über den Hinweis
// „Update verfügbar“ bzw. direkt nach dem Start. Eigener kleiner Server, der wie bei einer Veröffentlichung die
// Dateien austauscht (Seite mit neuer Versionsnummer, CSP und Prüfsummen jeweils neu erzeugt).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const WURZEL = path.resolve(__dirname, '..'), SEITE = 'Rechnungserfassung_Mobil.html';
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
// Eine "Veröffentlichung" bauen: Seite mit neuer Versionsnummer + CSP, sw.js mit neuem Cache-Namen + Prüfsummen
function version(nr, stoerung){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'update-test-')), datei = path.join(tmp, SEITE);
  fs.writeFileSync(datei, fs.readFileSync(path.join(WURZEL, SEITE), 'utf8').replace(/const APP_VERSION = 'v\d+';/, "const APP_VERSION = 'v" + nr + "';"));
  execFileSync('python3', [path.join(WURZEL, 'werkzeuge', 'csp_aktualisieren.py'), datei, 'x'], { stdio: 'pipe' });
  const seite = fs.readFileSync(datei); fs.rmSync(tmp, { recursive: true, force: true });
  const ueber = new Map([[SEITE, seite]]);
  const inhalt = (k)=>{ const p = k === './' ? 'index.html' : k.slice(2); return ueber.has(p) ? ueber.get(p) : fs.readFileSync(path.join(WURZEL, p)); };
  let sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8').replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'update-test-" + nr + "';");
  sw = sw.replace(/'(\.\/[^']*)'\s*:\s*'[^']*'/g, (_, k)=> "'" + k + "': '" + crypto.createHash('sha256').update(inhalt(k)).digest('base64') + "'");
  ueber.set('sw.js', Buffer.from(sw));
  if(stoerung === 'veraendert') ueber.set('lokal/krypto.js', Buffer.concat([fs.readFileSync(path.join(WURZEL, 'lokal/krypto.js')), Buffer.from('\n// nachträglich verändert\n')]));
  if(stoerung === 'fehlt') ueber.set('goae_katalog.js', null);
  return ueber;
}
// Der Service Worker, wie er bis zu dieser Umstellung im Einsatz war (verkürzt): fehlende Dateien wurden geduldet,
// die neue Fassung sofort aktiv, die Seite immer zuerst aus dem Netz geladen.
const ALTER_SW = `const CACHE_NAME = 'update-test-9010';
const NETZWERK_ZUERST = ['./Rechnungserfassung_Mobil.html', './manifest.json', './'];
const CACHE_ZUERST = ['./lib/jszip.min.js', './icd_katalog.js', './goae_katalog.js'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all([...NETZWERK_ZUERST, ...CACHE_ZUERST].map((pfad) => cache.add(pfad).catch(() => null))))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
const URLS = NETZWERK_ZUERST.map((pfad) => new URL(pfad, self.location.href).href);
self.addEventListener('fetch', (event) => {
  const anfrage = event.request, url = anfrage.url; if (anfrage.method !== 'GET') return;
  if (URLS.includes(url.split('#')[0].split('?')[0])) { event.respondWith(fetch(anfrage).then((antwort) => { if (antwort && antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(anfrage, kopie)).catch(() => {}); } return antwort; }).catch(() => caches.match(anfrage, { ignoreSearch: true }))); return; }
  event.respondWith(caches.match(anfrage).then((cached) => cached || fetch(anfrage).then((antwort) => { if (antwort && antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(anfrage, kopie)).catch(() => {}); } return antwort; })));
});
`;
module.exports = async ({ browser, pr })=>{
  let ueber = version(9001);
  const server = await new Promise((ok)=>{ const s = http.createServer((q, a)=>{
    let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, ''); if(p === '' || p.endsWith('/')) p += 'index.html';
    const send = (d)=>{ a.writeHead(200, { 'Content-Type': TYP[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); a.end(d); };
    if(ueber.has(p)){ const d = ueber.get(p); if(d === null){ a.writeHead(404); return a.end(); } return send(d); }
    const datei = path.join(WURZEL, path.normalize(p)); if(!datei.startsWith(WURZEL + path.sep)){ a.writeHead(403); return a.end(); }
    fs.readFile(datei, (f, d)=>{ if(f){ a.writeHead(404); return a.end(); } send(d); }); });
    s.listen(0, '127.0.0.1', ()=> ok(s)); });
  const basis = 'http://localhost:' + server.address().port + '/';
  const c = await browser.newContext({ viewport: { width: 400, height: 850 } });   // Service Worker hier ausdrücklich erlaubt
  await c.route((url)=> !String(url).startsWith(basis), (r)=> r.abort());
  // "bedient" verlässlich nachstellen: Tastendruck gleich beim Laden, wenn der Test es verlangt (sonst Wettlauf mit dem Update)
  // "entsperrt" nachstellen (Tresor offen), ohne Passwort: Tresor.offen() meldet true, wenn der Test es verlangt
  await c.addInitScript(()=>{ try{ if(sessionStorage.getItem('test_entsperrt')){ let T; Object.defineProperty(window, 'Tresor', { configurable: true, get(){ return T; }, set(v){ T = v; try{ v.offen = ()=> true; }catch(_){ } } }); } }catch(_){} });
  // „in Arbeit“: ein Feld mit Text hat den Fokus (seit 22.11.2026 entscheidet das, nicht mehr ob schon getippt wurde)
  await c.addInitScript(()=>{ try{ if(sessionStorage.getItem('test_bedient')){ document.addEventListener('DOMContentLoaded', ()=>{ const i = document.createElement('input'); i.id = 'testBedient'; i.value = 'in Arbeit'; document.body.appendChild(i); i.focus(); const iv = setInterval(()=>{ if(document.activeElement !== i && !document.getElementById('updateHinweis')) i.focus(); }, 50); setTimeout(()=> clearInterval(iv), 3500); }); } }catch(_){} });
  const p = await c.newPage(); const fehler = [];
  const bedient = (an)=> p.evaluate((an)=>{ if(an) sessionStorage.setItem('test_bedient', '1'); else sessionStorage.removeItem('test_bedient'); }, an); p.on('pageerror', (e)=> fehler.push(String(e.message).slice(0, 160)));
  const stand = ()=> p.evaluate(async ()=>({
    seite: (document.documentElement.outerHTML.match(/const APP_VERSION = '(v\d+)'/) || [])[1] || null,
    skripte: typeof Krypto !== 'undefined' || typeof LS !== 'undefined' || typeof Speicher !== 'undefined',
    caches: (await caches.keys()).filter((n)=> n.startsWith('update-test-')).sort(), wartet: !!((await navigator.serviceWorker.getRegistration()) || {}).waiting,
    gesteuert: !!navigator.serviceWorker.controller, hinweis: (document.getElementById('updateHinweis') || {}).textContent || null }));
  const laden = async ()=>{ await p.goto(basis + SEITE).catch(()=> p.reload()); await p.waitForLoadState('load'); };
  const eintraege = (name)=> p.evaluate(async (n)=> (await (await caches.open(n)).keys()).length, name);
  const soll = (fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8').match(/'\.\/[^']*'\s*:/g) || []).length;
  try{
    // ---- 1. erste Installation ----
    await laden(); await p.waitForFunction(()=> !!navigator.serviceWorker.controller, null, { timeout: 60000 });
    let s = await stand();
    pr('erste Installation: Service Worker aktiv, Version vollständig im Cache (' + soll + ' Dateien)', s.seite === 'v9001' && s.caches.join() === 'update-test-9001' && await eintraege('update-test-9001') >= soll, s);
    await c.setOffline(true); await p.reload(); await p.waitForLoadState('load'); await p.waitForTimeout(1500); s = await stand();
    pr('offline: App startet vollständig aus dem Cache', s.seite === 'v9001' && s.skripte === true, s);
    await c.setOffline(false);
    // ---- 2. neue Version: wartet, Hinweis, Umschalten auf Klick ----
    await p.evaluate(async ()=>{ const k = await caches.open('offline-karte-test'); await k.put('/kachel', new Response('Kartendaten')); });   // Cache der App selbst
    ueber = version(9002);
    await bedient(true); await laden();   // schon bedient -> kein stilles Umschalten, sondern Hinweis
    const vorKlick = await stand();
    await p.waitForSelector('#updateHinweis', { timeout: 60000 }); s = await stand();
    pr('neue Version: bis zum Umschalten läuft die alte weiter', vorKlick.seite === 'v9001' && s.seite === 'v9001' && s.wartet === true, s);
    pr('Hinweis „Update verfügbar“ erscheint', /Update verfügbar/.test(s.hinweis || ''), s.hinweis);
    if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/update_hinweis.png' });
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.evaluate(()=> document.getElementById('updateJetzt').click())]); await p.waitForLoadState('load'); await p.waitForTimeout(800); s = await stand();
    pr('eigene Caches der App (Offline-Karte) überstehen das Update', await p.evaluate(async ()=>{ const r = await (await caches.open('offline-karte-test')).match('/kachel'); return !!r && (await r.text()) === 'Kartendaten'; }));
    pr('nach dem Klick: neue Version aktiv, alter Cache gelöscht', s.seite === 'v9002' && s.caches.join() === 'update-test-9002' && s.wartet === false, s);
    // ---- 3. neue Version direkt nach dem Start (nichts bedient): schaltet von selbst um ----
    ueber = version(9003);
    await bedient(false); await laden().catch(()=>{});
    for(let i = 0; i < 120; i++){   // die Seite lädt dabei von selbst neu -> geduldig abfragen
      await p.waitForTimeout(500);
      const z = await p.evaluate(async ()=>({ c: (await caches.keys()).filter((n)=> n.startsWith('update-test-')).join(), neu: /const APP_VERSION = 'v9003'/.test(document.documentElement.outerHTML), knopf: !!document.getElementById('updateJetzt') })).catch(()=> null);
      if(!z) continue;
      if(z.neu && z.c === 'update-test-9003') break;
      if(z.knopf) await p.evaluate(()=> document.getElementById('updateJetzt').click()).catch(()=>{});   // langsamer Rechner: Hinweis statt stillem Umschalten
    }
    await p.waitForLoadState('load').catch(()=>{}); await p.waitForTimeout(800); s = await stand();
    pr('direkt nach dem Start: neue Version wird übernommen', s.seite === 'v9003' && s.caches.join() === 'update-test-9003', s);
    // ---- 4. beschädigte Veröffentlichung: eine Datei passt nicht zur Prüfsumme ----
    ueber = version(9004, 'veraendert');
    await laden(); await p.waitForTimeout(7000); s = await stand();
    pr('veränderte Datei: Update wird NICHT übernommen, alte Version bleibt vollständig', s.seite === 'v9003' && s.wartet === false && s.hinweis === null && s.caches.join() === 'update-test-9003', s);
    // ---- 5. unvollständige Veröffentlichung: eine Datei fehlt ----
    ueber = version(9005, 'fehlt');
    await laden(); await p.waitForTimeout(7000); s = await stand();
    pr('fehlende Datei: Update wird NICHT übernommen', s.seite === 'v9003' && s.wartet === false && s.caches.join() === 'update-test-9003', s);
    await c.setOffline(true); await p.reload(); await p.waitForLoadState('load'); await p.waitForTimeout(1500); s = await stand();
    pr('danach offline: alte Version startet weiterhin vollständig', s.seite === 'v9003' && s.skripte === true, s);
    await c.setOffline(false);
    // ---- 6. die heile Folgeversion kommt wieder an ----
    ueber = version(9006);
    await bedient(true); await laden(); await p.waitForSelector('#updateHinweis', { timeout: 60000 });
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.evaluate(()=> document.getElementById('updateJetzt').click())]); await p.waitForLoadState('load'); await p.waitForTimeout(800); s = await stand();
    pr('nächste heile Version wird wieder übernommen', s.seite === 'v9006' && s.caches.join() === 'update-test-9006', s);
    // ---- 6b. App entsperrt (Wunsch 22.11.2026): Update sofort, ausser es wird gerade etwas eingegeben ----
    await p.evaluate(()=> sessionStorage.setItem('test_entsperrt', '1')); await bedient(false);
    await laden(); await p.waitForTimeout(500);
    // Eingabe laeuft: Feld mit Text hat den Fokus
    await p.evaluate(()=>{ const i = document.createElement('input'); i.id = 'testEingabe'; i.value = 'halb getippt'; document.body.appendChild(i); i.focus(); });
    ueber = version(9007);
    await p.evaluate(async ()=> (await navigator.serviceWorker.getRegistration()).update());
    await p.waitForSelector('#updateHinweis', { timeout: 60000 }); await p.waitForTimeout(4000); s = await stand();
    pr('entsperrt, Eingabe läuft: kein Neuladen, Hinweis', s.seite === 'v9006' && s.wartet === true && /Eingabe fertig/.test(s.hinweis || ''), s);
    // Eingabe fertig (Feld verlassen) -> laedt von selbst
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.evaluate(()=> document.getElementById('testEingabe').blur())]); await p.waitForLoadState('load'); await p.waitForTimeout(800);
    s = await stand();
    pr('Eingabe fertig: Update wird sofort übernommen', s.seite === 'v9007' && s.caches.join() === 'update-test-9007', s);
    // entsperrt, nichts in Arbeit: sofort
    ueber = version(9008);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.evaluate(async ()=> (await navigator.serviceWorker.getRegistration()).update())]); await p.waitForLoadState('load'); await p.waitForTimeout(800);
    await p.evaluate(()=> sessionStorage.removeItem('test_entsperrt')); s = await stand();
    pr('entsperrt, nichts in Arbeit: Update sofort (auch wenn schon bedient)', s.seite === 'v9008' && s.caches.join() === 'update-test-9008', s);
    pr('keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3));
    // ---- 7. Umstieg vom bisherigen Service Worker (bis v470 / v432: lud die Seite immer zuerst aus dem Netz) ----
    await c.close();
    const c2 = await browser.newContext({ viewport: { width: 400, height: 850 } }); await c2.route((url)=> !String(url).startsWith(basis), (r)=> r.abort());
    const q = await c2.newPage(); const fehler2 = []; q.on('pageerror', (e)=> fehler2.push(String(e.message).slice(0, 160)));
    ueber = version(9010); ueber.set('sw.js', Buffer.from(ALTER_SW));
    await q.goto(basis + SEITE); await q.waitForFunction(()=> !!navigator.serviceWorker.controller, null, { timeout: 60000 });
    const vor = await q.evaluate(async ()=> (await caches.keys()).filter((n)=> n.startsWith('update-test-')).join());
    ueber = version(9011);
    await q.goto(basis + SEITE).catch(()=>{});
    // die Seite lädt beim Umschalten von selbst neu -> geduldig abfragen statt in der Seite zu warten
    for(let i = 0; i < 120; i++){
      await q.waitForTimeout(500);
      const z = await q.evaluate(async ()=>({ c: (await caches.keys()).filter((n)=> n.startsWith('update-test-')).join(), knopf: !!document.getElementById('updateJetzt') })).catch(()=> null);
      if(!z) continue;
      if(z.c === 'update-test-9011' && !z.knopf) break;
      if(z.knopf) await q.evaluate(()=> document.getElementById('updateJetzt').click()).catch(()=>{});
    }
    await q.waitForLoadState('load').catch(()=>{}); await q.waitForTimeout(1500);
    await c2.setOffline(true); await q.reload(); await q.waitForLoadState('load'); await q.waitForTimeout(1500);
    const nach = await q.evaluate(async ()=>({ seite: (document.documentElement.outerHTML.match(/const APP_VERSION = '(v\d+)'/) || [])[1], skripte: typeof Krypto !== 'undefined' || typeof LS !== 'undefined' || typeof Speicher !== 'undefined', caches: (await caches.keys()).filter((n)=> n.startsWith('update-test-')).join() }));
    pr('Umstieg vom bisherigen Service Worker: neue Version übernommen, alter Cache weg, startet offline', vor === 'update-test-9010' && nach.seite === 'v9011' && nach.skripte === true && nach.caches === 'update-test-9011', { vor, nach });
    pr('Umstieg: keine Skriptfehler', fehler2.length === 0, fehler2.slice(0, 3));
    await c2.close();
  } finally { await c.close().catch(()=>{}); server.close(); }
};
