// Bisherigen Speicher der Privatversion nachbauen (bis v471): Datenbank "rechnung-daten" mit Geräteschlüssel, Fotos v1, App-Sperre
// bisherigen Speicher anlegen (im Browser, gleiche Herkunft)
async function altAnlegen(p, basis, ALT){
  await p.goto(basis + 'manifest.json');
  return p.evaluate(async (alt)=>{
    const auf = (name, stores)=> new Promise((ok, nein)=>{ const r = indexedDB.open(name, 1); r.onupgradeneeded = ()=> stores.forEach((s)=> r.result.createObjectStore(s)); r.onsuccess = ()=> ok(r.result); r.onerror = ()=> nein(r.error); });
    const put = (db, store, eintraege)=> new Promise((ok, nein)=>{ const t = db.transaction(store, 'readwrite'), s = t.objectStore(store); eintraege.forEach(([k, v])=> s.put(v, k)); t.oncomplete = ok; t.onerror = ()=> nein(t.error); });
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const ver = async (bytes)=>{ const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, d: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) }; };
    const db = await auf('rechnung-daten', ['kv', 'meta']);
    await put(db, 'meta', [['schluessel', key]]);
    const kv = []; for(const [k, v] of Object.entries(alt)) kv.push([k, await ver(new TextEncoder().encode(v))]);
    await put(db, 'kv', kv); db.close();
    const bild = (farbe)=> new Promise((ok)=>{ const c = document.createElement('canvas'); c.width = 200; c.height = 260; const x = c.getContext('2d'); x.fillStyle = farbe; x.fillRect(0, 0, 200, 260); c.toBlob(ok, 'image/jpeg', 0.8); });
    const b1 = new Uint8Array(await (await bild('#f3e9c8')).arrayBuffer()), b2 = new Uint8Array(await (await bild('#d8e8f5')).arrayBuffer()), b3 = await bild('#eeeeee');
    const doku = await auf('rechnung_doku', ['fotos']);
    await put(doku, 'fotos', [['Dalt01/foto_01.jpg', Object.assign(await ver(b1), { v: 1, typ: 'image/jpeg', am: Date.now(), oben: 0 })], ['Dalt01/foto_02.jpg', Object.assign(await ver(b2), { v: 1, typ: 'image/jpeg', am: Date.now(), oben: 0 })], ['Dalt02/foto_01.jpg', b3]]);
    doku.close();
    localStorage.setItem('app_sperre', JSON.stringify({ art: 'pin', minuten: 30, pin: { s: 'x', h: 'y', n: 1 } }));
    return { b1: b1.length, b2: b2.length, b3: b3.size };
  }, ALT);
}
module.exports = { altAnlegen };
