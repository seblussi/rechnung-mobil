// Abrechnungsregeln Wegegeld / Reiseentschädigung (GOÄ §§ 8, 9): Beträge und die Entscheidung allein nach Luftlinie.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  const r = await p.evaluate(()=> ({
    tag: WEGEGELD_TAG.map((x)=> [x.bisKm, x.betrag]), nacht: WEGEGELD_NACHT.map((x)=> [x.bisKm, x.betrag]),
    grenze: [sollReiseGelten(10, 24.9), sollReiseGelten(120, 25), sollReiseGelten(10, 25.01), sollReiseGelten(0, 60)],
    reise: [reiseGesamtBetrag('60,2'), reiseGesamtBetrag('52'), reiseGesamtBetrag(''), reiseGesamtBetrag('abc')],
    luft: kmLuftlinieEinfach({ lat: 48.7758, lon: 9.1829 }, { lat: 48.4011, lon: 9.9876 }),   // Stuttgart – Ulm
    null0: kmLuftlinieEinfach({ lat: 48.5, lon: 8 }, { lat: 48.5, lon: 8 })
  }));
  pr('Wegegeld Tag: 3,58 / 6,65 / 10,23 / 15,34 € bis 2 / 5 / 10 / 25 km', JSON.stringify(r.tag) === '[[2,3.58],[5,6.65],[10,10.23],[25,15.34]]', r.tag);
  pr('Wegegeld Nacht: 7,16 / 10,23 / 15,34 / 25,56 €', JSON.stringify(r.nacht) === '[[2,7.16],[5,10.23],[10,15.34],[25,25.56]]', r.nacht);
  pr('bis 25 km Luftlinie Wegegeld – auch bei langer Fahrstrecke', r.grenze[0] === false && r.grenze[1] === false, r.grenze);
  pr('über 25 km Luftlinie Reiseentschädigung – unabhängig von der Fahrstrecke', r.grenze[2] === true && r.grenze[3] === true, r.grenze);
  pr('Reiseentschädigung: 51,13 € + 0,26 € je angefangenem km', r.reise[0].basis === 51.13 && r.reise[0].kmGerundet === 61 && r.reise[0].kmZeile === 15.86 && r.reise[0].gesamt === 66.99 && r.reise[1].kmZeile === 13.52 && r.reise[1].gesamt === 64.65, r.reise.slice(0, 2));
  pr('Reiseentschädigung ohne gültige km: nur Grundbetrag', r.reise[2].gesamt === 51.13 && r.reise[3].gesamt === 51.13);
  pr('Luftlinie Stuttgart–Ulm rund 72 km, gleicher Ort 0 km', r.luft > 70 && r.luft < 75 && r.null0 === 0, r.luft);
  await p.context().close();
};
