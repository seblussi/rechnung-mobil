// Fingerabdruck / Face ID startet auf der Sperrseite von selbst (Wunsch 21.11.2026): kein Klick nötig.
// Nach Abbruch kein zweiter automatischer Versuch (keine Schleife), keine Fehlermeldung, Passwort geht weiter.
const { geraet, tresorEinrichten, entsperren, PASSWORT, SEITE } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true, passkey: true });
  await p.addInitScript(()=>{ window.__pkAufrufe = 0; const c = navigator.credentials, g = c.get.bind(c); c.get = (o)=>{ if(o && o.publicKey) window.__pkAufrufe++; return g(o); }; });
  const laeuft = ()=> p.waitForFunction(()=> typeof Tresor !== 'undefined' && Tresor.offen() && typeof ansichtStart === 'function' && !document.getElementById('tsPw'), null, { timeout: 60000 });
  await p.goto(basis + SEITE); await tresorEinrichten(p); await laeuft();
  const ein = await p.evaluate(async (pw)=>{ const r = await Tresor.passkeyEinrichten(pw, 'Test'); return { r, n: (await Tresor.passkeys()).length }; }, PASSWORT);
  pr('Ausgangslage: Fingerabdruck eingerichtet', ein.n === 1, ein);

  await p.reload();
  let ok = await laeuft().then(()=> true, ()=> false);
  pr('Neu laden: Fingerabdruck startet von selbst, App entsperrt ohne Klick', ok && (await p.evaluate(()=> window.__pkAufrufe)) === 1);

  // Abbruch am Sensor
  await p.sensor.cdp.send('WebAuthn.setUserVerified', { authenticatorId: p.sensor.id, isUserVerified: false });
  await p.reload(); await p.waitForSelector('#tsPasskey', { timeout: 30000 }); await p.waitForTimeout(4000);
  const z = await p.evaluate(()=> ({ n: window.__pkAufrufe, offen: Tresor.offen(), fehler: document.getElementById('tsFehler').textContent, knopf: !document.getElementById('tsPasskey').disabled }));
  pr('Abbruch: genau ein automatischer Versuch, keine Fehlermeldung, Knopf bleibt bedienbar', z.n === 1 && !z.offen && !z.fehler && z.knopf, z);
  await entsperren(p); ok = await laeuft().then(()=> true, ()=> false);
  pr('Nach Abbruch: Passwort entsperrt wie gewohnt', ok);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
