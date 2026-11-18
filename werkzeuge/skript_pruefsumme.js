// Prüfsumme des Einrichtungsskripts azure/einrichten.sh in die App eintragen (Sicherheitsbericht W3):
// Die App zeigt die Aufrufzeile mit "sha256sum -c" -- ausgeführt wird nur genau dieser Stand des Skripts.
// Aufruf VOR werkzeuge/csp_aktualisieren.py und werkzeuge/sw_dateien.js:  node werkzeuge/skript_pruefsumme.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const W = path.resolve(__dirname, '..'), HTML = path.join(W, 'Rechnungserfassung_Mobil.html');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(W, 'azure', 'einrichten.sh'))).digest('hex');
const alt = fs.readFileSync(HTML, 'utf8');
const neu = alt.replace(/const EINR_AZURE_SHA256 = '[0-9a-f]*';/, "const EINR_AZURE_SHA256 = '" + sha + "';");
if(neu === alt && !alt.includes("const EINR_AZURE_SHA256 = '" + sha + "';")){ console.error('EINR_AZURE_SHA256 nicht gefunden'); process.exit(1); }
if(neu !== alt) fs.writeFileSync(HTML, neu);
console.log('Einrichtungsskript: SHA-256 ' + sha.slice(0, 16) + '…' + (neu !== alt ? ' eingetragen' : ' unverändert'));
