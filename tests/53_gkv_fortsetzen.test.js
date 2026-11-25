// Nach Neuladen bzw. automatischer Sperre (Wunsch 25.11.2026): angefangener GKV-Patient kommt mit Inhalt zurueck, im sessionStorage nur der Hinweis
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const r = await p.evaluate(async ()=>{ LS.set('seitenhilfe', false); ansichtGkv(); await new Promise(r=> setTimeout(r, 800));
    const n = document.getElementById('gkvName'); n.value = 'Testmann, Theo'; n.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r=> setTimeout(r, 500));
    window.dispatchEvent(new Event('pagehide'));
    const ss = sessionStorage.getItem('reload_ansicht');
    // wie nach dem Neuladen: nichts im Arbeitsspeicher, Startseite
    gkvEntwurf = null; ansichtStart(); await new Promise(r=> setTimeout(r, 500));
    ansichtVorDemLaden = JSON.parse(ss); ansichtWiederherstellen(); await new Promise(r=> setTimeout(r, 1200));
    return { ss, titel: (document.querySelector('header h1') || {}).textContent, name: (document.getElementById('gkvName') || {}).value || null };
  });
  pr('GKV-Maske nach Neuladen/Sperre mit Inhalt wieder offen, sessionStorage ohne Patientendaten', r.name === 'Testmann, Theo' && !/Testmann/.test(r.ss || ''), r);
  await p.context().close();
};
