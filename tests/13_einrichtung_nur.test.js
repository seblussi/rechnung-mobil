// Einrichtung unvollständig (Wunsch 17.11.2026): nur die fehlenden Schritte öffnen, fehlende Felder markieren,
// „Speichern und fertig“ und danach zurück, wo man vorher war – nicht den ganzen Assistenten durchlaufen.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  await p.evaluate(()=>{
    iniCacheSpeichern({ ARZTNAME: 'Max Muster', ARZTFUNKTION: 'Arzt', ARZTADRESSE1: 'Hauptstraße 1', ARZTADRESSE2: '77652 Offenburg', ARZTEMAIL: 'max@beispiel.de',
      GKV_STARTADRESSE: 'Wachweg 2, 77652 Offenburg', BRIEF_BENUTZER: 'x', BRIEF_APIKEY: 'y', BRIEF_ZUGANGSCODE: 'abc', EINRICHTUNG_FERTIG: '01.11.2026' });
    window.iniAenderungenSchreiben = async (a, b)=>{ iniCacheSpeichern(Object.assign({}, b, a)); return { geschrieben: Object.keys(a).length }; };
    window.iniVonOneDriveLaden = async ()=> iniCacheLaden();
    LS.set('einrichtung_fertig', true); LS.set('einrichtung_schritt', null);
    ansichtFahrtenbuch();
  });
  await p.waitForTimeout(800);
  const fehlt = await p.evaluate(async ()=> (await einrFehlt()).map((x)=> x.schritt + ':' + (x.felder || []).join(',')));
  pr('nur die Bankverbindung fehlt', fehlt.length === 1 && fehlt[0] === 'daten:ARZTIBAN,ARZTBANKNAME', fehlt);
  p.evaluate(async ()=> einrUnvollstaendigFragen(await einrFehlt(), true));
  await p.waitForSelector('.beta-overlay.aktiv .btn-primaer', { timeout: 10000 });
  await p.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await p.waitForSelector('[data-ini="ARZTIBAN"]', { timeout: 10000 }); await p.waitForTimeout(400);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/13_nur_iban.png' });
  const r = await p.evaluate(()=>{ const i = document.querySelector('[data-ini="ARZTIBAN"]'); const w = document.querySelector('.einr-knoepfe .btn-primaer');
    const bank = document.querySelector('[data-ini="ARZTBANKNAME"]'), bic = document.querySelector('[data-ini="ARZTBIC"]');
    const reihe = [...document.querySelectorAll('[data-ini="ARZTIBAN"], [data-ini="ARZTBANKNAME"], [data-ini="ARZTBIC"]')].map((x)=> x.dataset.ini).join(',');
    return { markiert: i.classList.contains('einr-markiert'), fokus: document.activeElement === i, knopf: w.textContent, balken: document.querySelectorAll('.einr-fort span').length, markierte: document.querySelectorAll('.einr-markiert').length, reihe, gesperrt: bank.readOnly && bic.readOnly }; });
  pr('direkt „Deine Daten“, IBAN markiert und fokussiert, Knopf „Speichern und fertig“, Fortschritt 1 Schritt', r.markiert && r.fokus && r.markierte === 2 && r.knopf === 'Speichern und fertig' && r.balken === 1, r);
  pr('IBAN steht vor Bank und BIC; Bank und BIC ausgegraut, solange die IBAN fehlt', r.reihe === 'ARZTIBAN,ARZTBANKNAME,ARZTBIC' && r.gesperrt, r);
  await p.evaluate(()=> document.querySelector('.einr-knoepfe .btn-primaer').click()); await p.waitForTimeout(400);
  const ohne = await p.evaluate(()=> ({ einr: !!document.querySelector('.einr'), info: (document.getElementById('einrDatenInfo') || {}).textContent }));
  pr('ohne Bankverbindung lässt sich nicht speichern', ohne.einr && /IBAN/.test(ohne.info || ''), ohne);
  await p.fill('[data-ini="ARZTIBAN"]', 'DE89 3704 0044 0532 0130 00'); await p.dispatchEvent('[data-ini="ARZTIBAN"]', 'input'); await p.waitForTimeout(800);
  const auto = await p.evaluate(()=> ({ bank: document.querySelector('[data-ini="ARZTBANKNAME"]').value, bic: document.querySelector('[data-ini="ARZTBIC"]').value, gesperrt: document.querySelector('[data-ini="ARZTBANKNAME"]').readOnly }));
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/13_iban_bank.png' });
  pr('Bank und BIC kommen aus der IBAN (bleiben ausgegraut)', /Commerzbank/i.test(auto.bank) && /^COBADE/.test(auto.bic) && auto.gesperrt, auto);
  await p.evaluate(()=> document.querySelector('.einr-knoepfe .btn-primaer').click());
  await p.waitForFunction(()=> !document.querySelector('.einr'), null, { timeout: 15000 }).catch(()=>{});
  await p.waitForTimeout(800);
  const nach = await p.evaluate(()=> ({ titel: (document.getElementById('titel') || document.querySelector('header h1') || {}).textContent, einr: !!document.querySelector('.einr'), iban: (iniCacheLaden().werte || {}).ARZTIBAN, nur: LS.get('einr_nur', null), schritt: LS.get('einrichtung_schritt', null), info: (document.getElementById('einrDatenInfo') || {}).textContent }));
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/13_nur_zurueck.png' });
  pr('nach dem Speichern: IBAN gespeichert, kein weiterer Schritt, zurück im Fahrtenbuch', !nach.einr && /DE89/.test(nach.iban || '') && !nach.nur && !nach.schritt && /Fahrtenbuch/.test(nach.titel || ''), nach);
  // Abbrechen im ersten (einzigen) Schritt führt ebenfalls zurück, ohne zu speichern
  await p.evaluate(()=>{ const c = iniCacheLaden(); delete c.werte.ARZTIBAN; iniCacheSpeichern(c.werte); });
  p.evaluate(async ()=> einrUnvollstaendigFragen(await einrFehlt(), true));
  await p.waitForSelector('.beta-overlay.aktiv .btn-primaer', { timeout: 10000 });
  await p.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await p.waitForSelector('[data-ini="ARZTIBAN"]', { timeout: 10000 });
  const abbr = await p.evaluate(()=> document.querySelector('.einr-knoepfe .btn-sekundaer').textContent);
  await p.evaluate(()=> document.querySelector('.einr-knoepfe .btn-sekundaer').click()); await p.waitForTimeout(800);
  const n2 = await p.evaluate(()=> ({ einr: !!document.querySelector('.einr'), titel: (document.getElementById('titel') || document.querySelector('header h1') || {}).textContent, nur: LS.get('einr_nur', null) }));
  pr('„Abbrechen“ führt zurück, ohne Assistent', abbr === 'Abbrechen' && !n2.einr && !n2.nur && /Fahrtenbuch/.test(n2.titel || ''), { abbr, n2 });
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
