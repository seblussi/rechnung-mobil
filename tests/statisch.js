// Prüfungen ohne Browser (nur Node, keine Zusatzpakete):  node tests/statisch.js
// Syntax aller Skripte, Sicherheitsrichtlinie (CSP) passend zu den Skripten, keine fremden Skriptquellen,
// keine Ereignis-Attribute im HTML, Prüfsummen der Bibliotheken in lib/, Dateiliste des Service Workers.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const W = path.resolve(__dirname, '..'), HTML = 'Rechnungserfassung_Mobil.html';
let fehl = 0, gesamt = 0;
const pr = (name, ok, info)=>{ gesamt++; if(!ok) fehl++; console.log((ok ? '  OK     ' : '  FEHLER ') + name + (info !== undefined && !ok ? '  -> ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 700) : '')); };
const lies = (p)=> fs.readFileSync(path.join(W, p), 'utf8');
const html = lies(HTML);

// ---- 1. Syntax ----
const inline = []; { const re = /<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script[^>]*>/gi; let m; while((m = re.exec(html))) inline.push({ attr: m[1], code: m[2] }); }
const syntax = [];
inline.forEach((s, i)=>{ if(/application\/(ld\+)?json/.test(s.attr)) return; try{ new vm.Script(s.code, { filename: 'inline-' + (i + 1) }); }catch(e){ syntax.push('Inline-Skript ' + (i + 1) + ': ' + e.message); } });
const jsDateien = ['sw.js'].concat(fs.readdirSync(path.join(W, 'lokal')).filter((n)=> n.endsWith('.js')).map((n)=> 'lokal/' + n)).concat(fs.readdirSync(__dirname).filter((n)=> n.endsWith('.js')).map((n)=> 'tests/' + n));
jsDateien.forEach((d)=>{ try{ new vm.Script(lies(d), { filename: d }); }catch(e){ syntax.push(d + ': ' + e.message); } });
pr('Syntax: ' + inline.length + ' Skripte in der Seite, ' + jsDateien.length + ' Dateien', syntax.length === 0, syntax);

// ---- 2. Sicherheitsrichtlinie (CSP) ----
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/) || [])[1] || '';
const skriptRegel = (csp.split(';').map((x)=> x.trim()).find((x)=> x.startsWith('script-src')) || '');
const soll = Array.from(new Set(inline.map((s)=> "'sha256-" + crypto.createHash('sha256').update(s.code, 'utf8').digest('base64') + "'")));
const ist = skriptRegel.match(/'sha256-[^']+'/g) || [];
pr('CSP vorhanden, ohne unsafe-inline / unsafe-eval für Skripte', !!csp && !/'unsafe-inline'|'unsafe-eval'/.test(skriptRegel), skriptRegel.slice(0, 200));
pr('CSP-Prüfsummen passen zu den Skripten (sonst startet die App nicht) – bei Fehler: werkzeuge/csp_aktualisieren.py', soll.every((h)=> ist.includes(h)) && ist.every((h)=> soll.includes(h)), { fehlt: soll.filter((h)=> !ist.includes(h)).length, veraltet: ist.filter((h)=> !soll.includes(h)).length });
pr("CSP: object-src 'none', base-uri 'self', form-action 'self'", /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp));

// ---- 3. Keine fremden Quellen, keine Ereignis-Attribute ----
const quellen = (html.match(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'][^"']+["']/gi) || []).map((x)=> (x.match(/(?:src|href)\s*=\s*["']([^"']+)/i) || [])[1]);
pr('Skripte und Stile nur aus dem eigenen Ordner (kein CDN)', quellen.every((q)=> !/^(https?:)?\/\//i.test(q)), quellen.filter((q)=> /^(https?:)?\/\//i.test(q)));
const ereignis = html.match(/<[a-zA-Z][^<>]{0,300}\son(?:click|dblclick|load|error|change|input|submit|focus|blur|key\w+|mouse\w+|touch\w+|pointer\w+)\s*=\s*\\?["']/g) || [];
pr('keine Ereignis-Attribute (onclick= …) im HTML – die CSP würde sie stumm blockieren', ereignis.length === 0, ereignis.slice(0, 3));

// ---- 4. Bibliotheken unverändert ----
const summen = lies('lib/PRUEFSUMMEN.txt').split('\n').map((z)=> z.match(/^([0-9a-f]{128})\s+(\S.*)$/)).filter(Boolean);
const falsch = summen.filter(([, h, d])=>{ try{ return crypto.createHash('sha512').update(fs.readFileSync(path.join(W, d))).digest('hex') !== h; }catch(_){ return true; } }).map((m)=> m[2]);
pr('Bibliotheken in lib/ entsprechen den hinterlegten Prüfsummen (' + summen.length + ' Dateien)', summen.length > 5 && falsch.length === 0, falsch);
const gelistet = new Set(summen.map((m)=> m[2]));
const alleLib = []; (function lauf(d){ fs.readdirSync(path.join(W, d), { withFileTypes: true }).forEach((e)=>{ const p = d + '/' + e.name; if(e.isDirectory()) lauf(p); else alleLib.push(p); }); })('lib');
const ohne = alleLib.filter((p)=> !gelistet.has(p) && !/PRUEFSUMMEN\.txt$|LIZENZEN\.txt$/.test(p));
pr('jede Datei in lib/ hat eine Prüfsumme', ohne.length === 0, ohne.slice(0, 8));

// ---- 5. Service Worker und Version ----
const sw = lies('sw.js');
const cache = (sw.match(/const CACHE_NAME = '([^']+)'/) || [])[1] || '', version = (html.match(/const APP_VERSION = '(v\d+)'/) || [])[1] || '';
pr('Version und Cache-Name gesetzt', /^v\d+$/.test(version) && /-(v|l)\d+$/.test(cache), { version, cache });
if(/-v\d+$/.test(cache)) pr('Cache-Name trägt dieselbe Nummer wie die App-Version', cache.endsWith('-' + version), { version, cache });
const swDateien = Array.from(new Set((sw.match(/'\.\/[^']*'/g) || []).map((x)=> x.slice(3, -1)).filter((x)=> x && !x.endsWith('/'))));
const fehlen = swDateien.filter((d)=> !fs.existsSync(path.join(W, decodeURIComponent(d.split('?')[0]))));
pr('alle im Service Worker genannten Dateien existieren (' + swDateien.length + ')', swDateien.length > 5 && fehlen.length === 0, fehlen);

console.log('\n' + (fehl ? fehl + ' von ' + gesamt + ' Prüfungen FEHLGESCHLAGEN' : 'Alle ' + gesamt + ' Prüfungen bestanden'));
process.exit(fehl ? 1 : 0);
