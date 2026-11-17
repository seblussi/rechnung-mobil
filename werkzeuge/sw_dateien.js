#!/usr/bin/env node
// Trägt in sw.js zu jeder Datei der festen Liste (DATEIEN) die SHA-256-Prüfsumme ein. Der Service Worker übernimmt eine
// neue Version nur, wenn JEDE Datei vollständig geladen wurde und zu ihrer Prüfsumme passt (Sicherheitsbericht L11).
//   Aufruf vor jeder Veröffentlichung, NACH werkzeuge/csp_aktualisieren.py:   node werkzeuge/sw_dateien.js
//   Nur prüfen (ändert nichts, Rückgabewert 1 bei Abweichung):                node werkzeuge/sw_dateien.js --pruefen
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const BLOCK = /(\/\/ >>> DATEIEN[^\n]*\n)([\s\S]*?)(\/\/ <<< DATEIEN)/;
function datei(wurzel, schluessel){ return path.join(wurzel, schluessel === './' ? 'index.html' : decodeURIComponent(schluessel.replace(/^\.\//, ''))); }
function summe(wurzel, schluessel){ return crypto.createHash('sha256').update(fs.readFileSync(datei(wurzel, schluessel))).digest('base64'); }
function lesen(wurzel){
  const sw = fs.readFileSync(path.join(wurzel, 'sw.js'), 'utf8'), m = BLOCK.exec(sw);
  if(!m) throw new Error('sw.js: Block „DATEIEN“ nicht gefunden');
  const eintraege = []; const re = /'(\.\/[^']*)'\s*:\s*'([^']*)'/g; let x;
  while((x = re.exec(m[2]))) eintraege.push([x[1], x[2]]);
  if(!eintraege.length) throw new Error('sw.js: Block „DATEIEN“ ist leer');
  return { sw, m, eintraege };
}
// -> Liste der Abweichungen (leer = alles stimmt)
function pruefen(wurzel){
  return lesen(wurzel).eintraege.filter(([k, h])=>{ try{ return summe(wurzel, k) !== h; }catch(_){ return true; } }).map(([k])=> k);
}
function aktualisieren(wurzel){
  const { sw, m, eintraege } = lesen(wurzel);
  const zeilen = eintraege.map(([k])=> "  '" + k + "': '" + summe(wurzel, k) + "',").join('\n') + '\n';
  const neu = sw.replace(BLOCK, (_, a, __, c)=> a + zeilen + c);
  if(neu !== sw) fs.writeFileSync(path.join(wurzel, 'sw.js'), neu);
  return eintraege.length;
}
module.exports = { pruefen, aktualisieren, summe };
if(require.main === module){
  const wurzel = path.resolve(__dirname, '..');
  if(process.argv.includes('--pruefen')){ const ab = pruefen(wurzel); if(ab.length){ console.error('sw.js: Prüfsummen passen nicht: ' + ab.join(', ')); process.exit(1); } console.log('sw.js: alle Prüfsummen stimmen'); }
  else console.log('sw.js: ' + aktualisieren(wurzel) + ' Prüfsummen eingetragen');
}
