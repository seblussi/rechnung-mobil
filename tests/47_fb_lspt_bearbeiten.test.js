// Fahrtenbuch (Wunsch 25.11.2026): „Bearbeiten“ bei einem LS/PT-Fall ohne Fall in der App öffnet die Rechnungsmaske
// über die passende Zeile der Rechnungsübersicht (Name + Datum), Zurück führt ins Fahrtenbuch.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 900 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  const r = await p.evaluate(async ()=>{
    const ziel = betaZiel(), zk = betaZielKey(ziel);
    const v = new Array(30).fill(''); v[0] = 'x'; v[1] = '20.11.2026'; v[5] = 'Muster'; v[6] = 'Erika'; v[16] = 'LS-2026-0042';
    const ue = { zeilen: [{ nr: 1, v: new Array(30).fill('Kopf') }, { nr: 7, v }] };
    betaGesamtCache = { zielKey: zk, ue, ana: uebersichtAuswerten(ue), dateien: [] };
    let zurueck = 0;
    const vorher = ladeFaelle('ls').length + ladeFaelle('pt').length;
    const ok = await fbLsPtOeffnen({ name: 'Muster, Erika', art: 'ls' }, { tag: new Date(2026, 10, 20) }, ()=>{ zurueck++; });
    await new Promise(r=> setTimeout(r, 800));
    const maske = !!document.querySelector('#app input, #app textarea') && !document.querySelector('.fb-tabs');
    const nachher = ladeFaelle('ls').length + ladeFaelle('pt').length; const kopf = (document.querySelector('#app h1, #app h2, header') || {}).textContent || '';
    const falsch = await fbLsPtOeffnen({ name: 'Niemand, Hans', art: 'ls' }, { tag: new Date(2026, 10, 20) }, null);
    const altDatum = await fbLsPtOeffnen({ name: 'Muster, Erika', art: 'ls' }, { tag: new Date(2026, 9, 1) }, null);
    return { ok, maske, neu: nachher - vorher, falsch, altDatum, kopf };
  });
  pr('LS-Fall aus dem Fahrtenbuch: Zeile gefunden, Rechnungsmaske offen', r.ok && r.maske && r.neu === 1, r);
  pr('Anderer Name oder Datum weit weg: nichts geöffnet', r.falsch === false && r.altDatum === false, r);
  await p.context().close();
};
