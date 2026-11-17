// Verschlüsselter Speicher der Privatversion (Datentresor): Daten liegen nur verschlüsselt im Browser und überstehen ein Neuladen.
const { geraet, oeffnen, entsperren } = require('./hilfe');
const roh = (p)=> p.evaluate(()=> new Promise((ok)=>{ const q = indexedDB.open('rechnung_privat_tresor'); q.onsuccess = ()=>{ const d = q.result, t = d.transaction('kv'), s = t.objectStore('kv'), a = s.getAllKeys(), b = s.getAll(); t.oncomplete = ()=>{ d.close(); ok({ schluessel: a.result, klartext: b.result.some((v)=> !v || !(v instanceof Uint8Array || v instanceof ArrayBuffer) || new TextDecoder().decode(v).includes('Geheimtest')) }); }; }; }));
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  await oeffnen(p, basis, { einrichten: true });
  pr('neues Gerät: Passwort festgelegt, App läuft im Tresor-Modus', await p.evaluate(()=> window.TRESOR_MODUS === true && Speicher.istTresor()));
  await p.evaluate(async ()=>{ LS.set('pruef_probe', { name: 'Geheimtest, Patient', n: 1 }); LS.set('pruef_probe', { name: 'Geheimtest, Patient', n: 2 }); LS.set('pruef_probe', { name: 'Geheimtest, Patient', n: 3 }); await Speicher.warten(); });
  const r = await roh(p);
  pr('Eintrag liegt in der Datenbank', r.schluessel.includes('pruef_probe'), r.schluessel.slice(0, 8));
  pr('Datenbank enthält keinen Klartext', r.klartext === false);
  // alle Datenbanken des Browsers (auch Binärdaten) nach dem Testinhalt durchsuchen
  const funde = await p.evaluate(async ()=>{
    const treffer = [], dec = new TextDecoder('utf-8', { fatal: false });
    const flach = (x)=>{ if(x == null) return ''; if(x instanceof ArrayBuffer) return dec.decode(new Uint8Array(x)); if(ArrayBuffer.isView(x)) return dec.decode(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); if(typeof x === 'string') return x; if(typeof x === 'object'){ if(x instanceof CryptoKey || x instanceof Blob) return ''; try{ return Object.keys(x).map((k)=> k + ' ' + flach(x[k])).join(' '); }catch(_){ return ''; } } return String(x); };
    for(const info of await indexedDB.databases()){
      const d = await new Promise((ok, nein)=>{ const q = indexedDB.open(info.name); q.onsuccess = ()=> ok(q.result); q.onerror = ()=> nein(q.error); });
      for(const n of Array.from(d.objectStoreNames)){
        const [ks, vs] = await new Promise((ok)=>{ const t = d.transaction(n).objectStore(n), a = t.getAllKeys(), b = t.getAll(); b.onsuccess = ()=> ok([a.result, b.result]); });
        vs.forEach((v, i)=>{ if(/Geheimtest/.test(flach(v))) treffer.push(info.name + '/' + n + '/' + String(ks[i]).slice(0, 20)); });
      }
      d.close();
    }
    return treffer; });
  pr('kein Klartext in irgendeiner Datenbank des Browsers', funde.length === 0, funde);
  pr('Patientendaten liegen nicht im localStorage', await p.evaluate(()=> !Object.keys(localStorage).some((k)=> /Geheimtest/.test(localStorage.getItem(k) || '') || /^faelle_|^pruef_/.test(k))));
  await p.reload(); await entsperren(p); await p.waitForFunction(()=> typeof LS !== 'undefined' && typeof ansichtStart === 'function', null, { timeout: 40000 });
  pr('nach dem Neuladen: letzter Stand lesbar', await p.evaluate(()=> (LS.get('pruef_probe', null) || {}).n) === 3);
  await p.evaluate(async ()=>{ LS.remove ? LS.remove('pruef_probe') : Speicher.loeschen('pruef_probe'); await Speicher.warten(); });
  pr('Löschen entfernt den Eintrag aus der Datenbank', !(await roh(p)).schluessel.includes('pruef_probe'));
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await p.context().close();
};
