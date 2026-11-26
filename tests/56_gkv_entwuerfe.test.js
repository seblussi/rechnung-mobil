// Wunsch 26.11.2026: mehrere angefangene GKV-Patienten gleichzeitig; GKV-Liste ohne „✓ Fahrtenbuch“, Loeschen auch im Fahrtenbuch
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const r = await p.evaluate(async ()=>{
    const w = (ms)=> new Promise(r=> setTimeout(r, ms));
    LS.set('seitenhilfe', false); LS.set('gkv_entwuerfe', []);
    const tippen = async (name)=>{ ansichtGkv(); await w(600); const n = document.getElementById('gkvName'); n.value = name; n.dispatchEvent(new Event('input', { bubbles: true })); await w(600); };
    await tippen('Erstmann, Anna'); await tippen('Zweitmann, Bert');
    ansichtStart(); await w(300);
    const liste = gkvEntwuerfe().map(e=> e.name).sort();
    const a = gkvEntwuerfe().find(e=> e.name === 'Erstmann, Anna');
    ansichtGkv(null, { entwurf: a.eid }); await w(600);
    const offen = document.getElementById('gkvName').value;
    // frueherer Einzel-Entwurf wird uebernommen
    LS.set('gkv_entwurf', { name: 'Altmann, Carl', datum: '2026-11-26', zeit: '10:00', auswahl: {} });
    const nachAlt = gkvEntwuerfe().length, altWeg = !LS.get('gkv_entwurf', null);
    ansichtGkvVerwaltung(); await w(800);
    const unfertig = document.querySelectorAll('.wisch-huelle[data-gkventwurf]').length;
    const html = document.getElementById('gvListe').innerHTML;
    gkvEntwurfVerwerfen(a.eid);
    return { liste, offen, nachAlt, altWeg, unfertig, rest: gkvEntwuerfe().length, ohneHaken: !/✓ Fahrtenbuch/.test(html), gBadge: /badge-neu gkv">G</.test(html), hinweis: /löschen \(auch im Fahrtenbuch\)/.test(html) };
  });
  pr('Zwei angefangene GKV-Patienten bleiben nebeneinander erhalten', JSON.stringify(r.liste) === JSON.stringify(['Erstmann, Anna', 'Zweitmann, Bert']), r);
  pr('Angefangenen Patienten gezielt weiterbearbeiten', r.offen === 'Erstmann, Anna', r);
  pr('Früherer Einzel-Entwurf wird in die Liste übernommen', r.nachAlt === 3 && r.altWeg, r);
  pr('Rechnungsverwaltung GKV: alle Unfertigen, kleines G, kein „✓ Fahrtenbuch“, Löschen auch im Fahrtenbuch', r.unfertig === 3 && r.gBadge && r.ohneHaken && r.hinweis, r);
  pr('Verwerfen entfernt nur diesen Entwurf', r.rest === 2, r);
  await p.context().close();
};
