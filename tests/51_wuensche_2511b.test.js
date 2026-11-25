// Wünsche 25.11.2026 (Teil 2): Titel bleiben klein, offene Rechnung ausbuchen, Anzahl je Art im Fahrtenbuch,
// PDF zuerst ganz sichtbar, Quartale wählbar, letzter Dienst mit LS/PT aus der Übersicht
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 932, height: 430 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  const g = await p.evaluate(()=> [grossKleinKorrigieren('dr. med. hans müller'), grossKleinKorrigieren('prof. dr. rer. nat. anna berg'), grossKleinNormalisieren('DR. MED. ULF')]);
  pr('Großschreibung: „Dr. med.“, „Dr. rer. nat.“ bleiben klein', g[0] === 'Dr. med. Hans Müller' && g[1] === 'Prof. Dr. rer. nat. Anna Berg' && g[2] === 'Dr. med. Ulf', g);
  const n = await p.evaluate(()=> fbAnzahlArtenHtml({ faelle: [{ art: 'gkv' }, { art: 'gkv' }, { art: 'pt' }, { art: 'ls', pseudo: true }] }).replace(/<[^>]+>/g, ''));
  pr('Fahrtenbuch: Anzahl je Art in Klammern', n.trim() === '(2 GKV · 1 PT)', n);
  // PDF: Seite passt beim Oeffnen ganz in die Ansicht (Querformat)
  const pdf = await p.evaluate(async ()=>{
    const { PDFDocument } = await (async ()=>{ await libSkriptLaden('lib/pdf-lib.min.js', ()=> false); return window.PDFLib; })();
    const d = await PDFDocument.create(); d.addPage([595, 842]); const blob = new Blob([await d.save()], { type: 'application/pdf' });
    betaPdfAnzeigen({ titel: 'Test', blob }); await new Promise(r=> setTimeout(r, 2500));
    const c = document.querySelector('#betaPdfAnsicht canvas'), s = document.querySelector('#betaPdfAnsicht .beta-pdf-seiten');
    const rc = c.getBoundingClientRect(), rs = s.getBoundingClientRect();
    document.querySelector('#betaPdfAnsicht [data-a="klein"]').click(); await new Promise(r=> setTimeout(r, 100));
    const rc2 = c.getBoundingClientRect();
    const laden = !!document.querySelector('#betaPdfAnsicht [data-a="laden"]');
    document.querySelector('#betaPdfAnsicht [data-a="zu"]').click();
    return { ganz: rc.height <= rs.height + 1, kleinerGehtNicht: Math.abs(rc2.width - rc.width) < 1, laden };
  });
  pr('PDF quer: ganze Seite sichtbar, kleiner als ganz geht nicht, Knopf „Herunterladen“', pdf.ganz && pdf.kleinerGehtNicht && pdf.laden, pdf);
  // offene Rechnungen: ausgebuchte erscheinen nicht
  const o = await p.evaluate(async ()=>{
    const ziel = betaZiel(), zk = betaZielKey(ziel), vor = new Date(Date.now() - 50 * 86400000), dt = (d)=> zz2(d.getDate()) + '.' + zz2(d.getMonth() + 1) + '.' + d.getFullYear();
    const zeile = (nr, renu, u)=>{ const v = new Array(30).fill(''); v[0] = 'P'; v[1] = dt(vor); v[5] = 'Test' + nr; v[6] = 'A'; v[15] = 50; v[16] = renu; v[17] = xlDatumSerial(dt(vor)); v[20] = u; return { nr, v }; };
    const ue = { pfad: 'x', zeilen: [{ nr: 1, v: [] }, zeile(5, 'R-1', 'LXP:1'), zeile(6, 'R-2', 'LXP:1 | OFFEN:AUS')] };
    betaGesamtCache = { zielKey: zk, ue, ana: uebersichtAuswerten(ue), dateien: new Map() };
    await ansichtRechnungenGesamt(false); await new Promise(r=> setTimeout(r, 400));
    const offen = [...document.querySelectorAll('.offen-zeile b')].map(b=> b.textContent);
    return { offen, weg: !!document.querySelector('.offen-weg'), status: [...document.querySelectorAll('#gesamtListe .gs-rechts small')].map(x=> x.textContent) };
  });
  pr('Offene Rechnungen: „wird nicht bezahlt“ verschwindet aus der Liste (✕ vorhanden), bleibt in der Übersicht', o.offen.includes('Test5, A') && !o.offen.includes('Test6, A') && o.weg && o.status.includes('nicht bezahlt'), o);
  await p.context().close();
};
