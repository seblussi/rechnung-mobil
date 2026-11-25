// Weitere Adressen in der Maske (Wunsch 25.11.2026, Alpha-Tester): „+“ unter den Patientendaten, Art (Angehörige, Erben,
// Betreuer, Sonstige), eine Adresse als Rechnungsempfänger („z. Hd.“), alles in Spalte U (ADR) erhalten
const fs = require('fs');
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const b = [...document.querySelectorAll('.beta-overlay.aktiv button')].find((x)=> /Nein, danke/.test(x.textContent)); if(b) b.click(); });
  // 1. Maske: Knopf, Karte, Art, Empfaenger
  const m = await p.evaluate(async ()=>{
    LS.set('seitenhilfe', false); ansichtMaske('pt', 0); await new Promise(r=> setTimeout(r, 800));
    const knopf = document.getElementById('btnWaNeu'); const nachGeda = !!knopf && document.getElementById('txtGeda').closest('.feld').compareDocumentPosition(knopf) & 4;
    knopf.click(); await new Promise(r=> setTimeout(r, 100));
    const k = document.querySelector('[data-wakarte="0"]');
    const arten = [...k.querySelectorAll('[data-waart]')].map(b=> b.textContent);
    const set = (key, v)=>{ const e = k.querySelector('input[data-wak="' + key + '"]'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('name', 'Anna Muster'); set('str', 'Lindenweg 4'); set('ort', '77652 Offenburg');
    k.querySelector('[data-waart="erben"]').click(); await new Promise(r=> setTimeout(r, 50));
    const k2 = document.querySelector('[data-wakarte="0"]'); k2.querySelector('[data-waemp="0"]').click(); await new Promise(r=> setTimeout(r, 50));
    const an = (document.querySelector('[data-wakarte="0"] .wa-chips .an') || {}).textContent;
    const name = document.querySelector('[data-wakarte="0"] input[data-wak="name"]').value;
    return { nachGeda: !!nachGeda, arten, an, name, empf: document.querySelector('[data-waemp="0"]').checked };
  });
  if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/50_maske.png' });
  pr('Maske: „+ Weitere Adresse“ unter dem Geburtsdatum, Arten Angehörige/Erben/Betreuer/Sonstige', m.nachGeda && m.arten.join() === 'Angehörige,Erben,Betreuer,Sonstige', m);
  pr('Karte: Art wählbar, Eingaben bleiben beim Umschalten, Haken „Rechnung an diese Adresse“', m.an === 'Erben' && m.name === 'Anna Muster' && m.empf, m);

  // 2. Spalte U hin und zurück, Rechnungsdaten, Word-Datei
  const r = await p.evaluate(async ()=>{
    const wa = [{ art: 'erben', name: 'Anna Muster', str: 'Lindenweg 4', ort: '77652 Offenburg', empf: true }, { art: 'betreuer', name: 'B/C; | Test', str: 'Weg 1', ort: '1 X', empf: false }];
    const out = {};
    for(const ART of ['pt', 'ls']){
      const f = JSON.parse(JSON.stringify(ladeFaelle(ART)[0])); f.art = ART; f.werte.weitereAdressen = wa; if(ART === 'ls') f.werte.txtEmpfaenger = 'wa';
      const u = 'POS:1 | KM:3' + betaUSegmente(f);
      const zurueck = betaUSegmenteLesen(u).adressen;
      const daten = fallRechnungsdaten(f, Object.assign({}, ladeEinstellungen(), { name: 'Dr. Test', bank: 'Testbank', bic: 'COBADEFFXXX', iban: 'DE89370400440532013000', kontoinhaber: 'Dr. Test' }));
      for(const s of ['lib/pdf-lib.min.js', 'lokal/docxpdf.js']) await libSkriptLaden(s, ()=> false);
      const token = await msGraphTokenHolen();
      const docm = await graphDateiLaden(token, MSGRAPH_PFAD_WORDVORLAGE[ART]);
      const excel = await excelVorlageZeilenLaden(token, ART);
      const erg = await rechnungDocxErzeugen(docm, excel.zeilen, daten, 'blob');
      const zz = await JSZip.loadAsync(await erg.inhalt.arrayBuffer()), x = await zz.file('word/document.xml').async('string');
      const zeilen = (x.match(RD_ABSATZ_RE) || []).map(q=> rdAbsatzText(q).trim()).filter(Boolean).slice(0, 8);
      out[ART] = { gleich: JSON.stringify(zurueck) === JSON.stringify(waBereinigen(wa)), adr: /ADR:/.test(u), zeilen, zhd: daten.zhd };
    }
    return out;
  });
  pr('Spalte U: weitere Adressen (auch mit / ; |) bleiben vollständig erhalten', r.pt.gleich && r.ls.gleich && r.pt.adr, r);
  pr('Privatrechnung an Erben: Patient, darunter „z. Hd. Anna Muster“ und deren Anschrift', r.pt.zeilen.join('|').includes('z. Hd. Anna Muster|Lindenweg 4|77652 Offenburg'), r.pt);
  pr('Leichenschau an Erben: „z. Hd.“ statt c/o-Zeile, Anschrift darunter', r.ls.zeilen.join('|').includes('z. Hd. Anna Muster|Lindenweg 4|77652 Offenburg') && !r.ls.zeilen.join('|').includes('c/o'), r.ls);

  // 3. LS: Auswahl beim Speichern bietet die weitere Adresse an
  const o = await p.evaluate(()=> lsEmpfaengerOptionen({ txtBName: 'Ruhe', txtAdresse1: 'A 1', txtAdresse2: 'B', txtPAdresse1: 'P 1', txtPAdresse2: 'Q', weitereAdressen: [{ art: 'angehoerige', name: 'Tochter', str: 'S 2', ort: 'O', empf: true }] }).map(x=> x.key + ':' + x.label));
  pr('Leichenschau: Empfänger-Auswahl enthält die weitere Adresse', o.some(x=> /^wa0:Angehörige: z\. Hd\. Tochter, S 2, O/.test(x)), o);
  await p.context().close();
};
