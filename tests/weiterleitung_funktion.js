// Prüft die Weiterleitung (Azure Function aus azure/einrichten.sh) ohne Azure: Code aus dem Skript lesen,
// @azure/functions und fetch nachbilden. Aufruf: node tests/weiterleitung_funktion.js   (Ausgabe wie statisch.js)
const fs = require('fs'), path = require('path'), Module = require('module');
const skript = fs.readFileSync(path.join(__dirname, '..', 'azure', 'einrichten.sh'), 'utf8');
const m = /cat > "\$TMP\/src\/functions\/lxp\.js" <<'EOF'\n([\s\S]*?)\nEOF\n/.exec(skript);
let fehler = 0, n = 0; const pr = (t, ok, d)=>{ n++; if(!ok) fehler++; console.log((ok ? '  OK     ' : '  FEHLER ') + t + (ok ? '' : '  -> ' + JSON.stringify(d))); };
if(!m){ console.log('  FEHLER Funktionscode im Skript nicht gefunden'); process.exit(1); }
let handler = null;
const echtLaden = Module._load;
Module._load = function(req){ if(req === '@azure/functions') return { app: { http: (_n, o)=>{ handler = o.handler; } } }; return echtLaden.apply(this, arguments); };
const gesendet = [];
global.fetch = async (url, opt)=>{ gesendet.push({ url, body: opt && opt.body }); return { status: 200, headers: new Map([['content-type', 'application/json']]), text: async ()=> '{"status":200,"data":{"id":1}}' }; };
const laden = (codes)=>{ if(codes == null) delete process.env.ZUGANGSCODES; else process.env.ZUGANGSCODES = codes; handler = null; new Function('require', 'module', 'exports', m[1])(require, { exports: {} }, {}); return handler; };
const anfrage = (pfad, daten, herkunft)=> ({ method: 'POST', params: { pfad }, headers: new Map([['origin', herkunft || 'https://seblussi.github.io'], ['x-client-ip', '1.2.3.4']]), text: async ()=> JSON.stringify(daten || {}) });
const ctx = { log: ()=>{} };
(async ()=>{
  let h = laden(null);
  let r = await h(anfrage('_version'), ctx); let j = JSON.parse(r.body);
  pr('Version 6 meldet sich (auch ohne Code), zeigt „kein Zugangscode“', r.status === 200 && j.weiterleitung === 6 && j.zugangscode === false, j);
  r = await h(anfrage('printjobs', { auth: { username: 'x' } }), ctx);
  pr('ohne hinterlegten Zugangscode: nichts wird weitergeleitet (503)', r.status === 503 && gesendet.length === 0, { status: r.status, body: r.body });
  h = laden('abc-123,def-456');
  r = await h(anfrage('printjobs', { auth: { username: 'x' } }), ctx);
  pr('mit Codes: Anfrage ohne Code abgelehnt (403), nichts gesendet', r.status === 403 && gesendet.length === 0, { status: r.status });
  r = await h(anfrage('printjobs', { _zugang: 'falsch', auth: {} }), ctx);
  pr('falscher Code abgelehnt (403)', r.status === 403 && gesendet.length === 0, { status: r.status });
  r = await h(anfrage('printjobs', { _zugang: 'def-456', auth: { username: 'x' } }), ctx);
  pr('richtiger Code: weitergeleitet, Code vor dem Weiterreichen entfernt', r.status === 200 && gesendet.length === 1 && !/def-456|_zugang/.test(gesendet[0].body) && /api\.letterxpress\.de\/v3\/printjobs$/.test(gesendet[0].url), gesendet);
  r = await h(anfrage('_version'), ctx); j = JSON.parse(r.body);
  pr('Version meldet „Zugangscode eingerichtet“', j.zugangscode === true, j);
  r = await h(anfrage('printjobs', { _zugang: 'def-456' }, 'https://boese.example'), ctx);
  pr('fremde Herkunft abgelehnt', r.status === 403 && gesendet.length === 1, { status: r.status });
  console.log(fehler ? fehler + ' von ' + n + ' Prüfungen FEHLGESCHLAGEN' : 'Alle ' + n + ' Prüfungen bestanden');
  process.exit(fehler ? 1 : 0);
})().catch((e)=>{ console.log('  FEHLER Abbruch: ' + e.message); process.exit(1); });
