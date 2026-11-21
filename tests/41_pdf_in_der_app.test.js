// PDF der Rechnung in der App erzeugen (Wunsch 21.11.2026, wie in der Launch); Microsoft nur noch als Ersatz.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  const r = await p.evaluate(async ()=>{
    let msPdf = 0; const f0 = window.fetch; window.fetch = (u, o)=>{ if(/format=pdf/.test(String(u && u.url || u))) msPdf++; return f0(u, o); };
    const token = await msGraphTokenHolen();
    const docm = await graphDateiLaden(token, MSGRAPH_PFAD_WORDVORLAGE.pt);
    const excel = await excelVorlageZeilenLaden(token, 'pt');
    const f = JSON.parse(JSON.stringify(ladeFaelle('pt')[0])); f.art = 'pt';
    const erg = await rechnungDocxErzeugen(docm, excel.zeilen, fallRechnungsdaten(f, ladeEinstellungen()), 'blob');
    await msGraphOrdnerSicherstellen(token, 'KVBW Onedrive/Beta-Test');
    const a = await docxHochladenMitPdf(token, 'KVBW Onedrive/Beta-Test', 'PdfTest', erg.inhalt, ()=>{});
    const msErst = msPdf;
    const kopf = String.fromCharCode(...new Uint8Array(await a.pdfBlob.slice(0, 5).arrayBuffer()));
    // Ersatz: App-Umwandlung scheitert -> Microsoft (in der Demo wandelt der nachgebildete OneDrive ebenfalls mit DocxPdf um, daher hier nur: Microsoft wird gefragt)
    const u0 = DocxPdf.umwandeln; DocxPdf.umwandeln = async ()=>{ throw new Error('Test'); };
    let ersatz = null; try{ const b = await docxHochladenMitPdf(token, 'KVBW Onedrive/Beta-Test', 'PdfTest2', erg.inhalt, ()=>{}); ersatz = !!b.pdfBlob; }catch(e){ ersatz = 'Fehler: ' + e.message; }
    DocxPdf.umwandeln = u0; window.fetch = f0;
    return { kopf, msErst, msPdf, ersatz, pdfOk: !!(a.pdfItem && a.pdfItem.id) };
  });
  pr('PDF in der App erzeugt (kein Umweg über Microsoft) und abgelegt', r.kopf === '%PDF-' && r.pdfOk && r.msErst === 0, r);
  pr('Scheitert die App-Umwandlung, wandelt Microsoft um', r.msPdf >= 1, r);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
