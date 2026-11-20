// Mitgelieferte Bibliotheken nach einem Update: pdf.js (Modul + Worker + Standardschriften) zeigt eine PDF-Seite,
// JSZip packt und entpackt, hash-wasm/Argon2id liefert denselben Schlüssel wie bisher (sonst ließe sich ein
// bestehender Datentresor nicht mehr öffnen), Versionen wie in package.json.
const fs = require('fs'), path = require('path');
const { geraet, oeffnen } = require('./hilfe');
const PAKET = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).dependencies;
// Argon2id ('Ärztin-Passwort 2026', Salz 'rechnung-mobil-salz', m=19456, t=2, p=1, 32 Byte) -- mit hash-wasm 4.12.0 ermittelt
const ARGON_SOLL = '0257d1204dd2f929ea41b03b08c00a1b7a5b47945aac465679781fdf59022bac';

// kleinste PDF-Datei mit Text in Helvetica (nicht eingebettet -> pdf.js lädt die Standardschrift aus lib/pdfjs/standard_fonts)
function minipdf(){
  const inhalt = 'BT /F1 48 Tf 40 100 Td (Rechnung 2026) Tj ET';
  const obj = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + inhalt.length + ' >>\nstream\n' + inhalt + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let s = '%PDF-1.4\n'; const pos = [];
  obj.forEach((o, i)=>{ pos.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = s.length;
  s += 'xref\n0 ' + (obj.length + 1) + '\n0000000000 65535 f \n' + pos.map((p)=> String(p).padStart(10, '0') + ' 00000 n \n').join('');
  return s + 'trailer\n<< /Size ' + (obj.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
}

module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);

  const r = await p.evaluate(async (pdf)=>{
    const erg = {};
    try{
      const pdfjs = await pdfjsLaden();
      const doc = await pdfjs.getDocument({ data: new TextEncoder().encode(pdf), standardFontDataUrl: new URL('lib/pdfjs/standard_fonts/', location.href).href }).promise;
      const seite = await doc.getPage(1), vp = seite.getViewport({ scale: 1 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await seite.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp }).promise;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dunkel = 0;
      for(let i = 0; i < d.length; i += 4) if(d[i + 3] > 0 && d[i] < 128) dunkel++;
      const text = (await seite.getTextContent()).items.map((t)=> t.str).join('');
      erg.pdf = { version: pdfjs.version, seiten: doc.numPages, groesse: [vp.width, vp.height], dunkel, text };
    }catch(e){ erg.pdf = { fehler: String(e && e.message || e) }; }
    try{
      const z = new JSZip(); z.file('a/rechnung.txt', 'Übersicht 2026 – 123,45 €'); z.file('b.bin', new Uint8Array([0, 1, 2, 255]));
      const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const z2 = await JSZip.loadAsync(blob);   // Blob einlesen (in 3.10.2 neu über Blob.arrayBuffer)
      erg.zip = { version: JSZip.version, text: await z2.file('a/rechnung.txt').async('string'), bin: Array.from(await z2.file('b.bin').async('uint8array')) };
    }catch(e){ erg.zip = { fehler: String(e && e.message || e) }; }
    try{
      erg.argon = await hashwasm.argon2id({ password: new TextEncoder().encode('Ärztin-Passwort 2026'), salt: new TextEncoder().encode('rechnung-mobil-salz'),
        parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: 'hex' });
    }catch(e){ erg.argon = 'Fehler: ' + (e && e.message); }
    return erg;
  }, minipdf());

  pr('pdf.js ' + PAKET['pdfjs-dist'] + ': PDF geladen, Seite gezeichnet (Standardschrift), Text gelesen',
    r.pdf && r.pdf.version === PAKET['pdfjs-dist'] && r.pdf.seiten === 1 && r.pdf.dunkel > 300 && r.pdf.text === 'Rechnung 2026', r.pdf);
  pr('JSZip ' + PAKET.jszip + ': packen und aus Blob entpacken (Umlaute, Binärdaten)',
    r.zip && r.zip.version === PAKET.jszip && r.zip.text === 'Übersicht 2026 – 123,45 €' && JSON.stringify(r.zip.bin) === '[0,1,2,255]', r.zip);
  pr('Argon2id (hash-wasm ' + PAKET['hash-wasm'] + '): derselbe Schlüssel wie mit der bisherigen Version', r.argon === ARGON_SOLL, r.argon);
  pr('keine Skriptfehler, keine CSP-Verstöße', p.fehler.length === 0 && p.csp.length === 0, { fehler: p.fehler.slice(0, 3), csp: p.csp.slice(0, 3) });
  await p.context().close();
};
