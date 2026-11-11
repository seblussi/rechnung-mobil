// =====================================================================
// Tresor: alle Daten der App verschluesselt im Geraet (IndexedDB)
// =====================================================================
// - Schluessel/Werte (frueher localStorage: Faelle, Einstellungen, GKV, ...)
//   und Dateien (Rechnungsuebersicht, Fahrtenbuch, Vorlagen, PDFs, Fotos,
//   einstellungen.ini ...). Beides liegt NUR verschluesselt in der IndexedDB.
// - Nach dem Entsperren stehen die Schluessel/Werte im Arbeitsspeicher
//   (synchron lesbar wie localStorage), Dateien werden bei Bedarf entschluesselt.
// - Jede Aenderung wird sofort verschluesselt geschrieben und an die
//   Synchronisation gemeldet (Tresor.beiAenderung).
// - Ausnahme: 'ui_vorlieben' (Design/Dunkel fuer den Startbildschirm) liegt
//   unverschluesselt im localStorage -- enthaelt keine Patientendaten.
(function(global){
  'use strict';
  const DB_NAME = 'rechnungsapp_tresor', DB_VERSION = 1;
  let dbP = null;
  function db(){
    return dbP || (dbP = new Promise((ok, fehler)=>{
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = ()=>{
        const d = r.result;
        ['meta', 'kv', 'dmeta', 'ddaten', 'sync'].forEach(n=>{ if(!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = ()=> ok(r.result);
      r.onerror = ()=> fehler(r.error);
      r.onblocked = ()=> fehler(new Error('Datenbank ist blockiert (App in einem anderen Fenster offen?)'));
    }));
  }
  function req(r){ return new Promise((ok, f)=>{ r.onsuccess = ()=> ok(r.result); r.onerror = ()=> f(r.error); }); }
  async function idb(store, modus, fn){
    const d = await db();
    return new Promise((ok, f)=>{
      const t = d.transaction(store, modus); const s = t.objectStore(store);
      let erg; Promise.resolve(fn(s)).then(x=> erg = x);
      t.oncomplete = ()=> ok(erg); t.onerror = ()=> f(t.error); t.onabort = ()=> f(t.error || new Error('Abbruch'));
    });
  }
  // Demo-Modus (Einstellungen > Demo): alles nur im Arbeitsspeicher -- die echte
  // Datenbank wird gar nicht erst geoeffnet, echte Daten bleiben unberuehrt.
  const DEMO = (()=>{ try{ return global.sessionStorage.getItem('demo_modus') || ''; }catch(_){ return ''; } })();
  const demoDb = new Map();
  const demoStore = (n)=>{ if(!demoDb.has(n)) demoDb.set(n, new Map()); return demoDb.get(n); };
  const holen = DEMO ? async (store, k)=> demoStore(store).get(k) : (store, k)=> idb(store, 'readonly', s=> req(s.get(k)));
  const setzen = DEMO ? async (store, k, v)=>{ demoStore(store).set(k, v); } : (store, k, v)=> idb(store, 'readwrite', s=> { s.put(v, k); });
  const weg = DEMO ? async (store, k)=>{ demoStore(store).delete(k); } : (store, k)=> idb(store, 'readwrite', s=> { s.delete(k); });
  async function alle(store){
    if(DEMO) return Array.from(demoStore(store).entries());
    return idb(store, 'readonly', s=> new Promise((ok, f)=>{
      const out = []; const c = s.openCursor();
      c.onsuccess = ()=>{ const cur = c.result; if(cur){ out.push([cur.key, cur.value]); cur.continue(); } else ok(out); };
      c.onerror = ()=> f(c.error);
    }));
  }

  // ---------- Zustand ----------
  let key = null, status = 'unbekannt', info = null, geraet = null;
  const kvMem = new Map();             // schluessel -> JSON-Text
  const dMeta = new Map();             // id -> {id, pfad, name, ordner, groesse, typ, geaendert, mappe}
  const pfadIdx = new Map();           // pfad (klein) -> id
  const hoerer = [];
  const kvSchreibt = new Map();        // schluessel -> {laeuft, naechster}

  function pfadNorm(p){ return String(p || '').replace(/\\/g, '/').split('/').map(s=> s.trim()).filter(Boolean).join('/'); }
  function pfadKlein(p){ return pfadNorm(p).toLowerCase(); }
  function neueId(){ return Array.from(Krypto.zufall(10), b=> b.toString(16).padStart(2, '0')).join(''); }
  function melden(e){ hoerer.forEach(f=>{ try{ f(e); }catch(_){} }); }

  // ---------- Status / Einrichten / Entsperren ----------
  async function pruefen(){
    if(!Krypto.verfuegbar || (!DEMO && !global.indexedDB)){ status = 'nicht_unterstuetzt'; return status; }
    info = await holen('meta', 'schluessel');
    geraet = await holen('meta', 'geraet');
    if(!geraet){ geraet = { id: neueId(), angelegt: new Date().toISOString() }; await setzen('meta', 'geraet', geraet); }
    if(!info){ status = 'neu'; return status; }
    const gemerkt = await holen('meta', 'gemerkt');
    if(gemerkt && gemerkt.key){ key = gemerkt.key; await laden(); status = 'offen'; return status; }
    status = 'gesperrt'; return status;
  }
  // Demo (Privatversion ohne Tresor-Passwort): zufaelliger Schluessel, nur im Arbeitsspeicher
  async function demoOeffnen(){
    if(!DEMO) throw new Error('Nur im Demo-Modus.');
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    info = { demo: true }; if(!geraet) geraet = { id: 'demo' };
    await laden(); status = 'offen';
  }
  async function laden(){
    kvMem.clear(); dMeta.clear(); pfadIdx.clear();
    for(const [k, paket] of await alle('kv')){
      try{ kvMem.set(k, Krypto.text(await Krypto.entschluesseln(key, paket))); }catch(e){ console.warn('Tresor: Eintrag nicht lesbar', k); }
    }
    for(const [id, paket] of await alle('dmeta')){
      try{ const m = await Krypto.jsonEnt(key, paket); dMeta.set(id, m); pfadIdx.set(pfadKlein(m.pfad), id); }catch(e){ console.warn('Tresor: Dateiinfo nicht lesbar', id); }
    }
  }
  async function einrichten(passwort){
    const code = Krypto.neuerCode();
    const r = await Krypto.hauptschluesselNeu(passwort, code);
    r.roh.fill(0);
    info = r.info; key = r.key;
    await setzen('meta', 'schluessel', info);
    await laden();
    status = 'offen';
    melden({ art: 'schluessel' });
    return { code };
  }
  // Schluesselinfo von einem anderen Geraet (Synchronisation) uebernehmen und entsperren
  async function einrichtenMitInfo(fremdInfo, geheim, mitCode){
    const r = await Krypto.auswickeln(fremdInfo, geheim, mitCode);
    if(!r) return false;
    r.roh.fill(0);
    info = fremdInfo; key = r.key;
    await setzen('meta', 'schluessel', info);
    await laden(); status = 'offen';
    return true;
  }
  async function entsperren(geheim, mitCode, merken){
    if(!info) info = await holen('meta', 'schluessel');
    const r = await Krypto.auswickeln(info, geheim, mitCode);
    if(!r) return false;
    key = r.key;
    // aeltere Tresore beim Entsperren auf Argon2id umstellen (Hauptschluessel bleibt gleich)
    try{
      if(Krypto.veraltet(info)){
        let neu = info;
        if(!mitCode && info.pw.kdf !== 'argon2id') neu = await Krypto.passwortNeu(neu, r.roh, geheim);
        if(mitCode && info.code.kdf !== 'argon2id') neu = await Krypto.codeHuelleNeu(neu, r.roh, geheim);
        if(neu !== info){ info = neu; await setzen('meta', 'schluessel', info); melden({ art: 'schluessel' }); }
      }
    }catch(e){ console.warn('Tresor: Umstellung auf Argon2id', e); }
    if(merken) await setzen('meta', 'gemerkt', { key: await Krypto.nichtExportierbar(r.roh), am: new Date().toISOString() });
    r.roh.fill(0);
    await laden(); status = 'offen';
    return true;
  }
  async function geraetMerken(an, passwort){
    if(!an){ await weg('meta', 'gemerkt'); return true; }
    const r = await Krypto.auswickeln(info, passwort, false); if(!r) return false;
    await setzen('meta', 'gemerkt', { key: await Krypto.nichtExportierbar(r.roh), am: new Date().toISOString() });
    r.roh.fill(0); return true;
  }
  async function istGemerkt(){ return !!(await holen('meta', 'gemerkt')); }
  // Passwort-Regeln nach NIST SP 800-63B Rev. 4: Laenge statt Zeichenarten-Pflicht,
  // dafuer Abgleich mit einer Sperrliste gaengiger Passwoerter und einfacher Muster.
  // Gilt beim Festlegen/Aendern und beim Entsperren (schwaches Altpasswort -> Wechsel).
  const PW_MIN = 15;
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
  // Wortkerne: (a) nur die Buchstaben, (b) ohne Ziffern/Zeichen am Anfang/Ende, Leetspeak aufgeloest
  const pwKerne = (pw)=>{ const k = String(pw).toLowerCase();
    return [k.replace(/[^a-zäöüß]/g, ''), k.replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/g, '').replace(/[013457@$]/g, (z)=> LEET[z]).replace(/[^a-zäöüß]/g, '')]; };
  const REIHEN = ['01234567890123456789', '98765432109876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba',
    'qwertzuiopasdfghjklyxcvbnm', 'qwertyuiopasdfghjklzxcvbnm', '1q2w3e4r5t6z7u8i9o0p', '1q2w3e4r5t6y7u8i9o0p', 'qayxswedcvfrtgbnhzujmkiolp'];
  function passwortFehlt(pw){
    pw = String(pw || ''); const f = [];
    if([...pw].length < PW_MIN){ f.push('mind. ' + PW_MIN + ' Zeichen (bisher ' + [...pw].length + ')'); return f; }
    const klein = pw.toLowerCase(), roh = klein.replace(/[^a-z0-9äöüß]/g, ''), kerne = pwKerne(pw);
    const liste = global.PW_SPERRLISTE || new Set();
    const wdh = (t)=> { const m = /^(.+?)\1+$/.exec(t); return m ? m[1] : null; };
    if(new Set(klein).size < 5) f.push('zu viele gleiche Zeichen');
    else if(wdh(klein) || wdh(roh)) f.push('keine Wiederholungen (z. B. „abcabc…“)');
    else if(roh.length >= 6 && REIHEN.some(r=> (r + r).includes(roh.slice(0, 6)) && (r + r + r).includes(roh))) f.push('keine Zeichenfolgen wie „123456…“ oder Tastaturreihen');
    else if(kerne[0].length < 6) f.push('mehr Buchstaben, nicht fast nur Ziffern/Zeichen');
    else if(kerne.some(k=> liste.has(k) || (wdh(k) && liste.has(wdh(k))))) f.push('kein bekanntes oder gängiges Passwort (auch nicht mit angehängten Ziffern/Zeichen)');
    return f;
  }
  const PASSWORT_REGEL = 'Mindestens ' + PW_MIN + ' Zeichen. Am besten drei, vier zufällige Wörter, z. B. „Tannenzapfen Fahrrad Kompott“. Ziffern und Sonderzeichen sind erlaubt, aber nicht nötig. Gängige Passwörter und Muster wie „123456…“ werden abgelehnt.';
  function passwortRegelFehler(pw){
    const f = passwortFehlt(pw); if(!f.length) return '';
    return /^mind\./.test(f[0]) ? 'Noch zu kurz: ' + f[0] + '.' : 'Zu leicht zu erraten: ' + f.join(', ') + '.';
  }
  async function passwortAendern(altGeheim, mitCode, neu){
    const r = await Krypto.auswickeln(info, altGeheim, mitCode); if(!r) return false;
    info = await Krypto.passwortNeu(info, r.roh, neu); r.roh.fill(0);
    await setzen('meta', 'schluessel', info);
    if(await istGemerkt()) await weg('meta', 'gemerkt');   // nach Passwortwechsel neu merken lassen
    melden({ art: 'schluessel' });
    return true;
  }
  // Neuen Wiederherstellungsschluessel ausgeben (alter wird ungueltig)
  async function codeErneuern(passwort){
    const r = await Krypto.auswickeln(info, passwort, false); if(!r) return null;
    const code = Krypto.neuerCode();
    info = await Krypto.einwickeln(r.roh, passwort, code); r.roh.fill(0);
    await setzen('meta', 'schluessel', info);
    melden({ art: 'schluessel' });
    return code;
  }
  async function pruefePasswort(pw){ const r = await Krypto.auswickeln(info, pw, false); if(r){ r.roh.fill(0); return true; } return false; }
  function sperren(){ key = null; kvMem.clear(); dMeta.clear(); pfadIdx.clear(); status = 'gesperrt'; }
  async function allesLoeschen(){
    sperren();
    if(DEMO){ demoDb.clear(); status = 'neu'; return; }
    const d = await db(); d.close(); dbP = null;
    await new Promise((ok)=>{ const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = ()=> ok(); });
    status = 'neu';
  }
  // ---------- Entsperren per Passkey (Fingerabdruck / Face ID) ----------
  // Je Geraet/Passkey ein Eintrag in meta 'passkeys' (unverschluesselt, enthaelt
  // nur Kennung, Salt und den eingewickelten Hauptschluessel). Ohne den Passkey
  // (Biometrie bzw. Geraete-PIN) ist der Eintrag wertlos. Passwort und
  // Wiederherstellungsschluessel funktionieren weiterhin.
  const b64url = (b)=> Krypto.b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function passkeyUnterstuetzt(){
    try{
      if(!global.PublicKeyCredential || !navigator.credentials) return false;
      if(PublicKeyCredential.getClientCapabilities){ const c = await PublicKeyCredential.getClientCapabilities(); if(c && c['extension:prf'] === false) return false; }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }catch(_){ return false; }
  }
  async function passkeys(){ return (await holen('meta', 'passkeys')) || []; }
  function webauthnFehler(e){
    if(e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return 'abbruch';
    if(e && e.name === 'InvalidStateError') return 'vorhanden';
    return (e && e.message) || String(e);
  }
  // PRF-Ausgabe fuer die angegebenen Eintraege holen -> {eintrag, ausgabe}
  async function prfHolen(liste){
    const evalByCredential = {};
    liste.forEach(p=>{ evalByCredential[b64url(Krypto.ausB64(p.id))] = { first: Krypto.ausB64(p.salt) }; });
    const a = await navigator.credentials.get({ publicKey: {
      challenge: Krypto.zufall(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: liste.map(p=> ({ type: 'public-key', id: Krypto.ausB64(p.id) })),
      extensions: { prf: { evalByCredential } } } });
    if(!a) return null;
    const id = Krypto.b64(new Uint8Array(a.rawId));
    const eintrag = liste.find(p=> p.id === id);
    const r = (a.getClientExtensionResults() || {}).prf;
    const aus = r && r.results && r.results.first;
    if(!eintrag || !aus) return null;
    return { eintrag, ausgabe: new Uint8Array(aus) };
  }
  // -> {ok:true} | {fehler:'passwort'|'abbruch'|'kein_prf'|'vorhanden'|text}
  async function passkeyEinrichten(passwort, name){
    if(!info) info = await holen('meta', 'schluessel');
    const r = await Krypto.auswickeln(info, passwort, false); if(!r) return { fehler: 'passwort' };
    try{
      const salt = Krypto.zufall(32);
      const vorhandene = await passkeys();
      let cred;
      try{
        cred = await navigator.credentials.create({ publicKey: {
          rp: { name: 'Rechnungs-App', id: location.hostname },
          user: { id: Krypto.zufall(16), name: 'Rechnungs-App · ' + (name || 'Datentresor'), displayName: 'Rechnungs-App – Datentresor' },
          challenge: Krypto.zufall(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
          excludeCredentials: vorhandene.map(p=> ({ type: 'public-key', id: Krypto.ausB64(p.id) })),
          timeout: 60000, attestation: 'none',
          extensions: { prf: { eval: { first: salt } } } } });
      }catch(e){ return { fehler: webauthnFehler(e) }; }
      if(!cred) return { fehler: 'abbruch' };
      const ext = (cred.getClientExtensionResults() || {}).prf;
      if(!ext || ext.enabled === false) return { fehler: 'kein_prf' };
      const eintrag = { id: Krypto.b64(new Uint8Array(cred.rawId)), salt: Krypto.b64(salt), name: name || 'Gerät', am: new Date().toISOString() };
      let aus = ext.results && ext.results.first ? new Uint8Array(ext.results.first) : null;
      if(!aus){
        // manche Plattformen liefern die PRF-Ausgabe erst beim ersten Anmelden
        try{ const g = await prfHolen([eintrag]); aus = g && g.ausgabe; }catch(e){ return { fehler: webauthnFehler(e) }; }
        if(!aus) return { fehler: 'kein_prf' };
      }
      const k = await Krypto.prfSchluessel(aus, salt); aus.fill(0);
      eintrag.wrap = Krypto.b64(await Krypto.verschluesseln(k, r.roh));
      await setzen('meta', 'passkeys', vorhandene.concat([eintrag]));
      return { ok: true };
    } finally { r.roh.fill(0); }
  }
  // -> true | 'abbruch' | 'keiner' | Fehlertext
  async function passkeyEntsperren(){
    const liste = await passkeys(); if(!liste.length) return 'keiner';
    if(!info) info = await holen('meta', 'schluessel');
    let g;
    try{ g = await prfHolen(liste); }catch(e){ return webauthnFehler(e); }
    if(!g) return 'Der Passkey hat keinen Schlüssel geliefert.';
    try{
      const k = await Krypto.prfSchluessel(g.ausgabe, Krypto.ausB64(g.eintrag.salt)); g.ausgabe.fill(0);
      const roh = await Krypto.entschluesseln(k, Krypto.ausB64(g.eintrag.wrap));
      key = await Krypto.nichtExportierbar(roh); roh.fill(0);
    }catch(e){ return 'Der Passkey passt nicht (mehr) zu diesem Datentresor.'; }
    await laden(); status = 'offen';
    return true;
  }
  async function passkeyEntfernen(id){ await setzen('meta', 'passkeys', (await passkeys()).filter(p=> p.id !== id)); }

  function offen(){ return status === 'offen' && !!key; }
  function brauchtOffen(){ if(!offen()) throw new Error('Der Datentresor ist gesperrt.'); }

  // ---------- Schluessel/Werte (Ersatz fuer localStorage) ----------
  function kvText(k){ return kvMem.has(k) ? kvMem.get(k) : null; }
  function kvSchreibenEinreihen(k){
    let z = kvSchreibt.get(k); if(!z){ z = { laeuft: false, nochmal: false }; kvSchreibt.set(k, z); }
    if(z.laeuft){ z.nochmal = true; return z.p; }
    z.laeuft = true;
    z.p = (async ()=>{
      try{
        do{
          z.nochmal = false;
          const t = kvMem.get(k);
          if(t == null) await weg('kv', k);
          else await setzen('kv', k, await Krypto.verschluesseln(key, t));
        } while(z.nochmal);
      }catch(e){ console.error('Tresor: Schreiben fehlgeschlagen', k, e); melden({ art: 'fehler', text: 'Speichern fehlgeschlagen: ' + (e.message || e) }); }
      finally{ z.laeuft = false; }
    })();
    return z.p;
  }
  function kvSetzenText(k, text, quelle){
    brauchtOffen();
    if(kvMem.get(k) === text) return;
    kvMem.set(k, text); kvSchreibenEinreihen(k);
    melden({ art: 'kv', schluessel: k, quelle: quelle || 'app' });
  }
  function kvLoeschen(k, quelle){
    brauchtOffen();
    if(!kvMem.has(k)) return;
    kvMem.delete(k); kvSchreibenEinreihen(k);
    melden({ art: 'kv', schluessel: k, geloescht: true, quelle: quelle || 'app' });
  }
  async function kvWarten(){ await Promise.all(Array.from(kvSchreibt.values()).map(z=> z.p).filter(Boolean)); }

  // ---------- Dateien ----------
  function metaPfad(p){ const id = pfadIdx.get(pfadKlein(p)); return id ? dMeta.get(id) : null; }
  function metaId(id){ return dMeta.get(id) || null; }
  async function metaSpeichern(m){ dMeta.set(m.id, m); pfadIdx.set(pfadKlein(m.pfad), m.id); await setzen('dmeta', m.id, await Krypto.jsonVer(key, m)); }
  async function ordnerAnlegen(pfad, quelle){
    brauchtOffen();
    pfad = pfadNorm(pfad); if(!pfad) return null;
    const vorh = metaPfad(pfad); if(vorh) return vorh;
    const teile = pfad.split('/');
    if(teile.length > 1) await ordnerAnlegen(teile.slice(0, -1).join('/'), quelle);
    const m = { id: neueId(), pfad, name: teile[teile.length - 1], ordner: true, groesse: 0, geaendert: new Date().toISOString(), angelegt: new Date().toISOString() };
    await metaSpeichern(m);
    melden({ art: 'datei', id: m.id, pfad, quelle: quelle || 'app' });
    return m;
  }
  // inhalt: ArrayBuffer/Uint8Array/Blob/String
  async function dateiSchreiben(pfad, inhalt, typ, extra, quelle){
    brauchtOffen();
    pfad = pfadNorm(pfad);
    if(inhalt instanceof Blob) inhalt = new Uint8Array(await inhalt.arrayBuffer());
    const bytes = Krypto.bytes(inhalt);
    const teile = pfad.split('/');
    if(teile.length > 1) await ordnerAnlegen(teile.slice(0, -1).join('/'), quelle);
    const alt = metaPfad(pfad);
    const jetzt = new Date().toISOString();
    const m = Object.assign({}, alt || { id: neueId(), angelegt: jetzt }, { pfad, name: teile[teile.length - 1], ordner: false, groesse: bytes.length, typ: typ || (alt && alt.typ) || 'application/octet-stream', geaendert: jetzt, rev: neueId() }, extra || {});
    await setzen('ddaten', m.id, await Krypto.verschluesseln(key, bytes));
    await metaSpeichern(m);
    melden({ art: 'datei', id: m.id, pfad, quelle: quelle || 'app' });
    return m;
  }
  async function dateiLesen(pfadOderId){
    brauchtOffen();
    const m = dMeta.get(pfadOderId) || metaPfad(pfadOderId);
    if(!m || m.ordner) return null;
    const p = await holen('ddaten', m.id); if(!p) return new Uint8Array(0);
    return Krypto.entschluesseln(key, p);
  }
  async function dateiLoeschen(pfadOderId, quelle){
    brauchtOffen();
    const m = dMeta.get(pfadOderId) || metaPfad(pfadOderId); if(!m) return false;
    const betroffen = m.ordner ? Array.from(dMeta.values()).filter(x=> pfadKlein(x.pfad) === pfadKlein(m.pfad) || pfadKlein(x.pfad).startsWith(pfadKlein(m.pfad) + '/')) : [m];
    for(const x of betroffen){
      dMeta.delete(x.id); pfadIdx.delete(pfadKlein(x.pfad));
      await weg('dmeta', x.id); await weg('ddaten', x.id);
      melden({ art: 'datei', id: x.id, pfad: x.pfad, geloescht: true, quelle: quelle || 'app' });
    }
    return true;
  }
  // Umbenennen/Verschieben (Ordner samt Inhalt)
  async function dateiUmbenennen(pfadOderId, neuerPfad, quelle){
    brauchtOffen();
    const m = dMeta.get(pfadOderId) || metaPfad(pfadOderId); if(!m) return null;
    neuerPfad = pfadNorm(neuerPfad);
    const altK = pfadKlein(m.pfad);
    const teile = neuerPfad.split('/'); if(teile.length > 1) await ordnerAnlegen(teile.slice(0, -1).join('/'), quelle);
    const betroffen = Array.from(dMeta.values()).filter(x=> pfadKlein(x.pfad) === altK || pfadKlein(x.pfad).startsWith(altK + '/'));
    for(const x of betroffen){
      pfadIdx.delete(pfadKlein(x.pfad));
      const np = neuerPfad + x.pfad.slice(m.pfad.length);
      const n = Object.assign({}, x, { pfad: np, name: np.split('/').pop(), geaendert: new Date().toISOString() });
      await metaSpeichern(n);
      melden({ art: 'datei', id: n.id, pfad: np, altPfad: x.pfad, quelle: quelle || 'app' });
    }
    return metaId(m.id);
  }
  function kinder(pfad){
    const p = pfadKlein(pfad);
    return Array.from(dMeta.values()).filter(m=>{ const k = pfadKlein(m.pfad); const i = k.lastIndexOf('/'); return (i < 0 ? '' : k.slice(0, i)) === p; });
  }
  function alleDateien(){ return Array.from(dMeta.values()); }

  // ---------- Sync-Hilfen (vom Sync-Modul genutzt) ----------
  async function syncHolen(k){ return holen('sync', k); }
  async function syncSetzen(k, v){ return v == null ? weg('sync', k) : setzen('sync', k, v); }
  async function syncAlle(){ return alle('sync'); }
  // Datei mit fester ID/Meta aus der Synchronisation einspielen
  async function dateiEinspielen(m, bytes, quelle){
    brauchtOffen();
    const alt = metaPfad(m.pfad);
    if(alt && alt.id !== m.id){   // gleicher Pfad, andere ID (auf zwei Geraeten angelegt): alte ersetzt
      dMeta.delete(alt.id); await weg('dmeta', alt.id); await weg('ddaten', alt.id);
    }
    const vorher = dMeta.get(m.id);
    if(vorher && pfadKlein(vorher.pfad) !== pfadKlein(m.pfad)) pfadIdx.delete(pfadKlein(vorher.pfad));
    if(!m.ordner) await setzen('ddaten', m.id, await Krypto.verschluesseln(key, Krypto.bytes(bytes || new Uint8Array(0))));
    await metaSpeichern(m);
    melden({ art: 'datei', id: m.id, pfad: m.pfad, quelle: quelle || 'sync' });
  }
  async function dateiEntfernenId(id, quelle){
    const m = dMeta.get(id); if(!m) return;
    dMeta.delete(id); pfadIdx.delete(pfadKlein(m.pfad));
    await weg('dmeta', id); await weg('ddaten', id);
    melden({ art: 'datei', id, pfad: m.pfad, geloescht: true, quelle: quelle || 'sync' });
  }
  // Mit dem Hauptschluessel ver-/entschluesseln (Sync, Sicherungen)
  async function ver(daten){ brauchtOffen(); return Krypto.verschluesseln(key, daten); }
  async function ent(paket){ brauchtOffen(); return Krypto.entschluesseln(key, paket); }

  // Komplettsicherung (Klartext-Objekt im Speicher; wird vom Aufrufer verschluesselt)
  async function schnappschuss(){
    brauchtOffen(); await kvWarten();
    const kv = {}; kvMem.forEach((v, k)=> kv[k] = v);
    const dateien = [];
    for(const m of dMeta.values()){
      const d = m.ordner ? null : await dateiLesen(m.id);
      dateien.push({ meta: m, daten: d ? Krypto.b64(d) : null });
    }
    return { format: 'rechnungsapp-sicherung', v: 1, erstellt: new Date().toISOString(), geraet: geraet && geraet.id, kv, dateien };
  }
  // modus 'ersetzen': alles vorher loeschen; 'ergaenzen': nur fehlende/neuere
  async function wiederherstellen(s, modus, fortschritt){
    brauchtOffen();
    if(!s || s.format !== 'rechnungsapp-sicherung') throw new Error('Das ist keine Sicherung dieser App.');
    if(modus === 'ersetzen'){
      for(const k of Array.from(kvMem.keys())) kvLoeschen(k, 'sicherung');
      for(const m of Array.from(dMeta.values())) await dateiEntfernenId(m.id, 'sicherung');
    }
    for(const [k, v] of Object.entries(s.kv || {})){ if(modus === 'ersetzen' || !kvMem.has(k)) kvSetzenText(k, v, 'sicherung'); }
    const alle = s.dateien || []; let nr = 0;
    for(const x of alle){
      if(fortschritt){ try{ fortschritt(++nr, alle.length); }catch(_){} }
      const vorh = metaPfad(x.meta.pfad);
      if(modus !== 'ersetzen' && vorh && vorh.geaendert >= x.meta.geaendert) continue;
      await dateiEinspielen(x.meta, x.daten ? Krypto.ausB64(x.daten) : null, 'sicherung');
    }
    await kvWarten();
  }
  async function speicherDauerhaft(){
    if(DEMO) return false;
    try{
      if(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()) return true;
      if(navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    }catch(_){}
    return false;
  }
  async function speicherPlatz(){
    try{ if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); return { belegt: e.usage || 0, frei: Math.max(0, (e.quota || 0) - (e.usage || 0)), gesamt: e.quota || 0 }; } }catch(_){}
    return null;
  }

  // JSON laden und dabei den Fortschritt melden (0..1); bei gepackter Uebertragung ist die Gesamtgroesse geschaetzt
  async function jsonMitFortschritt(url, fortschritt, schaetzung){
    const r = await fetch(url, { cache: 'no-cache' });
    if(!r.ok) throw new Error('Nicht gefunden (HTTP ' + r.status + ')');
    if(!r.body || !r.body.getReader || !fortschritt) return r.json();
    const laenge = Number(r.headers.get('content-length')) || 0, gepackt = !!r.headers.get('content-encoding');
    const gesamt = laenge && !gepackt ? laenge : (schaetzung || 6e6);
    const leser = r.body.getReader(), teile = []; let n = 0;
    for(;;){
      const { done, value } = await leser.read(); if(done) break;
      teile.push(value); n += value.length;
      try{ fortschritt(Math.min(0.97, n / gesamt)); }catch(_){}
    }
    const alles = new Uint8Array(n); let o = 0; for(const t of teile){ alles.set(t, o); o += t.length; }
    try{ fortschritt(1); }catch(_){}
    return JSON.parse(new TextDecoder().decode(alles));
  }

  global.Tresor = {
    jsonMitFortschritt,
    pruefen, einrichten, einrichtenMitInfo, demoOeffnen, entsperren, sperren, allesLoeschen, geraetMerken, istGemerkt, passwortAendern, codeErneuern, pruefePasswort, passwortFehlt, passwortRegelFehler, PASSWORT_REGEL,
    passkeyUnterstuetzt, passkeys, passkeyEinrichten, passkeyEntsperren, passkeyEntfernen,
    status: ()=> status, offen, schluesselInfo: ()=> info, geraetId: ()=> geraet && geraet.id,
    kvText, kvSetzenText, kvLoeschen, kvSchluessel: ()=> Array.from(kvMem.keys()), kvWarten,
    pfadNorm, pfadKlein, metaPfad, metaId, ordnerAnlegen, dateiSchreiben, dateiLesen, dateiLoeschen, dateiUmbenennen, kinder, alleDateien,
    syncHolen, syncSetzen, syncAlle, dateiEinspielen, dateiEntfernenId, ver, ent, schnappschuss, wiederherstellen,
    speicherDauerhaft, speicherPlatz, demo: DEMO,
    // intern fuer Sync/Sicherung
    __key: async ()=>{ brauchtOffen(); return key; },
    __infoSetzen: async (neu)=>{ info = neu; await setzen('meta', 'schluessel', info); if(await istGemerkt()) {} },
    beiAenderung: (f)=>{ hoerer.push(f); return ()=>{ const i = hoerer.indexOf(f); if(i >= 0) hoerer.splice(i, 1); }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
