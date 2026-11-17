// P2: Dokumentationsfotos liegen nur verschlüsselt im Gerät. Ältere, unverschlüsselt abgelegte Fotos werden umgestellt;
// Kopien, die sicher im OneDrive liegen, werden nach einigen Tagen gelöscht und bei Bedarf neu geholt.
const { geraet, oeffnen } = require('./hilfe');
const stand = (p)=> p.evaluate(async ()=>{
  const db = await new Promise((ok, nein)=>{ const q = indexedDB.open('rechnung_doku', 1); q.onupgradeneeded = ()=> q.result.createObjectStore('fotos'); q.onsuccess = ()=> ok(q.result); q.onerror = ()=> nein(q.error); });
  const [ks, vs] = await new Promise((ok)=>{ const t = db.transaction('fotos', 'readonly'), s = t.objectStore('fotos'), a = s.getAllKeys(), b = s.getAll(); t.oncomplete = ()=> ok([a.result, b.result]); });
  db.close(); const out = {};
  for(let i = 0; i < ks.length; i++){ const v = vs[i], name = ks[i].split('/')[0];
    if(v instanceof Blob) out[name] = 'klartext';
    else if(v && v.iv && v.d) out[name] = (v.d[0] === 0xFF && v.d[1] === 0xD8 ? 'JPEG-Kennung sichtbar' : 'verschlüsselt') + (v.oben ? ', im OneDrive' : '');
    else out[name] = 'unbekannt'; }
  return out; });
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  // nachgebildetes OneDrive: nimmt hochgeladene Fotos an und gibt sie wieder heraus
  let imDrive = null; const aufrufe = [];
  await p.context().route(/graph\.microsoft\.com/, async (r)=>{
    const q = r.request(), u = decodeURIComponent(q.url()); aufrufe.push(q.method());
    if(q.method() === 'PUT'){ if(/foto_/.test(u)) imDrive = q.postDataBuffer(); return r.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"x"}' }); }
    if(q.method() === 'GET' && /foto_.*\/content/.test(u) && imDrive) return r.fulfill({ status: 200, contentType: 'image/jpeg', body: imDrive });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  // Altbestand wie in früheren Versionen: unverschlüsselte Bilder in der Datenbank
  await p.goto(basis + 'manifest.json');
  await p.evaluate(async ()=>{
    const bild = (farbe)=> new Promise((ok)=>{ const c = document.createElement('canvas'); c.width = 300; c.height = 400; const x = c.getContext('2d'); x.fillStyle = farbe; x.fillRect(0, 0, 300, 400); c.toBlob(ok, 'image/jpeg', 0.8); });
    const db = await new Promise((ok, nein)=>{ const q = indexedDB.open('rechnung_doku', 1); q.onupgradeneeded = ()=> q.result.createObjectStore('fotos'); q.onsuccess = ()=> ok(q.result); q.onerror = ()=> nein(q.error); });
    const a = await bild('#f3e9c8'), n = await bild('#d8e8f5'), w = await bild('#eee');
    await new Promise((ok, nein)=>{ const t = db.transaction('fotos', 'readwrite'), s = t.objectStore('fotos'); s.put(a, 'Dalt/foto_01.jpg'); s.put(n, 'Dneu/foto_01.jpg'); s.put(w, 'Dwaise/foto_01.jpg'); t.oncomplete = ok; t.onerror = ()=> nein(t.error); });
    db.close();
  });
  pr('Ausgangslage: drei unverschlüsselte Fotos', Object.values(await stand(p)).every((x)=> x === 'klartext'), await stand(p));
  await oeffnen(p, basis);
  const leer = { vital: {}, zustand: {}, ekg: { befunde: [], text: '' }, anamnese: '', befund: '', therapie: '', sonstiges: '' };
  await p.evaluate((leer)=>{
    LS.set('doku_Dalt', Object.assign({ id: 'Dalt', fotos: [{ name: 'foto_01.jpg', am: '2026-11-01T10:00:00Z', oben: true }] }, leer));
    LS.set('doku_Dneu', Object.assign({ id: 'Dneu', fotos: [{ name: 'foto_01.jpg', am: '2026-11-16T20:00:00Z', oben: false }] }, leer));
  }, leer);
  let s = null; await p.evaluate(()=> dokuDb.aufraeumen()); s = await stand(p);
  pr('nach dem Start: alle Fotos verschlüsselt', Object.keys(s).length === 3 && Object.values(s).every((x)=> x.startsWith('verschlüsselt')), s);
  pr('Foto bleibt lesbar (JPEG)', await p.evaluate(async ()=>{ const b = await dokuDb.holen('Dneu/foto_01.jpg'); const u = new Uint8Array(await b.arrayBuffer()); return b.type === 'image/jpeg' && u[0] === 0xFF && u[1] === 0xD8; }));
  await p.evaluate(()=> dokuDb.aufraeumen()); await p.evaluate(()=> dokuDb.aufraeumen(Date.now() + 4 * 86400000)); s = await stand(p);
  pr('nach 4 Tagen: hochgeladenes Foto gelöscht, nicht hochgeladenes und unbekanntes bleiben', !s.Dalt && s.Dneu === 'verschlüsselt' && s.Dwaise === 'verschlüsselt', s);
  // Hochladen
  await p.evaluate(()=>{ window.msGraphTokenHolen = async ()=> 'testtoken'; try{ msGraphStatus = 'angemeldet'; }catch(_){} });
  const hoch = await p.evaluate(async ()=>{ try{ await dokuHochladen(dokuLaden('Dneu')); return dokuLaden('Dneu').fotos[0].oben === true; }catch(e){ return String(e.message || e); } });
  pr('Hochladen: im OneDrive kommt das Bild an (JPEG)', hoch === true && !!imDrive && imDrive[0] === 0xFF && imDrive[1] === 0xD8, hoch);
  await p.evaluate(()=> dokuDb.aufraeumen(Date.now() + 1 * 86400000)); s = await stand(p);
  pr('1 Tag nach dem Hochladen: Kopie noch da', s.Dneu === 'verschlüsselt, im OneDrive', s);
  await p.evaluate(()=> dokuDb.aufraeumen(Date.now() + 4 * 86400000)); s = await stand(p);
  pr('4 Tage nach dem Hochladen: Kopie gelöscht', !s.Dneu, s);
  pr('Anzeige: Foto wird bei Bedarf aus dem OneDrive nachgeladen und wieder verschlüsselt abgelegt', await p.evaluate(async ()=>{ const d = dokuLaden('Dneu'); const b = await dokuFotoBlob(d, d.fotos[0]); return !!b && b.size > 100; }) && (await stand(p)).Dneu === 'verschlüsselt, im OneDrive');
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
