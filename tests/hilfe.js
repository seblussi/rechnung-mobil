// Gemeinsame Helfer für die Browser-Tests
const SEITE = 'Rechnungserfassung_Mobil.html';
// Neues, leeres Gerät (eigener Browser-Kontext). Alles außerhalb des Testservers wird blockiert; einzelne Tests
// legen danach eigene Regeln darüber (z. B. das nachgebildete OneDrive) -- spätere Regeln haben Vorrang.
//   opt.demo: Demo-Modus (Beispieldaten, nur im Arbeitsspeicher)     opt.echt: echter verschlüsselter Speicher, ohne Anmeldung
async function geraet(browser, basis, opt){
  opt = opt || {};
  const c = await browser.newContext({ viewport: { width: 400, height: 850 }, serviceWorkers: 'block' });
  await c.route((url)=> !String(url).startsWith(basis), (r)=> r.abort());
  const p = await c.newPage(); p.fehler = []; p.csp = [];
  p.on('pageerror', (e)=> p.fehler.push(String(e.message).slice(0, 200)));
  p.on('console', (m)=>{ if(m.type() === 'error' && /Content Security Policy/i.test(m.text())) p.csp.push(m.text().slice(0, 200)); });
  if(opt.demo || opt.echt) await p.addInitScript((demo)=>{
    try{ localStorage.setItem('seitenhilfe', 'false'); localStorage.setItem('app_zugangscode', '"abc"'); localStorage.setItem('app_code_ok', 'true'); localStorage.setItem('app_code_geprueft', String(Date.now())); localStorage.setItem('einrichtung_fertig', 'true'); }catch(_){}
    if(demo){ try{ sessionStorage.setItem('demo_modus', '1'); sessionStorage.setItem('demo_frei', '1'); }catch(_){} }
  }, !!opt.demo);
  return p;
}
// App laden und warten, bis das Hauptskript läuft
const PASSWORT = 'Ein-Langes-Test-Passwort-2026!';
// Neues Geraet im echten Betrieb: Passwort festlegen, Wiederherstellungsschluessel bestaetigen (Datentresor)
async function tresorEinrichten(p){
  try{ await p.waitForSelector('#tsPw1', { timeout: 60000 }); }
  catch(e){ const t = await p.evaluate(()=> document.body ? document.body.innerText.slice(0, 300) : '').catch(()=> '?'); throw new Error('Einrichtungsseite erscheint nicht. Seite zeigt: ' + JSON.stringify(t)); }
  await p.fill('#tsPw1', PASSWORT); await p.fill('#tsPw2', PASSWORT); await p.click('#tsWeiter');
  try{ await p.waitForSelector('#tsCode', { timeout: 60000 }); }
  catch(e){ const t = await p.evaluate(()=> document.body ? document.body.innerText.slice(0, 300) : '').catch(()=> '?'); throw new Error('Wiederherstellungsschlüssel erscheint nicht. Seite zeigt: ' + JSON.stringify(t)); }
  const code = (await p.textContent('#tsCode')).trim(); p.code = code;
  await p.fill('#tsLetzter', code.split('-').pop()); await p.click('#tsFertig');
  await p.waitForTimeout(500);
  if(await p.$('#tsPkSpaeter')) await p.click('#tsPkSpaeter');
}
async function entsperren(p, pw){ await p.waitForSelector('#tsPw', { timeout: 60000 }); await p.fill('#tsPw', pw || PASSWORT); await p.evaluate(()=> document.getElementById('tsAuf').click()); }
async function oeffnen(p, basis, opt){
  opt = opt || {};
  await p.goto(basis + SEITE);
  if(opt.einrichten) await tresorEinrichten(p);
  await p.waitForFunction(()=> typeof ansichtStart === 'function' && typeof APP_VERSION !== 'undefined' && typeof LS !== 'undefined', null, { timeout: 40000 });
  await p.waitForTimeout(2500);
}
const appLaeuft = async ()=>{};
module.exports = { SEITE, geraet, oeffnen, appLaeuft, tresorEinrichten, entsperren, PASSWORT };
