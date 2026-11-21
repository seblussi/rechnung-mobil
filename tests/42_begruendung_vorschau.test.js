// Begründung: Vorschau unter dem Feld zeigt die Zeilen genau so umbrochen wie in der Rechnung (Wunsch 21.11.2026).
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 900 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.waitForTimeout(800); await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=>{ ansichtPositionen('pt', new Set(['50']), 0, ()=>{}, 0); });
  await p.waitForSelector('.faktor-chip', { timeout: 15000 });
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=> document.querySelector('.faktor-chip').click());
  await p.waitForSelector('#fdBeg');
  const text = 'Mehraufwand aufgrund Einarbeitung in Patientengeschichte bei erstmaligem Patientenkontakt und erschwerten Bedingungen vor Ort';
  await p.fill('#fdBeg', text);
  const r = await p.evaluate((t)=>{ const v = document.getElementById('fdBegVorschau'); return { sicht: !v.hidden, zeilen: [...v.querySelectorAll('.begr-v-box > div')].map((d)=> d.textContent), soll: rdBegruendungZeilen(t, 'pt'), titel: v.textContent }; }, text);
  pr('Vorschau zeigt dieselben Zeilen wie die Rechnung (' + r.soll.length + ' Zeilen)', r.sicht && r.soll.length >= 2 && JSON.stringify(r.zeilen) === JSON.stringify(r.soll) && /So steht es in der Rechnung \(\d Zeilen\)/.test(r.titel), r);
  if(process.env.BILDER){ await p.evaluate(()=> document.getElementById('fdBegVorschau').scrollIntoView({ block: 'center' })); await p.screenshot({ path: process.env.BILDER + '/42_vorschau.png' }); }
  await p.fill('#fdBeg', '');
  pr('Leeres Feld: keine Vorschau', await p.evaluate(()=> document.getElementById('fdBegVorschau').hidden));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
