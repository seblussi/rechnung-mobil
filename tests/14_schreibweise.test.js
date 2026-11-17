// Groß-/Kleinschreibung beim Arztnamen (Wunsch 17.11.2026): Einrichtung und Einstellungen
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  await p.evaluate(()=>{ iniCacheSpeichern({ ARZTNAME: '', ARZTADRESSE1: '' }); LS.set('einr_aus_einst', true); ansichtEinrichtung('daten'); });
  const tippen = async (sel, text)=>{ await p.click(sel); await p.fill(sel, ''); await p.keyboard.type(text, { delay: 15 }); await p.evaluate(()=> document.activeElement.blur()); await p.waitForTimeout(200); return p.inputValue(sel); };
  const r = {
    klein: await tippen('[data-ini="ARZTNAME"]', 'max mustermann-meier'),
    gross: await tippen('[data-ini="ARZTNAME"]', 'MAX MUSTERMANN'),
    inhaber: await p.inputValue('[data-ini="ARZTKONTOINHABER"]')
  };
  pr('Einrichtung: Arztname wird beim Tippen richtig geschrieben (auch Doppelname, auch GROSS getippt)', r.klein === 'Max Mustermann-Meier' && r.gross === 'Max Mustermann' && r.inhaber === 'Max Mustermann', r);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
