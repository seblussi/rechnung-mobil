// Gross-/Kleinschreibung: zweiter Versuch gegen die Korrektur bleibt stehen (Wunsch 20.11.2026)
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); await p.waitForTimeout(800);
  await p.evaluate(()=>{ try{ betaOverlay.schliessen(); }catch(_){} LS.set('seitenhilfe', false); LS.set('gk_ausnahmen', []); ansichtGkv(); });
  await p.waitForSelector('#gkvName');
  await p.click('#gkvName'); await p.keyboard.type('MVZ Ortenau ');
  const erst = await p.inputValue('#gkvName');
  pr('erstes Mal: „MVZ“ wird wie bisher zu „Mvz“', erst.trim() === 'Mvz Ortenau', erst);
  // Wort markieren und in alter Schreibweise neu tippen
  await p.evaluate(()=>{ const e = document.getElementById('gkvName'); e.focus(); e.setSelectionRange(0, 3); });
  await p.keyboard.type('MVZ'); await p.keyboard.press('End'); await p.keyboard.type(' Süd');
  await p.click('body', { position: { x: 5, y: 5 } }); await p.waitForTimeout(200);
  const zweit = await p.inputValue('#gkvName');
  pr('zweites Mal: „MVZ“ bleibt stehen, der Rest wird weiter korrigiert', zweit.replace(/\s+/g, ' ') === 'MVZ Ortenau Süd', zweit);
  pr('als Ausnahme gemerkt', await p.evaluate(()=> (LS.get('gk_ausnahmen', []) || []).includes('MVZ')));
  const andere = await p.evaluate(()=> [grossKleinKorrigieren('MVZ Kehl'), grossKleinKorrigieren('MÜLLER, PETER'), grossKleinKorrigieren('peter mÜLler')]);
  pr('überall: „MVZ“ bleibt, andere Wörter werden weiter korrigiert', JSON.stringify(andere) === JSON.stringify(['MVZ Kehl', 'Müller, Peter', 'Peter Müller']), andere);
  // kleingeschriebene Ausnahme ("van") behaelt auch den ersten Buchstaben
  await p.evaluate(()=> LS.set('gk_ausnahmen', ['van']));
  pr('Ausnahme „van“ bleibt klein', await p.evaluate(()=> grossKleinKorrigieren('ludwig van beethoven')) === 'Ludwig van Beethoven');
};
