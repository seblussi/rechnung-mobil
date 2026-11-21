// Dokumentation, Wunsch 21.11.2026: Fotos in der Übersicht im eigenen Format (hochkant/breit, nicht abgeschnitten);
// groß ansehen mit Zoom, drehen, zuschneiden -- das geänderte Foto ersetzt das bisherige.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 860 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const bild = (w, h)=> p.evaluate(([w, h])=>{ const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#36c'; g.fillRect(w / 2, 0, w / 2, h); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('Notfallschein', 20, h / 2); return c.toDataURL('image/png').split(',')[1]; }, [w, h]).then((b)=> Buffer.from(b, 'base64'));
  await p.evaluate(()=>{ dokuOeffnen({ id: 'DB1', name: 'Test, Anna', datum: '2026-11-21', zeit: '10:00', artText: 'Test' }); });
  await p.waitForSelector('#dokuGalerie', { state: 'attached' });
  await p.setInputFiles('#dokuGalerie', [{ name: 'breit.png', mimeType: 'image/png', buffer: await bild(800, 400) }, { name: 'hoch.png', mimeType: 'image/png', buffer: await bild(300, 600) }]);
  await p.waitForFunction(()=> document.querySelectorAll('.doku-foto').length === 2 && [...document.querySelectorAll('.doku-foto')].every((e)=> e.dataset.url && e.style.aspectRatio), null, { timeout: 15000 });
  await p.waitForTimeout(300);
  const vor = await p.evaluate(()=> [...document.querySelectorAll('.doku-foto')].map((e)=>{ const r = e.getBoundingClientRect(); return Math.round(r.width / r.height * 100) / 100; }));
  pr('Übersicht: Fotos im eigenen Format (breit 2:1, hochkant 1:2), nicht abgeschnitten', Math.abs(vor[0] - 2) < 0.08 && Math.abs(vor[1] - 0.5) < 0.05, vor);
  if(process.env.BILDER){ await p.evaluate(()=> document.getElementById('dokuFotos').scrollIntoView()); await p.screenshot({ path: process.env.BILDER + '/39_uebersicht.png' }); }
  const masse = (i)=> p.evaluate(async (i)=>{ const d = LS.get('doku_DB1', null), f = d.fotos[i]; const b = await dokuDb.holen('DB1/' + f.name); const bm = await createImageBitmap(b); return { w: bm.width, h: bm.height, f }; }, i);
  const m0 = await masse(0);

  // groß öffnen, zoomen
  await p.click('.doku-foto[data-foto="0"]'); await p.waitForSelector('.doku-gross img');
  await p.waitForFunction(()=> document.querySelector('.doku-gross img').complete && document.querySelector('.doku-gross img').naturalWidth > 0);
  const b = await p.locator('.dg-buehne').boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.wheel(0, -300); await p.waitForTimeout(200);
  const zoom = await p.evaluate(()=> document.querySelector('.doku-gross img').style.transform);
  pr('Groß: Zoom mit Mausrad/Fingern', /scale\((?!1\))[\d.]+\)/.test(zoom) && parseFloat(/scale\(([\d.]+)/.exec(zoom)[1]) > 1.1, zoom);
  await p.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); await p.waitForTimeout(200);
  pr('Doppeltippen: zurück auf ganze Ansicht', /scale\(1\)/.test(await p.evaluate(()=> document.querySelector('.doku-gross img').style.transform)));
  // drehen
  await p.click('[data-dg="rechts"]'); await p.waitForTimeout(500);
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/39_gross.png' });
  await p.click('[data-dg="zu"]'); await p.waitForFunction(()=> !document.querySelector('.doku-gross'));
  await p.waitForTimeout(800);
  const m1 = await masse(0);
  pr('Drehen: Foto um 90° gedreht gespeichert (' + m0.w + '×' + m0.h + ' → ' + m1.w + '×' + m1.h + ')', m1.w === m0.h && m1.h === m0.w && !m1.f.oben && !!m1.f.bearbeitet, m1);
  const nach = await p.evaluate(()=>{ const r = document.querySelector('.doku-foto[data-foto="0"]').getBoundingClientRect(); return Math.round(r.width / r.height * 100) / 100; });
  pr('Übersicht zeigt das gedrehte Foto hochkant', Math.abs(nach - 0.5) < 0.05, nach);
  // Original gesichert, Knopf „Original“ setzt zurück
  const orig = await p.evaluate(async ()=>{ const f = LS.get('doku_DB1', null).fotos[0]; const b = f.original && await dokuDb.holen('DB1/' + f.original); const bm = b && await createImageBitmap(b); return { name: f.original, w: bm && bm.width, h: bm && bm.height }; });
  pr('Beim ersten Bearbeiten wird das Original gesichert (' + orig.name + ', ' + orig.w + '×' + orig.h + ')', /_original\.jpg$/.test(orig.name || '') && orig.w === m0.w && orig.h === m0.h, orig);
  const hoch = await p.evaluate(async ()=>{ await dokuHochladen(LS.get('doku_DB1', null)); const f = LS.get('doku_DB1', null).fotos[0]; return { oben: f.oben, originalOben: f.originalOben }; });
  pr('Hochladen: bearbeitetes Foto und Original in OneDrive', hoch.oben === true && hoch.originalOben === true, hoch);
  await p.click('.doku-foto[data-foto="0"]'); await p.waitForSelector('[data-dg="original"]');
  await p.click('[data-dg="original"]');
  await p.waitForFunction(()=> [...document.querySelectorAll('.beta-overlay.aktiv button')].some((b)=> /Zurücksetzen/.test(b.textContent)));
  await p.evaluate(()=> [...document.querySelectorAll('.beta-overlay.aktiv button')].find((b)=> /Zurücksetzen/.test(b.textContent)).click());
  await p.waitForFunction(()=> !document.querySelector('.doku-gross')); await p.waitForTimeout(800);
  const mz = await masse(0);
  const origWeg = await p.evaluate(async (n)=> !(await dokuDb.holen('DB1/' + n)), orig.name);
  pr('„Original“: Foto wieder wie aufgenommen (' + mz.w + '×' + mz.h + '), Sicherung entfernt, Knopf weg', mz.w === m0.w && mz.h === m0.h && !mz.f.original && origWeg && !mz.f.oben, mz.f);
  await p.click('.doku-foto[data-foto="0"]'); await p.waitForSelector('.doku-gross');
  pr('Ohne Bearbeitung kein Knopf „Original“', await p.evaluate(()=> !document.querySelector('[data-dg="original"]')));
  await p.click('[data-dg="zu"]'); await p.waitForTimeout(300);

  // zuschneiden: linke obere Ecke nach innen ziehen
  await p.click('.doku-foto[data-foto="1"]'); await p.waitForSelector('.doku-gross img'); await p.waitForTimeout(300);
  await p.click('[data-dg="schnitt"]'); await p.waitForSelector('.dg-schnitt');
  const e = await p.locator('.dg-schnitt i[data-e="nw"]').boundingBox();
  await p.mouse.move(e.x + 8, e.y + 8); await p.mouse.down(); await p.mouse.move(e.x + 80, e.y + 150, { steps: 6 }); await p.mouse.up();
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/39_zuschneiden.png' });
  const knoepfe = await p.evaluate(()=> ({ ok: !document.querySelector('[data-dg="ok"]').hidden, drehen: document.querySelector('[data-dg="rechts"]').hidden }));
  await p.click('[data-dg="ok"]'); await p.waitForTimeout(400);
  pr('Zuschneiden: Rahmen, „Übernehmen“ statt der übrigen Knöpfe', knoepfe.ok && knoepfe.drehen, knoepfe);
  await p.click('[data-dg="zu"]'); await p.waitForTimeout(800);
  const m2 = await masse(1);
  pr('Zugeschnitten gespeichert (300×600 → ' + m2.w + '×' + m2.h + ')', m2.w < 300 * 0.8 && m2.h < 600 * 0.8 && m2.w > 60 && m2.h > 60, m2);
  // ohne Änderung schließen: nichts neu
  const vorher = (await masse(1)).f.bearbeitet;
  await p.click('.doku-foto[data-foto="1"]'); await p.waitForSelector('.doku-gross'); await p.click('[data-dg="zu"]'); await p.waitForTimeout(300);
  pr('Nur angesehen: Foto unverändert', (await masse(1)).f.bearbeitet === vorher);
  await p.click('#dokuFertig'); await p.waitForTimeout(300);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
