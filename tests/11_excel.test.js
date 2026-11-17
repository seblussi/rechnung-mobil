// Excel-Bibliothek (SheetJS, Sicherheitsbericht L12): richtige Version, liest die Vorlagen aus starter/,
// präparierte Datei verändert Object.prototype nicht.
const { geraet } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis);
  await p.goto(basis + 'manifest.json'); await p.addScriptTag({ url: basis + 'lib/xlsx/xlsx.full.min.js' });
  const r = await p.evaluate(async (basis)=>{
    const o = { version: XLSX.version, dateien: {} };
    for(const d of ['Uebersicht_gestellter_Rechnungen.xlsx', 'Fahrdienst_Dokumentation.xlsx', 'Vorlage_Abrechnung_Leichenschau_makro.xlsm']){
      const buf = new Uint8Array(await (await fetch(basis + 'starter/' + d)).arrayBuffer());
      const wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellNF: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      o.dateien[d] = { blaetter: wb.SheetNames.length, zeilen: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).length };
    }
    const ws = XLSX.utils.aoa_to_sheet([['__proto__', 'constructor'], ['{"polluted":1}', '=1+1']]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '__proto__');
    XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    o.proto = ({}).polluted === undefined;
    return o;
  }, basis);
  pr('SheetJS-Version 0.20.3 (Sicherheitskorrekturen gegen Prototyp-Manipulation und ReDoS)', r.version === '0.20.3', r.version);
  pr('Vorlagen werden gelesen', Object.values(r.dateien).every((x)=> x.blaetter >= 1 && x.zeilen >= 1), r.dateien);
  pr('präparierte Datei verändert Object.prototype nicht', r.proto);
  await p.context().close();
};
