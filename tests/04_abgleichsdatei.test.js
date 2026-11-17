// Angriff über das OneDrive: Eine präparierte Abgleichsdatei (HTML/Skript in allen Textfeldern, falsche Datentypen,
// "__proto__", 5000 Einträge) darf weder Skripte ausführen noch die App stören. Läuft im Demo-Modus gegen das
// nachgebildete OneDrive der App -- über denselben Abgleich wie im echten Betrieb.
const { geraet, oeffnen } = require('./hilfe');
const N = require('./nutzlast');
const ZIEL = 'KVBW Onedrive/rechnungserfassung_app_sicherung.json';
async function einspielen(p, text){
  return p.evaluate(async ([text, ziel])=>{
    await Tresor.dateiSchreiben(ziel, new TextEncoder().encode(text).buffer, 'application/json', null, 'demo');
    const t0 = performance.now(); let fehler = null;
    try{ await faelleAbgleichen(false); }catch(e){ fehler = String((e && e.message) || e); }
    return { fehler, ms: Math.round(performance.now() - t0), ls: ladeFaelle('ls').length, pt: ladeFaelle('pt').length, gkv: gkvFaelleLaden().length };
  }, [text, ZIEL]);
}
module.exports = async ({ browser, basis, pr })=>{
  // ---- 1. HTML/Skript in allen Textfeldern ----
  let p = await geraet(browser, basis, { demo: true }); await p.addInitScript(N.waechter); await oeffnen(p, basis);
  const vorher = await p.evaluate(()=> ({ ls: ladeFaelle('ls').length, pt: ladeFaelle('pt').length }));
  let e = await einspielen(p, N.abgleichsdatei());
  let r = await N.ansichtenPruefen(p);
  pr('präparierte Datei wird übernommen und angezeigt (als Text)', !e.fehler && e.ls > vorher.ls && e.pt > vorher.pt && r.sichtbar, e);
  pr('kein eingeschleustes HTML im Dokument', r.funde.length === 0, r.funde.slice(0, 6));
  pr('kein eingeschleustes Skript ausgeführt', r.xss === null, r.xss);
  pr('Sicherheitsrichtlinie musste nichts abfangen', r.csp.length === 0, r.csp.slice(0, 4));
  pr('keine Ansicht stürzt ab, keine Skriptfehler', r.absturz.length === 0 && p.fehler.length === 0, r.absturz.concat(p.fehler).slice(0, 4));
  pr('Excel: Formeln aus der Datei würden als Text geschrieben', await p.evaluate(()=> ladeFaelle('ls').filter((f)=> /^[=+@-]/.test((f.werte || {}).txtName || '')).every((f)=> xlText(f.werte.txtName).startsWith("'"))));
  // Gegenprobe: ohne Maskierung MUSS der Test anschlagen; die Sicherheitsrichtlinie hält die Skripte trotzdem auf
  await p.evaluate(()=>{ window.__pwn = []; window.__csp = []; htmlEsc = (s)=> String(s); });
  const g = await N.ansichtenPruefen(p);
  pr('Gegenprobe: ohne Maskierung findet der Test eingeschleustes HTML', g.funde.length > 0, g.funde.length);
  pr('Gegenprobe: Skripte werden selbst dann von der Sicherheitsrichtlinie blockiert', g.xss === null && g.csp.length > 0, { xss: g.xss, csp: g.csp.slice(0, 2) });
  await p.context().close();
  // ---- 2. falsche Datentypen und "__proto__" ----
  p = await geraet(browser, basis, { demo: true }); await p.addInitScript(N.waechter); await oeffnen(p, basis);
  const v2 = await p.evaluate(()=> ({ ls: ladeFaelle('ls').length, pt: ladeFaelle('pt').length, gkv: gkvFaelleLaden().length }));
  e = await einspielen(p, N.KAPUTT); r = await N.ansichtenPruefen(p);
  pr('kaputte Datei: Bestand unverändert', e.ls === v2.ls && e.pt === v2.pt && e.gkv === v2.gkv, { vorher: v2, nachher: e });
  pr('kaputte Datei: kein „__proto__“-Eingriff', r.proto.length === 0, r.proto);
  pr('kaputte Datei: keine Ansicht stürzt ab, keine Skriptfehler', r.absturz.length === 0 && p.fehler.length === 0, r.absturz.concat(p.fehler).slice(0, 4));
  await p.context().close();
  // ---- 3. sehr große Datei ----
  p = await geraet(browser, basis, { demo: true }); await oeffnen(p, basis);
  e = await einspielen(p, N.riesig()); r = await N.ansichtenPruefen(p);
  const laengste = await p.evaluate(()=> Math.max(0, ...ladeFaelle('pt').map((f)=> String((f.werte || {}).txtName || '').length)));
  pr('riesige Datei: Abgleich unter 10 s', !e.fehler && e.ms < 10000, e);
  pr('riesige Datei: überlange Texte werden gekürzt', laengste <= 4000, laengste);
  pr('riesige Datei: Ansichten bleiben bedienbar (je unter 5 s)', r.absturz.length === 0 && Object.values(r.dauer).every((x)=> x < 5000), r.dauer);
  pr('riesige Datei: keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
