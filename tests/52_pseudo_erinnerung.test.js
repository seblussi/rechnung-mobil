// Pseudo-Fall (Wunsch 25.11.2026): 2 h vor Dienstende ohne GKV-Patient Erinnerung mit „Pseudo-Fall anlegen“ und Anleitung;
// Diensttage-Übersicht mit GKV/LS/PT-Spalten, GP rot ohne GKV- und Pseudo-Fall
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  const r = await p.evaluate(async ()=>{
    const jetzt = new Date(), hm = (d)=> zz2(d.getHours()) + ':' + zz2(d.getMinutes());
    const von = new Date(jetzt.getTime() - 3 * 3600000), bis = new Date(jetzt.getTime() + 90 * 60000);
    LS.set('live_auto', false); LS.set('pseudo_live_weg', {});
    LS.set('live_dienst', { datum: liveIso(von), von: hm(von), bis: hm(bis), art: 'Fahrdienst', schicht: '2' }); liveDienstLaden();
    const alt = gkvFaelleLaden; window.gkvFaelleLaden = ()=> [];
    LS.set('seitenhilfe', false); ansichtStart(); await new Promise(r=> setTimeout(r, 1500));
    const info = designDienstInfo(), da = !!document.querySelector('.ds-pseudo');
    const knoepfe = [...document.querySelectorAll('.ds-pseudo button')].map(b=> b.textContent);
    document.querySelector('[data-pseudo="anleitung"]').click(); await new Promise(r=> setTimeout(r, 300));
    const anl = (document.querySelector('.beta-overlay.aktiv') || {}).textContent || '';
    const zu = [...document.querySelectorAll('.beta-overlay.aktiv button')].find(b=> /Schließen/.test(b.textContent)); if(zu) zu.click(); await new Promise(r=> setTimeout(r, 200));
    document.querySelector('[data-pseudo="spaeter"]').click(); await new Promise(r=> setTimeout(r, 100));
    ansichtStart(); await new Promise(r=> setTimeout(r, 800));
    const nachSpaeter = !!document.querySelector('.ds-pseudo');
    window.gkvFaelleLaden = alt;
    return { modus: info.modus, pauschale: info.pauschale, da, knoepfe, anl: /99999/.test(anl) && /Z02/.test(anl) && /Notfallstr/.test(anl), nachSpaeter };
  });
  pr('Laufender Dienst, < 2 h bis Ende, kein GKV-Patient: Erinnerung mit „Pseudo-Fall anlegen“ und Anleitung', r.da && r.knoepfe.some(t=> /Pseudo-Fall anlegen/.test(t)) && r.anl, r);
  pr('„×“: erst einmal nicht mehr erinnern', !r.nachSpaeter, r);
  const gp = await p.evaluate(()=> [fdGpHtml({ gkvRoh: 0, pseudo: false, dienstart: 'Fahrdienst', pauschale: true, satz: 21.43 }), fdGpHtml({ gkvRoh: 0, pseudo: true, dienstart: 'Fahrdienst', pauschale: true, satz: 21.43, satzGrund: 'x' })]);
  pr('GP rot ohne GKV- und Pseudo-Fall, sonst normal (kein eigenes „Pseudo“-Kennzeichen)', /fd-gp-rot/.test(gp[0]) && !/fd-gp-rot/.test(gp[1]) && /GP\*/.test(gp[1]) && !/>Pseudo</.test(gp[1]), gp);
  const ae = await p.evaluate(()=>{ const w = (iniCacheLaden() || { werte: {} }).werte || {};
    return [aerzteAdresseEigen({ vname: 'Dr. med. ' + (w.ARZTNAME || 'X'), adr1: '- Bereitschaftsarzt -', adr2: '' }), aerzteAdresseEigen({ vname: 'Dr. Andrea Rohr', adr1: 'Hauptstr. 5', adr2: '79100 Freiburg' }), !!w.ARZTNAME]; });
  pr('Vertretungsarzt: gespeicherte „Anschrift“ mit den eigenen Daten wird erkannt und nicht verwendet', (!ae[2] || ae[0]) && !ae[1], ae);
  await p.context().close();
};
