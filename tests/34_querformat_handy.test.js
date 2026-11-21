// Startseite am Handy quer (Wunsch 21.11.2026): links Uhr, darunter LS/PT/GKV und „Dienst beenden“; Mitte Dienst;
// rechts Karte. Datum/Uhrzeit-Zeile entfaellt, OneDrive-Anzeige zweizeilig unten unter der Leiste (Seite wie die Leiste). Tablet bleibt wie bisher.
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
      const uhr = box('.quer-sp1 .quer-uhr'), kach = box('.quer-sp1 .kachelreihe'), ende = box('#dsDienstEnde'), mitte = box('.quer-sp2'), karte = box('.quer-sp3'), zahn = box('#btnEinstellungen'), sync = box('.ds-sync'), nav = box('.ds-nav');
      const syncT = (document.querySelector('.ds-sync') || {}).innerText || '';
      document.body.classList.remove('nav-links'); document.body.classList.add('nav-rechts');
      const navR = box('.ds-nav'), syncR = box('.ds-sync');
      document.body.classList.remove('nav-rechts'); document.body.classList.add('nav-links');
      const zn = document.querySelector('.ds-zeile-neu'); zn.style.setProperty('display', 'none', 'important'); const navOhne = box('.ds-nav'); zn.style.removeProperty('display');
      const kodeBreit = [...document.querySelectorAll('.quer-sp1 .kachelreihe .karte')].every((k)=> k.scrollWidth <= k.clientWidth + 1);
      return { quer: true, spalten: getComputedStyle(q).gridTemplateColumns.split(' ').length, uhrzeit: box('.ds-zeile-neu .ds-uhrzeit'), titel: box('.ds-neu-titel'),
        uhr, kach, ende, mitte, karte, zahn, sync, nav, navR, navOhne, syncR, syncT, kodeBreit, kopf: document.querySelector('header').getBoundingClientRect().bottom };
    });
    await p.context().close(); return r;
  };
  for(const [w, h] of [[932, 430], [844, 390]]){
    const r = await messen(w, h);
    pr(w + '×' + h + ': drei Spalten – Uhr links, Dienst Mitte, Karte rechts', r.quer && r.spalten === 3 && r.uhr.r <= r.mitte.l && r.mitte.r <= r.karte.l, r);
    pr(w + '×' + h + ': unter der Uhr LS/PT/GKV, darunter „Dienst beenden“; Kacheltext passt', r.kach.t >= r.uhr.b - 2 && r.ende.t >= r.kach.b - 2 && r.kodeBreit, { uhr: r.uhr, kach: r.kach, ende: r.ende });
    pr(w + '×' + h + ': keine kleine Datum/Uhrzeit-Zeile und kein „Neuer Fall“', !r.uhrzeit.sichtbar && !r.titel.sichtbar, r);
    pr(w + '×' + h + ': OneDrive-Anzeige links unten unter der Leiste, zweizeilig', r.sync.l <= 20 && r.sync.b >= h - 16 && r.sync.b <= h && r.sync.t >= r.nav.b && r.sync.b - r.sync.t >= 24, { sync: r.sync, nav: r.nav, text: r.syncT });
    pr(w + '×' + h + ': Leiste rechts – OneDrive-Anzeige auch rechts unten', r.syncR.r >= w - 20 && r.syncR.b >= h - 16 && r.syncR.t >= r.navR.b, { sync: r.syncR, nav: r.navR });
    pr(w + '×' + h + ': Leiste wegen der OneDrive-Anzeige nicht verschoben', r.nav.t === r.navOhne.t && r.navR.t === r.nav.t, { nav: r.nav, ohne: r.navOhne });
    pr(w + '×' + h + ': Spalten direkt unter der Überschrift (höchstens 12 px Abstand)', r.mitte.t - r.kopf <= 12, { kopf: r.kopf, spalten: r.mitte.t });
  }
  const t = await messen(1180, 820);
  pr('Tablet quer (1180×820): bisherige Anordnung mit Datum/Uhrzeit und Kacheln oben', t.quer && t.uhrzeit.sichtbar && t.titel.sichtbar && t.kach.b <= t.uhr.t + 2, t);
};
