// Sicherungen probeweise oeffnen (Sicherheitsbericht, weitere Ebenen): juengste Sicherung herunterladen und jede Datei oeffnen
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); await p.waitForTimeout(800);
  const leer = await p.evaluate(async ()=>{ const t = await msGraphTokenHolen(); const l = await odsListe(t); for(const x of l) await odsAbruf(t, 'https://graph.microsoft.com/v1.0/me/drive/items/' + x.id, { method: 'DELETE' }); return await odsProbe(); });
  pr('ohne Sicherung: Probe meldet „Noch keine Sicherung vorhanden.“', !leer.ok && /Noch keine Sicherung/.test(leer.fehler.join('')), leer);
  const gut = await p.evaluate(async ()=>{ await odsAnlegen('test'); return await odsProbe(); });
  pr('jüngste Sicherung lässt sich öffnen (Excel, ini, Abgleich)', gut.ok && gut.dateien >= 3 && /test/.test(gut.sicherung), gut);
  const kaputt = await p.evaluate(async ()=>{
    const t = await msGraphTokenHolen(), l = await odsListe(t), d = await odsInhalt(t, l[0].id), x = d.find(f=> /\.xlsx$/i.test(f.name));
    const r = await fetch('https://graph.microsoft.com/v1.0/me/drive/items/' + x.id + '/content', { method: 'PUT', headers: { Authorization: 'Bearer ' + t }, body: new Uint8Array([1, 2, 3, 4, 5]) });
    return { put: r.status, probe: await odsProbe() };
  });
  pr('beschädigte Datei in der Sicherung wird erkannt und benannt', kaputt.put < 300 && !kaputt.probe.ok && /\.xlsx: keine Excel/.test(kaputt.probe.fehler.join('')), kaputt);
  await p.evaluate(()=> ansichtEinstellungen()); await p.waitForTimeout(600);
  const ui = await p.evaluate(()=> ({ knopf: !!document.getElementById('odsProbe'), info: (document.getElementById('odsProbeInfo') || {}).textContent || '' }));
  pr('Einstellungen › Datensicherung: Knopf und letzter Stand', ui.knopf && /Probe|probeweise/.test(ui.info), ui);
};
