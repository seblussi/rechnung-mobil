// Ohne Microsoft-Anmeldung: Anmeldeknopf in Rechnungsverwaltung und Fahrtenbuch (Wunsch 17.11.2026).
// Startseite: Fälle auf der kleinen Karte nur, wenn „Fälle in diesem Dienst“ ausgeklappt ist; kein „Noch keine Einsätze“.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  await p.evaluate(()=>{ iniCacheSpeichern({ ARZTNAME: 'Max Muster', ARZTADRESSE1: 'Weg 1', ARZTADRESSE2: '77652 Offenburg', EINRICHTUNG_FERTIG: '1' }); LS.set('einrichtung_fertig', true); LS.set('einrichtung_schritt', null); });
  await p.evaluate(()=> ansichtRechnungenGesamt()); await p.waitForTimeout(2500);
  const rv = await p.evaluate(()=> ({ knopf: !!document.querySelector('.ms-anmelden-knopf'), text: (document.getElementById('app') || {}).textContent.slice(0, 300) }));
  pr('Rechnungsverwaltung ohne Anmeldung: Knopf „Bei Microsoft anmelden“', rv.knopf, rv);
  await p.evaluate(()=> ansichtFahrtenbuch()); await p.waitForTimeout(2500);
  const fb = await p.evaluate(()=> ({ knopf: !!document.querySelector('.ms-anmelden-knopf'), text: (document.getElementById('app') || {}).textContent.slice(0, 300) }));
  pr('Fahrtenbuch ohne Anmeldung: Knopf „Bei Microsoft anmelden“', fb.knopf, fb);
  await p.context().close();

  const d = await geraet(browser, basis, { demo: true });
  await oeffnen(d, basis);
  const faelleKarte = ()=> d.evaluate(()=> ({ titel: ((document.querySelector('#skKarte .sk-titel b') || {}).textContent || ''), orte: document.querySelectorAll('#skKarte .sk-ort').length, leer: /Noch keine Einsätze/.test((document.getElementById('skKarte') || {}).textContent || '') }));
  await d.evaluate(()=>{
    const h = new Date(), vor = new Date(h.getTime() - 3 * 3600000), bis = new Date(h.getTime() + 5 * 3600000), z = (x)=> String(x.getHours()).padStart(2, '0') + ':00';
    LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Fahrdienst', schicht: 'Nacht 1' });
    const t = new Date(h.getTime() - 3600000); gkvFaelleSpeichern([{ id: 'g1', name: 'Muster, Erika', datum: liveIso(t), zeit: String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'), auswahl: { nfp: { anz: 1 } }, adresse: { lat: 48.47, lon: 7.94 } }]);
    try{ sessionStorage.removeItem('dienst_liste_zu'); }catch(_){}
    ansichtStart();
  });
  await d.waitForTimeout(2500);
  const auf = await faelleKarte();
  await d.evaluate(()=> document.querySelector('.ds-dz-auf').click()); await d.waitForTimeout(2500);
  const zu = await faelleKarte();
  if(process.env.BILDER) await d.screenshot({ path: process.env.BILDER + '/18_karte_zugeklappt.png', fullPage: true });
  pr('Liste ausgeklappt: Fall in der Karte; zugeklappt: nicht in der Karte, Titel „Standort“, kein „Noch keine Einsätze“', auf.orte >= 1 && zu.orte === 0 && /Standort/.test(zu.titel) && !zu.leer && !auf.leer, { auf, zu });
  pr('keine Skriptfehler', d.fehler.length === 0, d.fehler.slice(0, 3));
  await d.context().close();
};
