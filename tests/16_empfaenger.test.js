// Rechnungsempfänger (Bestatter / Patientenadresse): Klick markiert nur, „Übernehmen“ bestätigt (Wunsch 17.11.2026)
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  const opts = [{ key: 'bestatter', label: 'Bestatter: Pietät Muster, Hauptstraße 1, 77652 Offenburg' }, { key: 'patient', label: 'Patientenadresse (Angehörige): Weg 2, 77654 Offenburg' }];
  p.evaluate((o)=> lsEmpfaengerWaehlen(o, 'bestatter').then((x)=>{ window.__empf = x; }), opts);
  await p.waitForSelector('.beta-overlay.aktiv [data-empf]');
  await p.click('.beta-overlay.aktiv [data-empf="patient"]'); await p.waitForTimeout(300);
  const nachKlick = await p.evaluate(()=> ({ offen: !!document.querySelector('.beta-overlay.aktiv [data-empf]'), an: [...document.querySelectorAll('.empf-wahl.an')].map((x)=> x.dataset.empf), knopf: (document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer') || {}).textContent, ergebnis: window.__empf }));
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/16_empfaenger.png' });
  pr('Klick markiert nur (Fenster bleibt offen, Auswahl sichtbar), Knopf „Übernehmen“', nachKlick.offen && nachKlick.an.join() === 'patient' && nachKlick.knopf === 'Übernehmen' && nachKlick.ergebnis === undefined, nachKlick);
  await p.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click()); await p.waitForTimeout(300);
  pr('„Übernehmen“ übernimmt die markierte Anschrift', await p.evaluate(()=> window.__empf) === 'patient');
  p.evaluate((o)=> lsEmpfaengerWaehlen(o, 'patient').then((x)=>{ window.__empf = x; }), opts);
  await p.waitForSelector('.beta-overlay.aktiv [data-empf]');
  await p.evaluate(()=> [...document.querySelectorAll('.beta-overlay.aktiv .beta-overlay-knoepfe button')].find((b)=> /Abbrechen/.test(b.textContent)).click()); await p.waitForTimeout(300);
  pr('„Abbrechen“ übernimmt nichts', await p.evaluate(()=> window.__empf) === null);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
