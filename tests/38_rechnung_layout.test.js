// Rechnung (Privat + Leichenschau), Wunsch 21.11.2026: Tabellenränder bündig mit dem Text; der QR-Code überdeckt
// den Absatz „Ich bitte Sie …“ nie (Text endet immer links neben dem QR-Code). Erzeugt Word-Datei und PDF im Gerät.
const fs = require('fs');
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  for(const ART of ['pt', 'ls']){
    const r = await p.evaluate(async (ART)=>{
      for(const s of ['lib/pdf-lib.min.js', 'lokal/docxpdf.js']) await libSkriptLaden(s, ()=> ART === 'ls');
      const token = await msGraphTokenHolen();
      const docm = await graphDateiLaden(token, MSGRAPH_PFAD_WORDVORLAGE[ART]);
      const excel = await excelVorlageZeilenLaden(token, ART);
      const f = JSON.parse(JSON.stringify(ladeFaelle(ART)[0])); f.art = ART;
      if(ART === 'pt'){
        f.positionen = ['50', 'H', '7', '602', '56'];
        f.positionsDetails = { faktoren: { '50': 3.5, '7': 3.5, '602': 1.8, '56': 1.8 }, begruendungen: { '50': 'Mehraufwand aufgrund Einarbeitung in Patientengeschichte bei erstmaligem Patientenkontakt', '7': 'Komplexes Krankheitsbild, multiple Vorerkrankungen, Mehraufwand durch Mobilitätseinschränkung', '56': 'von 16:00 bis 16:32 Uhr' }, anzahl: {}, abgewaehlt: [], behalten: [] };
      }
      const daten = fallRechnungsdaten(f, Object.assign({}, ladeEinstellungen(), { name: 'Dr. Test', bank: 'Testbank', bic: 'COBADEFFXXX', iban: 'DE89370400440532013000', kontoinhaber: 'Dr. Test' }));
      const erg = await rechnungDocxErzeugen(docm, excel.zeilen, daten, 'blob');
      const buf = await erg.inhalt.arrayBuffer();
      const x = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
      const tbl = (x.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).find((t)=> /Bezeichnung/.test(t)) || '';
      const ind = +((/<w:tblInd w:w="(-?\d+)"/.exec(tbl) || [])[1]);
      const breite = (tbl.match(/<w:gridCol w:w="(\d+)"/g) || []).reduce((a, g)=> a + +/(\d+)/.exec(g)[1], 0);
      const absaetze = x.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
      const bitte = absaetze.find((q)=> q.indexOf('girocode.png') >= 0 || q.indexOf('GiroCode') >= 0) || '';
      const textInd = absaetze.map((q)=> /<w:ind w:left="(\d+)" w:right="(\d+)"/.exec(q)).find(Boolean);
      const qrRechts = +((/<w:ind\b[^>]*w:right="(\d+)"/.exec(bitte) || [])[1] || 0);
      // PDF im Gerät zeichnen (Bild für den Bericht)
      const pdf = await DocxPdf.umwandeln(buf);
      const pdfjs = await pdfjsLaden();
      const doc = await pdfjs.getDocument({ data: pdf, standardFontDataUrl: new URL('lib/pdfjs/standard_fonts/', location.href).href }).promise;
      const pg = await doc.getPage(1), vp = pg.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return { ind, breite, textL: textInd ? +textInd[1] : null, textR: textInd ? +textInd[2] : null, qr: !!bitte, qrRechts, png: c.toDataURL('image/png').split(',')[1] };
    }, ART);
    if(process.env.BILDER) fs.writeFileSync(process.env.BILDER + '/38_' + ART + '.png', Buffer.from(r.png, 'base64'));
    const textBreite = 11906 - 1080 - 1080 - r.textL - r.textR;
    pr(ART.toUpperCase() + ': Tabelle bündig mit dem Text (links ' + r.ind + ' = ' + r.textL + ' Twips, Breite ' + r.breite + ' = ' + textBreite + ')', r.ind === r.textL && Math.abs(r.breite - textBreite) <= 2, { ind: r.ind, breite: r.breite, textL: r.textL, textR: r.textR });
    pr(ART.toUpperCase() + ': QR-Code eingefügt, Absatz daneben rechts eingerückt (Text läuft nicht unter den Code)', r.qr && r.qrRechts > 1500, { qr: r.qr, rechts: r.qrRechts });
  }
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await p.context().close();
};
