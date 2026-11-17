// Präparierte Inhalte für die Eingabe-Tests. Jede Nutzlast ist harmlos: Würde sie als HTML ausgeführt, entstünde nur
// eine Markierung (ein Element <i id="pwn-..."> bzw. window.__xss). Sie löscht nichts und sendet nichts.
const P = (feld)=> '<i id="pwn-' + feld + '"></i><img src=x onerror="window.__xss=\'' + feld + '\'">' + feld;
const FORMELN = ['=HYPERLINK("https://beispiel.invalid","Hier klicken")', "=cmd|'/c calc'!A1", '+1+1', '@SUMME(A1)', '-2+3'];
function daten(){
  const jetzt = Date.now(), d = new Date(), z = (n)=> String(n).padStart(2, '0');
  const de = z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear(), iso = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  const wLs = {}; ['txtName', 'txtPAdresse1', 'txtPAdresse2', 'txtSterbeAdr1', 'txtSterbeAdr2', 'txtBName', 'txtAdresse1', 'txtAdresse2', 'txtDokuId', 'txtEmpfaenger', 'txtKm'].forEach(k=> wLs[k] = P(k));
  Object.assign(wLs, { txtDatumExcel: de, txtZeitLS: '09:15', txtDatum: de, txtGeda: '01.01.1940', txtSterbedatum: de, txtTodeszeit: '08:00' });
  const wPt = {}; ['txtName', 'txtPAdresse1', 'txtPAdresse2', 'txtDokuId', 'txtKm'].forEach(k=> wPt[k] = P('pt_' + k));
  Object.assign(wPt, { txtDatumExcel: de, txtZeitLS: '09:45', txtDatum: de, txtGeda: '02.02.1950' });
  const wDatum = { txtName: 'Datumstest, Fall', txtDatumExcel: P('datum'), txtZeitLS: P('zeit'), txtDatum: P('datum2'), txtGeda: P('geda') };
  const ls = (i, w)=> ({ art: 'ls', zeitstempel: '2026-01-0' + i + 'T10:00:00.000Z', werte: w, rechnungsnummer: P('renu' + i), _t: jetzt });
  const pt = (i, w)=> ({ art: 'pt', zeitstempel: '2026-01-1' + i + 'T10:00:00.000Z', werte: w, _t: jetzt });
  const formelFaelle = FORMELN.map((x, i)=> ls(5 + i, { txtName: x, txtPAdresse1: x, txtPAdresse2: '77654 Offenburg', txtBName: x, txtAdresse1: x, txtAdresse2: x, txtDatumExcel: de, txtZeitLS: '12:0' + i, txtDatum: de, txtGeda: '03.03.1945', txtSterbedatum: de, txtTodeszeit: '07:00' }));
  return {
    ls: [ls(1, wLs), ls(2, wDatum)].concat(formelFaelle), pt: [pt(1, wPt)],
    gkv: [{ id: 'test-gkv-1', name: P('gkv_name'), datum: iso, zeit: '10:30', euro: 42.5, status: 'offen', adresse: P('gkv_adresse'), auswahl: { [P('gkv_gop')]: 1 }, profil: P('gkv_profil'), dienst: P('gkv_dienst'), dokuId: P('gkv_doku'), _t: jetzt }],
    entwuerfe: [{ id: 'test-e1', art: 'pt', geaendert: jetzt, werte: { txtName: P('entw_name'), txtDatumExcel: de, txtZeitLS: '11:00', txtPAdresse1: P('entw_adr') }, _t: jetzt }],
    saetze: {
      bestatter: { liste: [{ id: 'test-b1', name: P('best_name'), adr1: P('best_adr1'), adr2: P('best_adr2'), herkunft: 'handy', zeitstempel: new Date(jetzt).toISOString(), _t: jetzt }], geloescht: {} },
      live_dienst: { liste: [{ id: 'live', datum: iso, von: '08:00', bis: '20:00', art: P('dienst_art'), schicht: P('dienst_schicht'), arzt: P('dienst_arzt'), am: new Date(jetzt).toISOString(), _t: jetzt }], geloescht: {} },
      app_dienste: { liste: [{ id: 'test-d1', datum: iso, von: '20:00', bis: '23:00', art: P('appd_art'), schicht: P('appd_schicht'), _t: jetzt }], geloescht: {} },
      gkv_entwurf: { liste: [{ id: 'gkv', name: P('gkve_name'), datum: iso, zeit: '11:30', adresse: P('gkve_adr'), auswahl: {}, am: new Date(jetzt).toISOString(), _t: jetzt }], geloescht: {} },
      weg_flaechen: { liste: [{ id: 'test-f1', name: P('flaeche_name'), punkte: [[48.47, 7.94], [48.48, 7.95], [48.46, 7.96]], _t: jetzt }], geloescht: {} }
    }
  };
}
// Abgleichsdatei der Privatversion mit Nutzlasten in allen Textfeldern
function abgleichsdatei(){
  const d = daten(); d.saetze.entwuerfe = { liste: d.entwuerfe, geloescht: {} };
  return JSON.stringify({ version: 2, am: new Date().toISOString(), faelle: d.ls.concat(d.pt), gkv: d.gkv, geloescht: {}, saetze: d.saetze,
    bestatterAenderungen: [{ name: P('alt_best'), adr1: P('alt_best_adr'), adr2: '', herkunft: 'handy' }] });
}
// Falsche Datentypen und "__proto__"-Angriff (als Rohtext, damit die Schlüssel erhalten bleiben)
const KAPUTT = `{ "version": 2, "__proto__": { "polluted": "JA" }, "constructor": { "prototype": { "polluted2": "JA" } },
  "faelle": "kein Array", "gkv": { "0": { "id": "x" } }, "geloescht": { "__proto__": { "polluted3": "JA" }, "ls|x": "morgen" },
  "saetze": { "live_dienst": { "liste": [ { "id": "live", "datum": "kein-datum", "von": "25:99", "bis": null, "art": 12345, "am": "2026-13-45" } ] },
              "app_dienste": { "liste": "kaputt" }, "entwuerfe": { "liste": [ null, 7, { "id": "__proto__", "werte": { "__proto__": { "polluted4": "JA" } } } ] },
              "bestatter": { "liste": [ { "id": "constructor", "name": { "obj": 1 } } ], "geloescht": { "__proto__": 9e15 } } },
  "bestatterAenderungen": [ { "name": 42 }, null, "x" ] }`;
