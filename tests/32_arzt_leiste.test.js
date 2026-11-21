// Quartalsübersicht, Karte je vertretenem Arzt (Wunsch 21.11.2026, Entwurf B): ohne Rechnung ein Knopf rechts neben
// den Diensten; mit Rechnung eine Leiste unter der Karte (Rechnung, Betrag, Zahlungsstatus; darunter PDF, Bearbeiten, Löschen).
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis, { demo: true });
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); });
  await p.evaluate(async ()=>{ await ansichtFahrdienstAuswertung(); });
  await p.waitForSelector('.fahrdienst-arzt-karte', { timeout: 20000 }); await p.waitForTimeout(1500);
  const r = await p.evaluate(async ()=>{
    const d = fahrdienstAuswertungCache; const q = [...d.quartale].reverse().find(q=> q.aerzte.length >= 2);
    const a = q.aerzte[0];
    const c = LS.get(EIGENE_POS_CACHE, null) || {}; c.aerzteMigration = 'v1';
    c.aerzteRechnungen = [{ arzt: a.arzt, quartal: q.quartal, renu: 'AR-2026-002', summe: 812.4, summeBerechnet: 795, bezahlt: '2026-11-20', datei: 'AR-2026-002', datum: '19.11.2026' }];
    LS.set(EIGENE_POS_CACHE, c); msGraphStatus = 'angemeldet'; fahrdienstAuswertungRendern(d);
    await new Promise(r=> setTimeout(r, 500));
    const k = [...document.querySelectorAll('.fahrdienst-arzt-karte')];
    const mit = k.find(x=> x.querySelector('.ar-leiste')), ohne = k.find(x=> !x.querySelector('.ar-leiste'));
    const l = mit && mit.querySelector('.ar-leiste');
    const reihe = l ? [...l.querySelectorAll('.ar-reihe button')].map(b=> b.textContent) : [];
    const kr = mit.getBoundingClientRect(), lr = l.getBoundingClientRect();
    const knoepfe = l ? [...l.querySelectorAll('.ar-reihe button')].map(b=> b.getBoundingClientRect()) : [];
    const eineZeile = knoepfe.length === 3 && knoepfe.every(b=> Math.abs(b.top - knoepfe[0].top) < 1);
    mit.scrollIntoView({ block: 'center' });
    return {
      leisteUnten: l.parentElement === mit && Math.abs(lr.left - kr.left) < 30 && lr.width > kr.width * 0.8,
      text: l.querySelector('.ar-renu').textContent, status: l.querySelector('.ar-status').textContent, an: l.querySelector('.ar-status').classList.contains('an'),
      reihe, eineZeile, ohneKnopf: ohne ? [...ohne.querySelectorAll('.ar-knoepfe button')].map(b=> b.textContent) : null,
      ohneRechts: ohne ? !!ohne.querySelector('.fd-arzt-zeile > .ar-knoepfe') : false
    };
  });
  pr('Mit Rechnung: Leiste über die ganze Kartenbreite unter den Summen', r.leisteUnten, r);
  pr('Leiste: Rechnung, Betrag, Abweichung und Status „✓ erhalten 20.11.“', /AR-2026-002 · 812,40 €/.test(r.text) && /berechnet 795,00 €/.test(r.text) && r.status === '✓ erhalten 20.11.' && r.an, r);
  pr('Leiste: PDF, Bearbeiten, 🗑 nebeneinander in einer Reihe', JSON.stringify(r.reihe) === JSON.stringify(['PDF', 'Bearbeiten', '🗑']) && r.eineZeile, r.reihe);
  pr('Ohne Rechnung: wie bisher ein Knopf „Rechnung erstellen“ rechts neben den Diensten', JSON.stringify(r.ohneKnopf) === JSON.stringify(['Rechnung erstellen']) && r.ohneRechts, r);
  await p.evaluate(()=> document.body.classList.add('dunkel')); await p.waitForTimeout(300);
  const box = await p.evaluate(()=>{ const l = document.querySelector('.ar-leiste').closest('.fahrdienst-arzt-karte'); const n = l.nextElementSibling; const a = l.getBoundingClientRect(), b = (n || l).getBoundingClientRect(); return { x: 0, y: Math.max(0, a.top - 12), width: innerWidth, height: b.bottom - a.top + 24 }; });
  if(process.env.BILD) await p.screenshot({ path: process.env.BILD, clip: box });
  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await p.context().close();
};
