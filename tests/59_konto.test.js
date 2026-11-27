// Wunsch 27.11.2026: Konto-Seite (Launch immer, Alpha ueber Einstellungen); GKV-Loeschen loescht auch die Dokumentation
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const B = process.env.BILDER;
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const n = [...document.querySelectorAll('button')].find(b=> /Nein, danke/.test(b.textContent)); if(n) n.click(); LS.set('seitenhilfe', false); });
  const navKonto = ()=> p.evaluate(()=>{ designGlobalNav(); return !!document.querySelector('#dsGlobalNav [data-nav="konto"]'); });
  const fest = await p.evaluate(()=> kontoFest());
  const vorher = await navKonto();
  pr(fest ? 'Launch: „Konto“ steht immer in der Leiste' : 'Alpha: „Konto“ erst nach dem Einschalten in den Einstellungen', fest ? vorher : !vorher, { fest, vorher });
  await p.evaluate(()=>{ ansichtEinstellungen(); const kv = document.getElementById('chkKontoVorschau'); if(kv){ kv.checked = true; kv.dispatchEvent(new Event('change')); } });
  pr('„Konto“ in der Leiste nach dem Einschalten', await navKonto());
  await p.evaluate(()=> designNavAktion('konto')); await p.waitForTimeout(400);
  const k = await p.evaluate(()=> ({ titel: document.getElementById('titel').textContent, gut: !!document.querySelector('.kt-gut'), hinweis: !!document.querySelector('.kt-vorschau'), an: !!document.querySelector('#dsGlobalNav [data-nav="konto"].an') }));
  pr('Konto-Seite mit Guthaben und Vorschau-Hinweis', k.titel === 'Konto' && k.gut && k.hinweis, k);
  if(B){ await p.screenshot({ path: B + '/konto_1.png' }); }
  await p.evaluate(()=> document.getElementById('ktAufladen').click()); await p.waitForTimeout(300);
  const a = await p.evaluate(()=>{ document.querySelector('[data-b="50"]').click(); return document.getElementById('ktZahlen').textContent; });
  pr('Aufladen: Betrag wählbar', /50,00/.test(a), a);
  if(B){ await p.screenshot({ path: B + '/konto_2.png' }); }
  await p.evaluate(()=> ansichtKontoPro()); await p.waitForTimeout(300);
  if(B){ await p.screenshot({ path: B + '/konto_3.png' }); }
  // Dokumentation wird beim Loeschen des GKV-Falls mitgeloescht
  const d = await p.evaluate(async ()=>{
    const arr = gkvFaelleLaden(); const id = 'gtest' + Date.now(), dokuId = 'Dtest-1';
    arr.push({ id, name: 'Dokumann, Doris', datum: '2026-11-27', zeit: '10:00', status: 'offen', auswahl: {}, positionen: [], dokuId });
    gkvFaelleSpeichern(arr); LS.set('doku_' + dokuId, { id: dokuId, name: 'Dokumann, Doris', fotos: [] });
    const lauf = gkvFallUeberallLoeschen(id); await new Promise(r=> setTimeout(r, 500));
    const ov = document.querySelector('.beta-overlay.aktiv'), frage = ov ? ov.textContent : '';
    const knopf = ov && [...ov.querySelectorAll('button')].find(b=> b.textContent.trim() === 'Löschen'); if(knopf) knopf.click();
    const ok = await lauf; await new Promise(r=> setTimeout(r, 300));
    return { ok, frage, dokuWeg: !LS.get('doku_' + dokuId, null), fallWeg: !gkvFaelleLaden().some(x=> x.id === id) };
  });
  pr('GKV löschen: unwiderruflich, mit Dokumentation', d.ok && /unwiderruflich/.test(d.frage) && /Dokumentation/.test(d.frage) && d.dokuWeg && d.fallWeg, d);
  await p.context().close();
};
