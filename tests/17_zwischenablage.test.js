// Sicherheitsbericht (weitere Ebenen): Nach dem Einlesen einer Einsatzmeldung wird die Zwischenablage geleert
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: basis });
  await oeffnen(p, basis);
  const meldung = 'Einsatz 123\nPatient: Mustermann, Erika\nGeb: 01.02.1950\nStrasse: Hauptstr. 5\nOrt: 77652 Offenburg';
  // GKV
  await p.evaluate(async (t)=>{ await navigator.clipboard.writeText(t); ansichtGkv(); }, meldung);
  await p.waitForSelector('#gkvZwischenablage'); await p.click('#gkvZwischenablage'); await p.waitForTimeout(1200);
  const g = await p.evaluate(async ()=> ({ name: document.getElementById('gkvName').value, hinweis: document.getElementById('gkvZwHinweis').textContent, ablage: await navigator.clipboard.readText() }));
  pr('GKV: Patient eingelesen, danach Zwischenablage leer und Hinweis „geleert“', /Mustermann/.test(g.name) && g.ablage === '' && /geleert/.test(g.hinweis), g);
  // LS
  await p.evaluate(async (t)=>{ await navigator.clipboard.writeText(t); ansichtMaske('ls'); }, meldung);
  await p.waitForTimeout(800);
  const knopf = await p.evaluate(()=>{ const b = [...document.querySelectorAll('button')].find((x)=> /Zwischenablage/i.test(x.textContent) && x.offsetParent); if(b){ b.click(); return b.id || b.textContent; } return null; });
  await p.waitForTimeout(1200);
  const l = await p.evaluate(async ()=> ({ name: (document.getElementById('txtName') || {}).value, hinweis: (document.getElementById('zwischenablageHinweis') || {}).textContent, ablage: await navigator.clipboard.readText() }));
  pr('Leichenschau: eingelesen, Zwischenablage geleert', !!knopf && /Mustermann/.test(l.name || '') && l.ablage === '' && /geleert/.test(l.hinweis || ''), { knopf, l });
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
