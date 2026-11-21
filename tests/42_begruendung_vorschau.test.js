// Begründung: Vorschau unter dem Feld zeigt die Zeilen genau so umbrochen wie in der Rechnung (Wunsch 21.11.2026).
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{ for(const B of [412, 340]){
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: B, height: 900 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.waitForTimeout(800); await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=>{ ansichtPositionen('pt', new Set(['50']), 0, ()=>{}, 0); });
  await p.waitForSelector('.faktor-chip', { timeout: 15000 });
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  await p.evaluate(()=> document.querySelector('.faktor-chip').click());
  await p.waitForSelector('#fdBeg');
  const text = 'Mehraufwand aufgrund Einarbeitung in Patientengeschichte bei erstmaligem Patientenkontakt und erschwerten Bedingungen vor Ort';
  await p.fill('#fdBeg', text);
  await p.evaluate(()=> document.fonts.load("13.333px 'Arimo Rechnung'")); await p.waitForTimeout(300);
  // Zeilen, wie das Feld sie umbricht: Spiegel-Element mit denselben Massen, Woerter nach ihrer Zeile gruppiert
  const r = await p.evaluate((t)=>{ const ta = document.getElementById('fdBeg'), cs = getComputedStyle(ta);
    const m = document.createElement('div'); ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'boxSizing'].forEach((k)=> m.style[k] = cs[k]);
    m.style.width = ta.clientWidth + 'px'; m.style.boxSizing = 'border-box'; m.style.borderStyle = 'solid'; m.style.borderColor = 'transparent'; m.style.borderWidth = '0'; m.style.whiteSpace = 'pre-wrap'; m.style.position = 'absolute'; m.style.left = '-9999px';
    m.innerHTML = t.split(' ').map((w)=> '<span>' + w + '</span>').join(' '); document.body.appendChild(m);
    const zeilen = []; let y = null; m.querySelectorAll('span').forEach((s)=>{ const top = s.offsetTop; if(top !== y){ zeilen.push([]); y = top; } zeilen[zeilen.length - 1].push(s.textContent); }); m.remove();
    return { feld: zeilen.map((z)=> z.join(' ')), soll: rdBegruendungZeilen(t, 'pt'), schrift: cs.fontFamily, breite: ta.getBoundingClientRect().width, text: document.getElementById('fdBegVorschau').textContent, sicht: !document.getElementById('fdBegVorschau').hidden }; }, text);
  pr(B + ' px: Feld in Arimo, so breit wie die Spalte (' + Math.round(r.breite) + ' px' + (B < 400 ? ', maßstäblich verkleinert' : '') + ')', /Arimo Rechnung/.test(r.schrift) && (B < 400 ? r.breite < 330 : Math.abs(r.breite - (await p.evaluate(()=> rdBezBreite('pt') * 4 / 3 + 12))) < 1), r);
  pr(B + ' px: Feld bricht genau wie die Rechnung um (' + r.soll.length + ' Zeilen)', r.soll.length >= 2 && JSON.stringify(r.feld) === JSON.stringify(r.soll), { feld: r.feld, soll: r.soll });
  pr(B + ' px: darunter: „' + r.soll.length + ' Zeilen in der Rechnung“', r.sicht && r.text === r.soll.length + ' Zeilen in der Rechnung', r.text);
  if(process.env.BILDER && B === 412){ await p.evaluate(()=> document.getElementById('fdBeg').scrollIntoView({ block: 'center' })); await p.screenshot({ path: process.env.BILDER + '/42_feld.png' }); }
  await p.fill('#fdBeg', '');
  pr(B + ' px: Leeres Feld: keine Zeilenzahl', await p.evaluate(()=> document.getElementById('fdBegVorschau').hidden));
  pr(B + ' px: keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
} };
