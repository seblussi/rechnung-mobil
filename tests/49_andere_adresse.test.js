// „Adressieren an andere Adresse“ (Wunsch 25.11.2026, Alpha-Tester: Angehörige): Auswahl der Adressen, freie Adresse, z. Hd.
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  let nb = 0; await p.exposeFunction('__bild', async ()=>{ if(process.env.BILDER) await p.screenshot({ path: process.env.BILDER + '/49_adresse_' + (++nb) + '.png' }); });
  await p.setViewportSize({ width: 412, height: 860 });
  const r = await p.evaluate(async ()=>{
    const P = (t)=> '<w:p><w:r><w:t>' + t + '</w:t></w:r></w:p>';
    let geschrieben = null, fertig = null;
    msGraphTokenHolen = async ()=> 'tok';
    betaDateienAlle = async ()=> new Map([[(renuDateiname('LS-1') + '.docx').toLowerCase(), { id: 'd' }]]);
    graphItemLaden = async ()=> new ArrayBuffer(1);
    const lauf = async (xml, art, wahl, frei, zhd)=>{
      docxDokumentXml = async ()=> ({ zip: { file: (n, x)=>{ geschrieben = x; }, generateAsync: async ()=> new Blob(['x']) }, xml: '<w:body>' + xml + '</w:body>' });
      docxHochladenMitPdf = async ()=> ({ pdfBlob: null, pdfItem: { id: 'p' } }); betaUebersichtDatumSetzen = async ()=>{}; betaDokumentFertig = async (t, e, h)=>{ fertig = h; return true; };
      const v = new Array(30).fill(''); v[8] = 'Hauptstr. 1'; v[9] = '70173 Stuttgart'; v[10] = 'Klinikweg 5'; v[11] = '70199 Stuttgart'; v[12] = 'Bestattung Ruhe'; v[13] = 'Friedhofstr. 2'; v[14] = '70100 Stuttgart';
      const pr = betaZweiteAdresseErstellen({ renu: 'LS-1', art, z: { nr: 5, v } });
      await new Promise(r=> setTimeout(r, 300));
      const opts = [...document.querySelectorAll('.beta-overlay input[name="adrWahl"]')].map(x=> x.value);
      const titel = (document.querySelector('.beta-overlay.aktiv') || {}).textContent || '';
      if(window.__bild) await window.__bild();
      const x = document.querySelector('.beta-overlay input[value="' + wahl + '"]'); if(x){ x.checked = true; x.dispatchEvent(new Event('change')); }
      if(frei){ document.getElementById('adrFrei1').value = frei[0]; document.getElementById('adrFrei2').value = frei[1]; }
      if(zhd) document.getElementById('adrZhd').value = zhd;
      [...document.querySelectorAll('.beta-overlay.aktiv button')].find(b=> /Erstellen/.test(b.textContent)).click();
      await pr;
      return { opts, bisher: /Bisher adressiert an: (\w+)/.exec(titel) && RegExp.$1, text: (geschrieben || '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'), fertig };
    };
    const a = await lauf(P('Herrn') + P('c/o Bestattungsinstitut') + P('Friedhofstr. 2') + P('70100 Stuttgart') + P('Datum: 01.01.2026'), 'ls', 'sterbe');
    const b = await lauf(P('Frau Muster') + P('Hauptstr. 1') + P('70173 Stuttgart') + P('Datum: 01.01.2026'), 'pt', 'frei', ['Neue Str. 9', '10115 Berlin'], 'Anna Muster');
    return { a, b };
  });
  pr('LS an Bestatter → Sterbeort: Auswahl Patient/Sterbeort/andere, c/o-Zeile weg, Adresse ersetzt', r.a.opts.join() === 'melde,sterbe,frei' && r.a.text === '|Herrn|Klinikweg 5|70199 Stuttgart|Datum: ' + r.a.text.split('Datum: ')[1], r.a);
  pr('Privatrechnung an andere Adresse mit „z. Hd.“: Patient bleibt, z. Hd. darüber, neue Adresse', /^\|Frau Muster\|z\. Hd\. Anna Muster\|Neue Str\. 9\|10115 Berlin\|Datum: /.test(r.b.text), r.b);
  await p.context().close();
};