// Sehr große Datei: 5000 Einträge, ein Name mit 200.000 Zeichen
function riesig(){
  const d = new Date(), z = (n)=> String(n).padStart(2, '0'), de = z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear(), iso = d.toISOString().slice(0, 10), gkv = [];
  for(let i = 0; i < 5000; i++) gkv.push({ id: 'g' + String(i).padStart(5, '0'), name: 'Masse, Nr ' + i, datum: iso, zeit: '15:00', euro: 10, status: 'offen', _t: Date.now() });
  return JSON.stringify({ version: 2, am: new Date().toISOString(), faelle: [{ art: 'pt', zeitstempel: '2026-01-11T10:00:00.000Z', werte: { txtName: 'Lang, ' + 'A'.repeat(200000), txtDatumExcel: de, txtZeitLS: '14:00', txtDatum: de }, _t: Date.now() }], gkv, geloescht: {}, saetze: {} });
}
// Wächter in der Seite: hält jede eingefügte Markierung fest (auch flüchtige, z. B. in Hinweisen) und jede CSP-Blockade
function waechter(){
  window.__csp = []; window.__pwn = []; window.__ansicht = 'Laden';
  document.addEventListener('securitypolicyviolation', (e)=> window.__csp.push(window.__ansicht + ': ' + e.violatedDirective));
  new MutationObserver((ms)=> ms.forEach((m)=> m.addedNodes.forEach((n)=>{
    if(n.nodeType !== 1) return;
    const l = (n.id && n.id.startsWith('pwn-')) || (n.tagName === 'IMG' && n.getAttribute('src') === 'x') ? [n] : Array.from(n.querySelectorAll('[id^="pwn-"], img[src="x"]'));
    l.forEach((x)=> window.__pwn.push(window.__ansicht + ': ' + (x.id || 'img') + ' in ' + ((x.parentElement && (x.parentElement.className || x.parentElement.tagName)) || '?')));
  }))).observe(document, { childList: true, subtree: true });
}
const ANSICHTEN = [
  ['Start', '()=> ansichtStart()'], ['Rechnungsverwaltung', '()=> ansichtKorrigieren()'], ['GKV-Verwaltung', '()=> ansichtGkvVerwaltung()'],
  ['Fahrtenbuch', '()=> ansichtFahrtenbuch()'], ['Einstellungen', '()=> ansichtEinstellungen()'], ['Bestatter', '()=> ansichtBestatter()'],
  ['Dienste', '()=> ansichtDienste()'], ['GKV-Maske', '()=> ansichtGkv()'],
  ['LS-Maske 1', '()=>{ const i = ladeFaelle("ls").map((f, i)=> [f, i]).filter(([f])=> /pwn-|^[=+@-]/.test(JSON.stringify((f && f.werte) || {}))).map(([, i])=> i); if(i.length) return ansichtMaske("ls", i[0]); }'],
  ['LS-Maske 2', '()=>{ const i = ladeFaelle("ls").map((f, i)=> [f, i]).filter(([f])=> /pwn-|^[=+@-]/.test(JSON.stringify((f && f.werte) || {}))).map(([, i])=> i); if(i.length > 1) return ansichtMaske("ls", i[1]); }'],
  ['PT-Maske', '()=>{ const i = ladeFaelle("pt").map((f, i)=> [f, i]).filter(([f])=> /pwn-|Lang, /.test(JSON.stringify((f && f.werte) || {}))).map(([, i])=> i); if(i.length) return ansichtMaske("pt", i[0]); }'],
  ['Entwurf', '()=>{ const e = (LS.get("entwuerfe", []) || []).find((x)=> /pwn-/.test(JSON.stringify(x))); if(e && typeof entwurfOeffnen === "function") return entwurfOeffnen(e.id); }']
];
// Alle Ansichten öffnen -> { funde, xss, csp, absturz, sichtbar, dauer }
async function ansichtenPruefen(p){
  const absturz = [], dauer = {}; let sichtbar = false;
  for(const [name, quelle] of ANSICHTEN){
    const t0 = Date.now();
    const r = await p.evaluate(async ([name, quelle])=>{
      window.__ansicht = name;
      try{
        document.querySelectorAll('.beta-overlay.aktiv').forEach(()=>{ try{ betaOverlay.schliessen(); }catch(_){} });
        const x = (0, eval)('(' + quelle + ')')(); if(x && x.then) await Promise.race([x, new Promise((r)=> setTimeout(r, 4000))]);
      }catch(e){ return { fehler: String((e && e.message) || e).slice(0, 160) }; }
      await new Promise((r)=> setTimeout(r, 700));
      return { text: /pwn-/.test(document.body.textContent) };
    }, [name, quelle]);
    dauer[name] = Date.now() - t0 - 700;
    if(r.fehler) absturz.push(name + ': ' + r.fehler);
    if(r.text) sichtbar = true;
  }
  const ende = await p.evaluate(()=> ({ xss: window.__xss || null, csp: Array.from(new Set(window.__csp || [])), funde: Array.from(new Set(window.__pwn || [])),
    proto: ['polluted', 'polluted2', 'polluted3', 'polluted4', 'pwned'].filter((k)=> ({})[k] !== undefined) }));
  return Object.assign(ende, { absturz, sichtbar, dauer });
}
module.exports = { P, FORMELN, daten, abgleichsdatei, KAPUTT, riesig, waechter, ansichtenPruefen };
