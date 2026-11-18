// Sicherheitsbericht Architektur 5: Speicher-/Abgleichsfehler sichtbar, lokales Fehlerprotokoll ohne Patientendaten
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  const r = await p.evaluate(()=>{
    localStorage.removeItem('fehler_protokoll');
    const e = new Error('Datei "Mustermann, Erika" nicht gefunden: KVBW Onedrive/fertige Rechnungen/LS_041_Mustermann.pdf, geb. 01.02.1950, IBAN DE89370400440532013000, mail erika@beispiel.de'); e.status = 404;
    fehlerMelden('abgleich', e, 'Abgleich mit OneDrive fehlgeschlagen, wird später erneut versucht');
    const toast = (document.querySelector('.app-toast, #appToast, .toast') || {}).textContent || '';
    return { l: fehlerProtokollLesen(), roh: localStorage.getItem('fehler_protokoll'), toast };
  });
  pr('Fehler steht im Protokoll (Bereich, Status)', r.l.length === 1 && r.l[0].b === 'abgleich' && r.l[0].s === '404', r.l);
  pr('ohne Patientendaten: kein Name, kein Dateiname/Pfad, kein Geburtsdatum, keine IBAN, keine E-Mail', !/Mustermann|Erika|LS_041|1950|DE89|beispiel/.test(r.roh), r.roh);
  pr('Meldung auf dem Bildschirm mit Verweis aufs Protokoll', /Abgleich mit OneDrive fehlgeschlagen.*Fehlerprotokoll/.test(r.toast), r.toast);
  await p.evaluate(()=>{ Promise.reject(new Error('Test im Hintergrund')); });
  await p.waitForTimeout(300);
  pr('unerwartete Fehler im Hintergrund werden mitgeschrieben', await p.evaluate(()=> fehlerProtokollLesen().some((x)=> x.b === 'hintergrund' && /Test im Hintergrund/.test(x.m))));
  await p.evaluate(()=>{ ansichtEinstellungen(); });
  await p.waitForSelector('#btnFehlerProtokoll', { state: 'attached' });
  await p.evaluate(()=> document.getElementById('btnFehlerProtokoll').click());
  await p.waitForSelector('.beta-overlay.aktiv table');
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/20_fehlerprotokoll.png' });
  pr('Einstellungen › Datensicherung › Fehlerprotokoll zeigt die Einträge', await p.evaluate(()=> document.querySelectorAll('.beta-overlay.aktiv tr').length === 2));
  pr('keine Skriptfehler', p.fehler.filter((x)=> !/Test im Hintergrund/.test(x)).length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
