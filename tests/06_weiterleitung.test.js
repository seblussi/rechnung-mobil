// L6: Die Sicherheitsrichtlinie (CSP) lässt nur fest eingetragene Adressen zu. Eine fremde Weiterleitung wird
// deshalb erkannt und klar gemeldet, statt stumm vom Browser blockiert zu werden.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.addInitScript(()=>{ window.__csp = []; document.addEventListener('securitypolicyviolation', (e)=> window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await oeffnen(p, basis);
  const r = await p.evaluate(async ()=>{
    const o = {}, fremd = 'https://lxp-weiterleitung-fremd123.azurewebsites.net/api';
    o.fest = lxpAdresseFreigegeben(LXP_WEITERLEITUNG_STANDARD) && lxpAdresseFreigegeben(EBM_DIENST); o.fremd = lxpAdresseFreigegeben(fremd); o.unsinn = lxpAdresseFreigegeben('kein url');
    // Gegenprobe: Der Browser blockiert die fremde Adresse tatsächlich (ohne die Prüfung bliebe nur "Failed to fetch")
    try{ await fetch(fremd + '/v3/_version', { method: 'POST', body: '{}' }); o.fetch = 'durchgelassen'; }catch(e){ o.fetch = 'blockiert'; }
    await new Promise((r)=> setTimeout(r, 300)); o.csp = (window.__csp || []).filter((x)=> /connect-src/.test(x) && /fremd123/.test(x)).length;
    const erg = await einrWeiterleitungPruefen(fremd, 'nutzer', 'schluessel'); o.pruefen = { ok: erg.ok, text: (erg.zeilen || []).map((z)=> z.text).join(' | ') };
    try{ lxpBasisUrl({ BRIEF_WEITERLEITUNG: fremd }); o.basis = 'angenommen'; }catch(e){ o.basis = e.message; }
    try{ o.leer = lxpBasisUrl({ BRIEF_WEITERLEITUNG: '' }); }catch(e){ o.leer = e.message; }
    o.standard = LXP_WEITERLEITUNG_STANDARD;
    return o;
  });
  pr('fest eingetragene Adresse gilt als freigegeben, fremde und unsinnige nicht', r.fest === true && r.fremd === false && r.unsinn === false, r);
  pr('Gegenprobe: Der Browser blockiert die fremde Adresse wirklich (CSP connect-src)', r.fetch === 'blockiert' && r.csp > 0, { fetch: r.fetch, csp: r.csp });
  pr('Einrichtung: fremde Adresse wird mit klarer Meldung abgelehnt', r.pruefen.ok === false && /nicht freigegeben/.test(r.pruefen.text), r.pruefen);
  pr('Senden: fremde Adresse wird mit klarer Meldung abgelehnt, nichts wird gesendet', /nicht freigegeben/.test(r.basis) && /nichts gesendet/.test(r.basis), r.basis);
  pr('ohne eigene Adresse gilt die Standard-Weiterleitung', r.leer === r.standard, r.leer);
  await p.context().close();
};
