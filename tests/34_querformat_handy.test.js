// Startseite am Handy quer (Wunsch 21.11.2026): links Uhr, darunter LS/PT/GKV und „Dienst beenden“; Mitte Dienst;
// rechts Karte. Datum/Uhrzeit-Zeile entfaellt, OneDrive-Anzeige mittig unter dem Zahnrad. Tablet bleibt wie bisher.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const messen = async (w, h)=>{
    const p = await geraet(browser, basis, { demo: true });
    await p.setViewportSize({ width: w, height: h });
    await oeffnen(p, basis, { demo: true });
    await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(3000);
    const r = await p.evaluate(()=>{
      const q = document.querySelector('.quer-start'); if(!q) return { quer: false };
      const box = (s)=>{ const e = document.querySelector(s); if(!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, sichtbar: b.width > 0 && getComputedStyle(e).display !== 'none' }; };
      const uhr = box('.quer-sp1 .quer-uhr'), kach = box('.quer-sp1 .kachelreihe'), ende = box('#dsDienstEnde'), mitte = box('.quer-sp2'), karte = box('.quer-sp3'), zahn = box('#btnEinstellungen'), sync = box('.ds-sync');
      const kodeBreit = [...document.querySelectorAll('.quer-sp1 .kachelreihe .karte')].every((k)=> k.scrollWidth <= k.clientWidth + 1);
      return { quer: true, spalten: getComputedStyle(q).gridTemplateColumns.split(' ').length, uhrzeit: box('.ds-zeile-neu .ds-uhrzeit'), titel: box('.ds-neu-titel'),
        uhr, kach, ende, mitte, karte, zahn, sync, kodeBreit };
    });
    await p.context().close(); return r;
  };
  for(const [w, h] of [[932, 430], [844, 390]]){
    const r = await messen(w, h);
    pr(w + '×' + h + ': drei Spalten – Uhr links, Dienst Mitte, Karte rechts', r.quer && r.spalten === 3 && r.uhr.r <= r.mitte.l && r.mitte.r <= r.karte.l, r);
    pr(w + '×' + h + ': unter der Uhr LS/PT/GKV, darunter „Dienst beenden“; Kacheltext passt', r.kach.t >= r.uhr.b - 2 && r.ende.t >= r.kach.b - 2 && r.kodeBreit, { uhr: r.uhr, kach: r.kach, ende: r.ende });
    pr(w + '×' + h + ': keine kleine Datum/Uhrzeit-Zeile und kein „Neuer Fall“', !r.uhrzeit.sichtbar && !r.titel.sichtbar, r);
    const mz = (r.zahn.l + r.zahn.r) / 2, ms = (r.sync.l + r.sync.r) / 2;
    pr(w + '×' + h + ': OneDrive-Anzeige mittig unter dem Zahnrad', r.sync.t >= r.zahn.b - 8 && r.sync.t <= r.zahn.b + 14 && (Math.abs(mz - ms) < 14 || r.sync.r >= w - 12), { zahn: r.zahn, sync: r.sync });
  }
  const t = await messen(1180, 820);
  pr('Tablet quer (1180×820): bisherige Anordnung mit Datum/Uhrzeit und Kacheln oben', t.quer && t.uhrzeit.sichtbar && t.titel.sichtbar && t.kach.b <= t.uhr.t + 2, t);
};
