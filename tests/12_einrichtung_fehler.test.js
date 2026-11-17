// Einrichtungsassistent, Schritt „Ordner und Vorlagen“: Kann OneDrive nicht geprüft werden (z. B. HTTP 401),
// darf der Assistent nichts zum Anlegen anbieten – sonst entstünden Ordner und leere Vorlagen neben den vorhandenen.
// (Beobachtung 17.11.2026: „6 fehlende anlegen“, obwohl jede Prüfung mit 401 scheiterte.)
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  let antwort = 401;
  await p.context().route(/graph\.microsoft\.com/, (r)=> r.fulfill({ status: antwort, contentType: 'application/json', body: antwort === 404 ? '{"error":{"code":"itemNotFound"}}' : '{"error":{"code":"unauthenticated"}}' }));
  await oeffnen(p, basis, { einrichten: true });
  const pruefen = async ()=>{
    await p.evaluate(()=>{ msGraphStatus = 'angemeldet'; window.msGraphTokenHolen = async ()=> 'TEST'; ansichtEinrichtung('dateien'); });
    await p.waitForFunction(()=> document.getElementById('einrListe') && !document.querySelector('#einrListe .prueft') && document.getElementById('einrDateiKnopf') && document.getElementById('einrDateiKnopf').innerHTML, null, { timeout: 30000 });
    return p.evaluate(()=> ({ anlegen: !!document.getElementById('einrAnlegen'), neu: !!document.getElementById('einrNeuPruefen'), text: document.getElementById('einrDateiKnopf').textContent, weiter: (document.querySelector('[data-einr="daten"]') || {}).disabled }));
  };
  let r = await pruefen();
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/12_einrichtung_401.png', fullPage: true });
  pr('OneDrive 401: kein „fehlende anlegen“, stattdessen „Erneut prüfen“ und Hinweis', !r.anlegen && r.neu && /nicht geprüft/.test(r.text) && /neu anmelden/.test(r.text), r);
  antwort = 404;
  r = await pruefen();
  pr('Gegenprobe: wirklich fehlende Ordner (404) werden weiter zum Anlegen angeboten', r.anlegen && !r.neu, r);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
