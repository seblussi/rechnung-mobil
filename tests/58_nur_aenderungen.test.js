// Wunsch 27.11.2026: Rechnungsverwaltung bleibt auf dem Geraet, nachgeladen wird nur Geaendertes
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const n = [...document.querySelectorAll('button')].find(b=> /Nein, danke/.test(b.textContent)); if(n) n.click(); });
  const r = await p.evaluate(async ()=>{
    const ww = (ms)=> new Promise(r=> setTimeout(r, ms)); LS.set('seitenhilfe', false);
    const log = []; const of = window.fetch; window.fetch = function(u){ log.push(String(u && u.url || u)); return of.apply(this, arguments); };
    await ansichtRechnungenGesamt(false); await ww(3000);
    log.length = 0; await ansichtRechnungenGesamt(false); await ww(2500);
    const ohne = log.filter(u=> !/\?\$select=cTag/.test(u)).length, stempel = log.length;
    const e = betaEintraegeBauen(betaGesamtCache).find(x=> x.typ === 'ORIG' && !x.bezahlt && x.abgeschickt && !x.ausgebucht);
    window.betaFrage = async ()=> true; await betaOffenAusbuchen([e], true);
    log.length = 0; await ansichtRechnungenGesamt('still');
    const sofort = !!document.querySelector('#gesamtListe .fall-zeile') && !/wird gelesen/i.test(document.getElementById('gesamtListe').textContent);
    await ww(3000);
    return { ohne, stempel, sofort, ordner: log.filter(u=> /fertige%20Rechnungen:?\/children|fertige%20Rechnungen:\/children/.test(u)).length,
      excel: log.filter(u=> /workbook|\/content/.test(u)).length, aus: betaEintraegeBauen(betaGesamtCache).find(x=> x.key === e.key).ausgebucht };
  });
  pr('Unverändert: nur die zwei kleinen Stempel-Abfragen, nichts wird neu geladen', r.ohne === 0 && r.stempel === 2, r);
  pr('Nach eigener Änderung: Liste bleibt sofort sichtbar', r.sofort, r);
  pr('Nach eigener Änderung: nur die Excel wird neu gelesen, nicht der Rechnungsordner', r.excel > 0 && r.ordner === 0 && r.aus === true, r);
  await p.context().close();
};
