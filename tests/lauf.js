// Prüflauf im echten Browser: startet einen kleinen Dateiserver für diesen Ordner, öffnet die App in Chromium
// (Playwright) und führt alle tests/*.test.js nacheinander aus. Kein Test geht ins Internet; OneDrive wird nachgebildet.
//
//   einmalig:  npm install --no-save playwright@1.63.0 && npx playwright install chromium
//   Aufruf:    node tests/lauf.js            alle Tests
//              node tests/lauf.js abgleich   nur Dateien, deren Name "abgleich" enthält
//              AUSFUEHRLICH=1 node tests/lauf.js   auch bei bestandenen Prüfungen die Einzelheiten zeigen
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.resolve(__dirname, '..');
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.ini': 'text/plain' };
function server(){
  return new Promise((ok)=>{
    const s = http.createServer((anfrage, antwort)=>{
      let p; try{ p = decodeURIComponent(anfrage.url.split('?')[0]); }catch(_){ antwort.writeHead(400); return antwort.end(); }
      if(p.endsWith('/')) p += 'index.html';
      const datei = path.join(WURZEL, path.normalize(p));
      if(datei !== WURZEL && !datei.startsWith(WURZEL + path.sep)){ antwort.writeHead(403); return antwort.end(); }
      fs.readFile(datei, (fehler, daten)=>{
        if(fehler){ antwort.writeHead(404); return antwort.end('nicht gefunden'); }
        antwort.writeHead(200, { 'Content-Type': TYP[path.extname(datei).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        antwort.end(daten);
      });
    });
    s.listen(0, '127.0.0.1', ()=> ok(s));
  });
}
(async ()=>{
  let chromium;
  try{ ({ chromium } = require('playwright')); }
  catch(_){ console.error('Playwright fehlt. Einmalig: npm install --no-save playwright@1.63.0 && npx playwright install chromium'); process.exit(2); }
  const s = await server(), basis = 'http://localhost:' + s.address().port + '/';   // "localhost" (nicht 127.0.0.1): nötig für Passkeys
  const browser = await chromium.launch();
  const teil = process.argv[2] || '';
  const dateien = fs.readdirSync(__dirname).filter(n=> n.endsWith('.test.js') && n.includes(teil)).sort();
  let gesamt = 0, fehl = 0; const t0 = Date.now();
  for(const n of dateien){
    console.log('\n== ' + n);
    const pr = (name, ok, info)=>{
      gesamt++; if(!ok) fehl++;
      const zusatz = info !== undefined && (!ok || process.env.AUSFUEHRLICH) ? '  -> ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600) : '';
      console.log((ok ? '  OK     ' : '  FEHLER ') + name + zusatz);
    };
    try{
      await Promise.race([ require(path.join(__dirname, n))({ browser, basis, pr }),
        new Promise((_, nein)=> setTimeout(()=> nein(new Error('Zeitüberschreitung (5 Minuten)')), 300000)) ]);
    }catch(e){ gesamt++; fehl++; console.log('  FEHLER Abbruch: ' + String((e && e.message) || e).split('\n')[0].slice(0, 400)); }
  }
  await browser.close().catch(()=>{}); s.close();
  console.log('\n' + (fehl ? fehl + ' von ' + gesamt + ' Prüfungen FEHLGESCHLAGEN' : 'Alle ' + gesamt + ' Prüfungen bestanden') + ' (' + Math.round((Date.now() - t0) / 1000) + ' s, ' + dateien.length + ' Dateien)');
  process.exit(fehl ? 1 : 0);
})();
