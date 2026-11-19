// Gefuehrte Einfuehrung (Wunsch 19.11.2026): Schritt fuer Schritt, das Beschriebene wird hervorgehoben
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  const fehler = []; p.on('pageerror', e=> fehler.push(String(e)));
  await oeffnen(p, basis);
  await p.waitForTimeout(800);
  await p.evaluate(()=>{ try{ betaOverlay.schliessen(); }catch(_){} LS.set('seitenhilfe', true); LS.set('seitenhilfe_gesehen', []); ansichtStart(); });
  const da = await p.waitForSelector('#tourBlase', { timeout: 8000 }).then(()=> true).catch(()=> false);
  const s1 = await p.evaluate(()=> ({ titel: (document.querySelector('#tourBlase .tour-titel') || {}).textContent, mittig: document.getElementById('tourLicht').style.display === 'none' }));
  pr('Startseite: Einführung beginnt von selbst mit „Willkommen!“ in der Mitte', da && s1.titel === 'Willkommen!' && s1.mittig, s1);
  await p.click('#tourBlase .tour-weiter'); await p.waitForTimeout(700);
  const s2 = await p.evaluate(()=>{
    const l = document.getElementById('tourLicht').getBoundingClientRect(), a = document.getElementById('kLS').getBoundingClientRect(), c = document.getElementById('kGKV').getBoundingClientRect();
    return { titel: document.querySelector('#tourBlase .tour-titel').textContent, umfasst: l.left <= a.left && l.top <= a.top && l.right >= c.right && l.bottom >= c.bottom, zahl: document.querySelector('#tourBlase .tour-zahl').textContent };
  });
  pr('Schritt „Neuer Fall“ hebt LS, PT und GKV gemeinsam hervor', s2.titel === 'Neuer Fall' && s2.umfasst, s2);
  // Klicks auf die Seite gehen waehrend der Einfuehrung nicht durch
  await p.mouse.click(30, 300); await p.waitForTimeout(300);
  pr('Klick neben die Sprechblase bewirkt nichts (Seite bleibt, Einführung bleibt)', await p.evaluate(()=> !!tourAktiv && aktuelleAnsichtIstHauptbildschirm));
  await p.click('#tourBlase .tour-zurueck'); await p.waitForTimeout(300);
  pr('Zurück führt zum vorigen Schritt', await p.evaluate(()=> document.querySelector('#tourBlase .tour-titel').textContent) === 'Willkommen!');
  for(let i = 0; i < 30 && await p.$('#tourBlase'); i++){ await p.click('#tourBlase .tour-weiter'); await p.waitForTimeout(120); }
  pr('nach dem letzten Schritt („Fertig“) ist alles weg und die Seite als gesehen vermerkt',
    await p.evaluate(()=> !document.getElementById('tourBlase') && !document.getElementById('tourDecke') && !document.getElementById('tourLicht') && (LS.get('seitenhilfe_gesehen', []) || []).includes('start')));
  await p.evaluate(()=> ansichtMaske('ls'));
  const ls = await p.waitForSelector('#tourBlase', { timeout: 8000 }).then(()=> true).catch(()=> false);
  pr('Leichenschau: eigene Einführung beim ersten Öffnen', ls && await p.evaluate(()=> document.querySelector('#tourBlase .tour-titel').textContent) === 'Wann?');
  await p.click('#tourBlase .tour-aus'); await p.waitForTimeout(200);
  pr('„Keine Hilfen mehr“ schließt und schaltet ab', await p.evaluate(()=> !document.getElementById('tourBlase') && LS.get('seitenhilfe', null) === false));
  await p.evaluate(()=> ansichtGkv()); await p.waitForTimeout(2500);
  pr('danach keine Einführung mehr (GKV)', !(await p.$('#tourBlase')));
  pr('keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3));
};
