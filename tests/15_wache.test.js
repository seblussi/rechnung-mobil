// Wachen/Praxen (gemeldet 17.11.2026): neu eingetragene Adressen wurden nicht gespeichert; der Einrichtungsassistent
// setzte die Arztanschrift statt der Wache als Ausgangspunkt.
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  await p.evaluate(async ()=>{ await ansichtEinstellungen(); });
  const aufklappen = ()=> p.evaluate(()=>{ const ab = document.getElementById('praxisNeu').closest('.abschnitt'); if(ab.classList.contains('zu')) ab.querySelector('.trennlinie').click(); document.getElementById('praxisNeu').scrollIntoView({ block: 'center' }); });
  await p.waitForSelector('#praxisNeu', { state: 'attached' }); await aufklappen(); await p.waitForTimeout(300);
  // erste Wache: Adresse in die beiden Felder
  const zeilen = ()=> p.$$('.praxis-zeile');
  let z = (await zeilen())[0];
  const fuellen = async (zeile, name, str, ort)=>{
    const n = await zeile.$('.praxis-name'); await n.fill(name); await n.dispatchEvent('change');
    const s = await zeile.$('.adr-zwei input[id$="_str"]'), o = await zeile.$('.adr-zwei input[id$="_ort"]');
    await s.click(); await p.keyboard.type(str, { delay: 5 }); await o.click(); await p.keyboard.type(ort, { delay: 5 });
    await p.evaluate(()=> document.activeElement.blur()); await p.waitForTimeout(600);
  };
  await fuellen(z, 'Wache Offenburg', 'Weingartenstraße 10', '77654 Offenburg');
  await p.click('#praxisNeu'); await p.waitForTimeout(300);
  z = (await zeilen())[1];
  await fuellen(z, 'Praxis Lahr', 'Marktplatz 3', '77933 Lahr');
  const gespeichert = await p.evaluate(()=> (ladeEinstellungen().praxen || []).map((x)=> x.name + ' | ' + x.adresse));
  pr('neu eingetragene Wachen/Praxen werden gespeichert (Straße und PLZ/Ort)', gespeichert.length === 2 && /Weingartenstraße 10, 77654 Offenburg/.test(gespeichert[0]) && /Marktplatz 3, 77933 Lahr/.test(gespeichert[1]), gespeichert);
  await p.evaluate(async ()=>{ await ansichtStart(); await ansichtEinstellungen(); }); await p.waitForTimeout(500); await aufklappen();
  const nachNeu = await p.evaluate(()=> [...document.querySelectorAll('.praxis-adr')].map((x)=> x.value));
  pr('nach erneutem Öffnen der Einstellungen noch da', nachNeu.length === 2 && /Lahr/.test(nachNeu[1]), nachNeu);
  if(process.env.BILDER){ await p.evaluate(()=> document.querySelector('#wfEinst').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); await p.screenshot({ path: process.env.BILDER + '/15_wachen_zonen.png' }); }
  // Einrichtung: Wache statt Arztanschrift
  const r = await p.evaluate(()=>{
    const e = ladeEinstellungen(); e.praxen = [{ name: 'Wache/Praxis', adresse: 'Hauptstraße 1, 77652 Offenburg' }]; e.praxisAktiv = 0; e.praxisadresse = 'Hauptstraße 1, 77652 Offenburg'; speichereEinstellungen(e);
    einrWacheUebernehmen('Wachweg 2, 77652 Offenburg', 'Hauptstraße 1, 77652 Offenburg');
    return { aktiv: gkvStartAdresse(), liste: praxenLaden().liste.length };
  });
  pr('Einrichtung: eingetragene Wache wird Ausgangspunkt (ersetzt die fälschlich gesetzte Arztanschrift)', r.aktiv === 'Wachweg 2, 77652 Offenburg' && r.liste === 1, r);
  const k = await p.evaluate(()=>{
    const e = ladeEinstellungen(); e.praxen = [{ name: 'Wache/Praxis', adresse: 'Hauptstraße 1, 77652 Offenburg' }]; e.praxisAktiv = 0; e.praxisadresse = 'Hauptstraße 1, 77652 Offenburg'; speichereEinstellungen(e);
    iniCacheSpeichern({ ARZTADRESSE1: 'Hauptstraße 1', ARZTADRESSE2: '77652 Offenburg', GKV_STARTADRESSE: 'Wachweg 2, 77652 Offenburg' }); LS.set('wache_korr_v1', false);
    wacheAusArztanschriftKorrigieren(); return gkvStartAdresse();
  });
  pr('bestehende Geräte: Arztanschrift als Wache wird einmalig auf die Wache aus der ini korrigiert', k === 'Wachweg 2, 77652 Offenburg', k);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
