// Wunsch 21.11.2026: Nach „Dienst beenden“ bleibt die Uhr 12 h sichtbar (wie nach regulärem Dienstende), bis ein neuer Dienst
// beginnt. Übersicht der Einsatzorte: der eigene Standort zieht die Karte nicht mehr weit heraus.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 1300 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const start = async ()=>{ await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(1500);
    await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); }); };
  await p.evaluate(()=>{ const h = new Date(), z = (d)=> String(d.getHours()).padStart(2, '0') + ':00', vor = new Date(h.getTime() - 2 * 3600000), bis = new Date(h.getTime() + 4 * 3600000);
    LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Fahrdienst', schicht: '' }); });
  await start();
  pr('Ausgangslage: Dienst läuft, „Dienst beenden“ da', await p.evaluate(()=> !!document.getElementById('dsDienstEnde') && designDienstInfo().modus === 'laufend'));
  await p.evaluate(()=> document.getElementById('dsDienstEnde').click());
  await p.waitForFunction(()=> [...document.querySelectorAll('.beta-overlay.aktiv button')].some((b)=> b.textContent === 'Beenden'));
  await p.evaluate(()=> [...document.querySelectorAll('.beta-overlay.aktiv button')].find((b)=> b.textContent === 'Beenden').click());
  await p.waitForTimeout(1500);
  const n = await p.evaluate(()=> ({ uhr: !!document.getElementById('dsRing'), modus: designDienstInfo().modus, ende: !!document.getElementById('dsDienstEnde'), neu: !!document.getElementById('dsDienstStart'), aktiv: !!liveDienstAktiv(), fuer: !!liveDienstFuer(new Date(Date.now() + 2 * 3600000)), status: (document.querySelector('.ds-status') || {}).textContent || '' }));
  pr('Nach „Dienst beenden“: Uhr bleibt, „Dienst beendet“, Knopf „Dienst starten“', n.uhr && n.modus === 'vorbei' && !n.ende && n.neu && /beendet/.test(n.status), n);
  pr('Beendeter Dienst läuft nicht mehr: neue Fälle danach gehören nicht dazu', !n.aktiv && !n.fuer, n);
  await p.evaluate(()=>{ const d = LS.get('live_dienst', null); d.beendet = new Date(Date.now() - 13 * 3600000).toISOString(); LS.set('live_dienst', d); });
  await start();
  pr('13 h nach dem Beenden: Dienst weg', await p.evaluate(()=> !LS.get('live_dienst', null) && designDienstInfo().modus !== 'vorbei'));
  // neuer Dienst ersetzt den beendeten
  await p.evaluate(()=>{ const h = new Date(), z = (d)=> String(d.getHours()).padStart(2, '0') + ':00'; LS.set('live_dienst', { datum: liveIso(h), von: z(h), bis: z(new Date(h.getTime() - 3600000 * 2)), art: 'Fahrdienst', schicht: '', beendet: new Date().toISOString() }); });
  await p.evaluate(()=>{ const h = new Date(), z = (d)=> String(d.getHours()).padStart(2, '0') + ':00', vor = new Date(h.getTime() - 3600000), bis = new Date(h.getTime() + 5 * 3600000); LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Sitzdienst', schicht: '' }); });
  await start();
  pr('Neuer Dienst: läuft wieder normal', await p.evaluate(()=> designDienstInfo().modus === 'laufend' && !!document.getElementById('dsDienstEnde')));
  // Übersicht ohne eigenen Standort
  const g = await p.evaluate(()=>{ const d = { pois: [{ lat: 48.47, lon: 7.94, kl: 'gkv' }, { lat: 48.50, lon: 7.99, kl: 'ls' }, { lat: 52.52, lon: 13.40, kl: 'ich' }] };
    const a = miniFitAnsicht(d, 354, 468, { lat: 48.5, lon: 7.9, z: 11, bw: 560, bh: 330 }), b = miniFitAnsicht({ pois: [d.pois[2]] }, 354, 468, { lat: 48.5, lon: 7.9, z: 11, bw: 560, bh: 330 });
    return { z: a.z, lat: a.lat, lon: a.lon, nurIch: Math.abs(b.lat - 52.52) < 0.1 }; });
  pr('Übersicht: eigener Standort weit weg zieht die Karte nicht heraus (Zoom ' + g.z.toFixed(1) + ')', g.z > 10 && Math.abs(g.lat - 48.48) < 0.05 && g.nurIch, g);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
