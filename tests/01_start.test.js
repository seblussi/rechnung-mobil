// Die App startet (Demo-Daten, nur im Arbeitsspeicher), alle Hauptansichten lassen sich öffnen,
// kein Skriptfehler, und die Sicherheitsrichtlinie der Seite (CSP) blockiert nichts Eigenes.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  pr('App läuft im Demo-Modus', await p.evaluate(()=> !!window.DEMO_MODUS && /^v\d+$/.test(APP_VERSION) && ladeFaelle('ls').length > 0), await p.evaluate(()=> APP_VERSION));
  const ansichten = ['ansichtStart', 'ansichtKorrigieren', 'ansichtGkvVerwaltung', 'ansichtFahrtenbuch', 'ansichtDienste', 'ansichtBestatter', 'ansichtEinstellungen', 'ansichtStart'];
  for(const n of ansichten){
    const r = await p.evaluate(async (n)=>{
      if(typeof window[n] !== 'function') return 'fehlt';
      try{ const x = window[n](); if(x && x.then) await Promise.race([x, new Promise(r=> setTimeout(r, 4000))]); await new Promise(r=> setTimeout(r, 400)); return document.getElementById('app') && document.getElementById('app').children.length ? 'ok' : 'leer'; }
      catch(e){ return 'Fehler: ' + (e.message || e); }
    }, n);
    pr('Ansicht ' + n.replace('ansicht', ''), r === 'ok', r);
  }
  pr('Demo öffnet die echte Datenbank nicht', await p.evaluate(async ()=> !indexedDB.databases || !(await indexedDB.databases()).some((d)=> d.name === 'rechnung-daten' || d.name === 'rechnung_doku')));
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  pr('Sicherheitsrichtlinie (CSP) blockiert nichts', p.csp.length === 0, p.csp.slice(0, 2));
  await p.context().close();
};
