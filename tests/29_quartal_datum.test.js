// Quartalsübersicht: Das Quartal eines Diensts kommt aus dem Datum, nicht aus Spalte A des Fahrtenbuchs
// (Fehler 20.11.2026: Stand in Spalte A eine andere Zahl, erschien der Dienst bei einem Vertretungsarzt im falschen Quartal).
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
    dienst(1, ser(2025, 4, 2), '18-23', 'Dr. Muster', 'Fall B', 50);    // Spalte A falsch: April = Quartal 2
    dienst(2, ser(2025, 5, 10), '18-23', 'Dr. Muster', 'Fall C', 60);
    const d = fahrdienstZeilenAuswerten(z);
    const q = Object.fromEntries(d.quartale.map(x=> [x.quartal, x.aerzte.map(a=> a.arzt + ': ' + a.dienste.join(' / '))]));
    const el = document.createElement('div'); el.id = 'fahrdienstInhalt'; document.body.appendChild(el);
    fahrdienstAuswertungRendernBasis(d);
    const hinweis = (el.querySelector('.fd-quartal-abw') || {}).textContent || '';
    el.remove();
    return { q, abw: d.bloecke.filter(b=> b.quartalAbweichung).map(b=> b.datumText), hinweis };
  });
  pr('Dienst vom 02.04.2025 mit „1“ in Spalte A steht im 2. Quartal, nicht im 1.',
    JSON.stringify(r.q['Quartal 1 / 2025']) === JSON.stringify(['Dr. Muster: 20.03.2025, 18-23 Uhr']) &&
    JSON.stringify(r.q['Quartal 2 / 2025']) === JSON.stringify(['Dr. Muster: 02.04.2025, 18-23 Uhr / 10.05.2025, 18-23 Uhr']), r.q);
  pr('Hinweis nennt den Dienst mit abweichender Spalte A', r.abw.join() === '02.04.2025' && /02\.04\.2025 \(Spalte A: 1\)/.test(r.hinweis), r);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await p.context().close();
};
