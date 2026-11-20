// "Verbindung testen" (Briefversand): Weiterleitung 6 mit Freischaltcode, falscher Code, kein Code hinterlegt
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); await p.waitForTimeout(800);
  await p.evaluate(()=>{ try{ betaOverlay.schliessen(); }catch(_){} LS.set('seitenhilfe', false); ansichtEinstellungen(); });
  await p.waitForSelector('#btnTestLxp', { state: 'attached' });
  const lauf = async (fall)=> p.evaluate(async (fall)=>{
    const echt = window.fetch;
    window.fetch = async (url, opt)=>{
      const u = String(url);
      if(/_version$/.test(u)) return new Response(JSON.stringify({ weiterleitung: 6, zugangscode: fall !== 'ohne' }), { status: 200 });
      if(/printjobs$/.test(u)){
        if(fall === 'falsch') return new Response(JSON.stringify({ status: 403, message: 'Zugangscode fehlt oder ist falsch.' }), { status: 403 });
        if(fall === 'ohne') return new Response(JSON.stringify({ status: 503, message: 'Die Weiterleitung hat keinen Zugangscode – bitte das Einrichtungsskript erneut ausführen.' }), { status: 503 });
        return new Response(JSON.stringify({ status: 400, message: 'letter missing' }), { status: 400 });
      }
      return echt(url, opt);
    };
    { const e = document.getElementById('ini_BRIEF_BENUTZER'); if(e) e.value = 'test'; }
    { const e = document.getElementById('ini_BRIEF_APIKEY'); if(e) e.value = 'key'; }
    const b = document.getElementById('btnTestLxp'); b.click();
    for(let i = 0; i < 40; i++){ await new Promise(r=> setTimeout(r, 100)); const t = (document.getElementById('testErgebnisLxp') || {}).textContent || ''; if(/✓|✗/.test(t)){ window.fetch = echt; return t; } }
    window.fetch = echt; return (document.getElementById('testErgebnisLxp') || {}).textContent || '';
  }, fall);
  const gut = await lauf('gut'), falsch = await lauf('falsch'), ohne = await lauf('ohne');
  pr('Version 6 mit richtigem Code: „Freischaltcode aktiv und richtig“', /Version 6, Freischaltcode aktiv und richtig/.test(gut), gut.slice(0, 160));
  pr('falscher Code: klare Meldung statt ✓', /✗ Freischaltcode fehlt oder ist falsch/.test(falsch), falsch.slice(0, 160));
  pr('kein Code an der Weiterleitung: Hinweis aufs Skript', /✗ An der Weiterleitung ist noch kein Freischaltcode hinterlegt/.test(ohne), ohne.slice(0, 160));
};
