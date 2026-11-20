// Quartalsübersicht: Passen Datum und Quartal (Spalte A) eines Diensts nicht zusammen, zeigt die Übersicht einen Hinweis
// (Fehler 20.11.2026: Datum vertippt, der Dienst erschien mit fremdem Datum im Quartal). Das Quartal kommt wie bisher aus
// Spalte A; nur wenn dort keine Zahl 1-4 steht, aus dem Datum.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis, { demo: true });
  const r = await p.evaluate(()=>{
    const ser = (j, m, t)=> Math.round((Date.UTC(j, m - 1, t) - Date.UTC(1899, 11, 30)) / 86400000);
    const z = [[], [], [], []];
    const dienst = (a, datum, zeit, arzt, name, euro)=>{ const k = new Array(33).fill(''); k[0] = a; k[1] = datum; k[2] = zeit; k[3] = name; k[32] = euro;
      const k2 = new Array(33).fill(''); k2[1] = 'Fahrdienst'; k2[2] = arzt; z.push(k, k2); };
    dienst(1, ser(2025, 3, 20), '18-23', 'Dr. Muster', 'Fall A', 40);
    dienst(1, ser(2025, 4, 2), '18-23', 'Dr. Muster', 'Fall B', 50);    // Datum vertippt (gemeint März), Spalte A richtig
    dienst('', ser(2025, 4, 20), '18-23', 'Dr. Muster', 'Fall D', 70);  // Spalte A leer: gehört zum vorigen Dienst (wie bisher)
    dienst('x', ser(2025, 4, 25), '18-23', 'Dr. Muster', 'Fall E', 80); // keine Quartalszahl: aus dem Datum
    dienst(2, ser(2025, 5, 10), '18-23', 'Dr. Muster', 'Fall C', 60);
    const d = fahrdienstZeilenAuswerten(z);
    const q = Object.fromEntries(d.quartale.map(x=> [x.quartal, x.aerzte.map(a=> a.arzt + ': ' + a.dienste.join(' / '))]));
    const el = document.createElement('div'); el.id = 'fahrdienstInhalt'; document.body.appendChild(el);
    fahrdienstAuswertungRendernBasis(d);
    const hinweis = (el.querySelector('.fd-quartal-abw') || {}).textContent || '';
    el.remove();
    return { q, abw: d.bloecke.filter(b=> b.quartalAbweichung).map(b=> b.datumText), hinweis };
  });
  pr('Quartal wie bisher aus Spalte A (Dienst 02.04.2025 mit „1“ bleibt im 1. Quartal), ohne Zahl aus dem Datum',
    JSON.stringify(r.q['Quartal 1 / 2025']) === JSON.stringify(['Dr. Muster: 20.03.2025, 18-23 Uhr / 02.04.2025, 18-23 Uhr']) &&
    JSON.stringify(r.q['Quartal 2 / 2025']) === JSON.stringify(['Dr. Muster: 25.04.2025, 18-23 Uhr / 10.05.2025, 18-23 Uhr']), r.q);
  pr('Hinweis nennt den Dienst, bei dem Datum und Quartal nicht zusammenpassen', r.abw.join() === '02.04.2025' && /02\.04\.2025 steht im 1\. Quartal/.test(r.hinweis) && /Datum oder das Quartal falsch/.test(r.hinweis), r);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await p.context().close();
};
