// Wünsche 25.11.2026: Scrollen unter die Kopfzeile, Übersicht-Knopf beschriftet, Karten-Zwischenspeicher, Offline-Karte im
// Hintergrund, PDF-Knopf „Erneut senden“, Versand sofort in der Liste, offene Rechnungen mit Erinnerungen
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 800 });
  await p.exposeFunction('__bild', async (n)=>{ if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/' + n + '.png' }); });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });

  // 1. Scrollen: Element unter der klebenden Kopfzeile
  const sc = await p.evaluate(async ()=>{
    const app = document.getElementById('app'); const d = document.createElement('div'); d.style.height = '3000px'; app.appendChild(d);
    const z = document.createElement('div'); z.textContent = 'Ziel'; z.style.height = '40px'; d.appendChild(z); z.style.marginTop = '1200px';
    window.scrollTo(0, 1500); await new Promise(r=> setTimeout(r, 100));
    kopfFreiScrollen(z); await new Promise(r=> setTimeout(r, 900));
    const h = document.querySelector('header'), k = h ? h.getBoundingClientRect().bottom : 0, t = z.getBoundingClientRect().top; d.remove();
    return { k, t };
  });
  pr('Klick auf Zahl: Fall wird unter die Kopfzeile gescrollt, nicht dahinter', sc.t >= sc.k - 1, sc);

  // 2. Übersicht-Knopf: Beschriftung, wohin er wechselt
  const ue = await p.evaluate(()=>{
    let modus = 'bezirk'; const opt = { bezirk: { lat: 48, lon: 9, z: 11 }, faelleN: 2, modus: ()=> modus, modusSetzen: (x)=>{ modus = x; } };
    const w = document.createElement('div'); w.innerHTML = '<button class="mini-ueber mit-was"><span class="mini-ueber-was">' + miniUeberNaechst(opt) + '</span></button>'; document.body.appendChild(w);
    const a = w.textContent; miniUebersichtWechseln(opt); const b = w.textContent, m1 = modus; miniUebersichtWechseln(opt); const c = w.textContent, m2 = modus; w.remove();
    return { a, b, c, m1, m2 };
  });
  pr('Übersicht-Knopf wechselt Bezirk ↔ Fälle und zeigt das nächste Ziel an', ue.a === 'Fälle' && ue.m1 === 'faelle' && ue.b === 'Bezirk' && ue.m2 === 'bezirk' && ue.c === 'Fälle', ue);

  // 3. Karten-Zwischenspeicher: zweiter Abruf ohne Netz
  const mem = await p.evaluate(async ()=>{
    const f0 = window.fetch; let n = 0;
    window.fetch = async function(u){ if(String(u).includes('/fonts/x/0-255.pbf')) n++; else return f0.apply(window, arguments); return new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 }); };
    try{
      const url = 'vkofm://tiles.openfreemap.org/fonts/x/0-255.pbf';
      const a = await vkProtokoll({ url, type: 'arrayBuffer' }); const b = await vkProtokoll({ url, type: 'arrayBuffer' });
      return { n, a: a.data.byteLength, b: b.data.byteLength };
    } finally { window.fetch = f0; }
  });
  pr('Karte: Schriften/Kacheln beim nächsten Bildschirm aus dem Arbeitsspeicher (kein zweiter Abruf)', mem.n === 1 && mem.a === 4 && mem.b === 4, mem);

  // 4. Offline-Karte im Hintergrund mit Anzeige oben
  const off = await p.evaluate(async ()=>{
    const alt = vkOfflineLaden; let weiter;
    vkOfflineLaden = (m, r, melde)=> new Promise(res=>{ melde('Kacheln 10 / 100 · 0.3 MB', 0.1); weiter = ()=> res({ kacheln: 100, mb: 3.2, fehler: 0 }); });
    try{
      vkOffHintergrund({ lat: 48, lon: 9 }, 10, 14, null); await new Promise(r=> setTimeout(r, 50));
      if(window.__bild) await window.__bild('48_offline');
      const el = document.getElementById('vkOffAnzeige'); const t1 = el.textContent, balken = !!el.querySelector('.doku-up-balken'), app = !document.querySelector('.beta-overlay.aktiv');
      weiter(); await new Promise(r=> setTimeout(r, 50));
      return { t1, balken, app, t2: el.textContent, ok: el.classList.contains('ok') };
    } finally { vkOfflineLaden = alt; }
  });
  pr('Offline-Karte lädt im Hintergrund: kleine Anzeige mit Fortschritt, kein Dialog', /Kacheln 10 \/ 100/.test(off.t1) && off.balken && off.app && /fertig/.test(off.t2) && off.ok, off);

  // 5. PDF-Ansicht: Senden-Knopf wird beim nächsten Öffnen zurückgesetzt, nach dem Senden „Erneut senden“
  const pdf = await p.evaluate(async ()=>{
    const altD = briefSendenDialog; briefSendenDialog = async ()=> ({ gesendet: [1], test: false });
    try{
      betaPdfAnzeigen({ titel: 'R1', blob: new Blob(['x']), senden: { renu: 'X' } }); await new Promise(r=> setTimeout(r, 50));
      const sk = document.querySelector('#betaPdfAnsicht [data-a="senden"]'); sk.click(); await new Promise(r=> setTimeout(r, 50));
      const nach = sk.textContent, aus = sk.disabled; document.querySelector('#betaPdfAnsicht [data-a="zu"]').click();
      betaPdfAnzeigen({ titel: 'Erinnerung', blob: new Blob(['x']), senden: { renu: 'X', typ: 'M1' } }); await new Promise(r=> setTimeout(r, 50));
      const neu = sk.textContent; document.querySelector('#betaPdfAnsicht [data-a="zu"]').click();
      return { nach, aus, neu };
    } finally { briefSendenDialog = altD; }
  });
  pr('PDF: nach dem Senden „Erneut senden“ (nicht gesperrt), Erinnerung danach wieder „Senden“', /Erneut senden/.test(pdf.nach) && !pdf.aus && /^✉ Senden$/.test(pdf.neu), pdf);

  // 6. Versand sofort in der geladenen Übersicht + offene Rechnung mit Erinnerungen
  const li = await p.evaluate(async ()=>{
    const ziel = betaZiel(), zk = betaZielKey(ziel);
    const heute = new Date(), vor = new Date(heute.getTime() - 40 * 86400000), dt = (d)=> zz2(d.getDate()) + '.' + zz2(d.getMonth() + 1) + '.' + d.getFullYear();
    const v = new Array(30).fill(''); v[0] = 'P'; v[1] = dt(vor); v[5] = 'Muster'; v[6] = 'Erika'; v[15] = 120; v[16] = 'PT-1'; v[17] = xlDatumSerial(dt(vor)); v[20] = 'LXP:1';
    const ue = { pfad: 'x', zeilen: [{ nr: 1, v: new Array(30).fill('Kopf') }, { nr: 5, v }] };
    const basis = renuDateiname('PT-1');
    const dateien = new Map([[(basis + '.pdf').toLowerCase(), { id: 'a', name: basis + '.pdf' }], [(basis + '_Erinnerung 1.pdf').toLowerCase(), { id: 'b', name: basis + '_Erinnerung 1.pdf', createdDateTime: '2026-11-20T10:00:00Z' }]]);
    betaGesamtCache = { zielKey: zk, ue, ana: uebersichtAuswerten(ue), dateien };
    await ansichtRechnungenGesamt(false); await new Promise(r=> setTimeout(r, 400));
    if(window.__bild) await window.__bild('48_offen');
    const zeile = document.querySelector('.offen-zeile small'); const seit = zeile && zeile.querySelector('.offen-seit'), erin = zeile && zeile.querySelector('.offen-erin');
    const vorher = !!document.querySelector('.gesamt-eintrag .badge-brief, [data-key="5|M1"] .badge-brief');
    const frisch = JSON.parse(JSON.stringify(ue));
    betaCacheVersandUebernehmen(frisch, new Map([[5, 'LXP:1 | LXP:M1']]), null); await new Promise(r=> setTimeout(r, 100));
    const erin2 = (document.querySelector('.offen-zeile .offen-erin') || {}).textContent || '';
    return { seit: seit && seit.textContent, erin: erin && erin.textContent, block: getComputedStyle(document.querySelector('.offen-seit')).display, erin2 };
  });
  pr('Offene Rechnung: „seit … Tagen“ in eigener Zeile, darunter die Erinnerung mit Datum', /seit 40 Tagen/.test(li.seit || '') && li.block === 'block' && /1\. Erinnerung 20\.11\.2026/.test(li.erin || ''), li);
  pr('Brief gesendet: Liste zeigt es sofort (ohne Neu laden)', /✉/.test(li.erin2), li);
  await p.context().close();
};
