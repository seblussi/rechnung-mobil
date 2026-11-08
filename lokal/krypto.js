// =====================================================================
// Krypto: Verschluesselung fuer Tresor, Synchronisation und Sicherungen
// =====================================================================
// - Alle Daten werden mit einem zufaelligen Hauptschluessel (AES-GCM 256)
//   verschluesselt. Dieser Hauptschluessel verlaesst das Geraet nur
//   "eingewickelt" (verschluesselt) -- einmal mit dem Passwort, einmal mit
//   dem Wiederherstellungsschluessel.
// - Passwort -> Schluessel: Argon2id (RFC 9106; Bibliothek hash-wasm, lib/),
//   64 MiB Speicher, 3 Durchlaeufe -- bremst Rate-Angriffe mit Grafikkarten.
//   Wiederherstellungsschluessel (125 Bit Zufall): Argon2id 19 MiB / 2.
//   Aeltere Tresore (PBKDF2-SHA-256, 600.000 Durchlaeufe) bleiben lesbar und
//   werden beim naechsten Entsperren auf Argon2id umgestellt.
// - Verpackung je Datensatz: [1 Byte Version][12 Byte IV][Geheimtext+Tag]
// Sonst nur Web Crypto (im Browser eingebaut).
(function(global){
  'use strict';
  const subtle = (global.crypto && global.crypto.subtle) || null;
  const VERSION = 1;
  const PW_ITER = 600000, CODE_ITER = 100000;   // nur noch fuer alte Tresore / ohne WebAssembly
  const ARGON_PW = { m: 65536, t: 3, p: 1 }, ARGON_CODE = { m: 19456, t: 2, p: 1 };
  const argonDa = ()=> !!(global.hashwasm && global.hashwasm.argon2id && global.WebAssembly);
  const enc = new TextEncoder(), dec = new TextDecoder();

  function zufall(n){ const b = new Uint8Array(n); global.crypto.getRandomValues(b); return b; }
  function b64(bytes){
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = ''; const CH = 0x8000;
    for(let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function ausB64(t){ const s = atob(t); const b = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function alsBytes(x){
    if(x instanceof Uint8Array) return x;
    if(x instanceof ArrayBuffer) return new Uint8Array(x);
    if(ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if(typeof x === 'string') return enc.encode(x);
    throw new Error('Krypto: unbekannter Datentyp');
  }

  async function ableiten(geheim, salt, iter){
    const basis = await subtle.importKey('raw', enc.encode(String(geheim).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function argon2Schluessel(geheim, salt, par){
    const roh = await global.hashwasm.argon2id({ password: enc.encode(String(geheim).normalize('NFC')), salt: alsBytes(salt),
      iterations: par.t, memorySize: par.m, parallelism: par.p, hashLength: 32, outputType: 'binary' });
    try{ return await subtle.importKey('raw', roh, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
    finally{ roh.fill(0); }
  }
  // Huelle (salt + Parameter + eingewickelter Hauptschluessel) fuer ein Geheimnis
  async function huelle(roh, geheim, istCode){
    const salt = zufall(16);
    if(argonDa()){
      const par = istCode ? ARGON_CODE : ARGON_PW;
      const k = await argon2Schluessel(geheim, salt, par);
      return { kdf: 'argon2id', m: par.m, t: par.t, p: par.p, salt: b64(salt), wrap: b64(await verschluesseln(k, roh)) };
    }
    const iter = istCode ? CODE_ITER : PW_ITER;
    const k = await ableiten(geheim, salt, iter);
    return { salt: b64(salt), iter, wrap: b64(await verschluesseln(k, roh)) };
  }
  async function huelleSchluessel(h, geheim){
    if(h.kdf === 'argon2id'){
      if(!argonDa()) throw new Error('Argon2 ist in diesem Browser nicht verfügbar.');
      return argon2Schluessel(geheim, ausB64(h.salt), { m: h.m, t: h.t, p: h.p });
    }
    return ableiten(geheim, ausB64(h.salt), h.iter);
  }
  function veraltet(info){ return argonDa() && !!info && ((info.pw && info.pw.kdf !== 'argon2id') || (info.code && info.code.kdf !== 'argon2id')); }
  async function verschluesseln(key, daten){
    const iv = zufall(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, alsBytes(daten)));
    const out = new Uint8Array(1 + 12 + ct.length);
    out[0] = VERSION; out.set(iv, 1); out.set(ct, 13);
    return out;
  }
  async function entschluesseln(key, paket){
    paket = alsBytes(paket);
    if(paket[0] !== VERSION) throw new Error('Unbekanntes Datenformat (Version ' + paket[0] + ').');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: paket.subarray(1, 13) }, key, paket.subarray(13));
    return new Uint8Array(pt);
  }
  async function jsonVer(key, obj){ return verschluesseln(key, JSON.stringify(obj)); }
  async function jsonEnt(key, paket){ return JSON.parse(dec.decode(await entschluesseln(key, paket))); }

  // Wiederherstellungsschluessel: 25 Zeichen Crockford-Base32 (ohne I, L, O, U), 5er-Gruppen
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function neuerCode(){
    const b = zufall(25); let s = '';
    for(let i = 0; i < 25; i++) s += B32[b[i] & 31];
    return s.replace(/(.{5})(?=.)/g, '$1-');
  }
  function codeNormal(c){
    return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }

  // Hauptschluessel anlegen und einwickeln
  async function hauptschluesselNeu(passwort, code){
    const roh = zufall(32);
    const info = await einwickeln(roh, passwort, code);
    const key = await subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { key, info, roh };   // roh: der Aufrufer ueberschreibt es nach Gebrauch
  }
  async function einwickeln(roh, passwort, code){
    const pw = await huelle(roh, passwort, false), cd = await huelle(roh, codeNormal(code), true);
    return {
      v: 2, alg: 'AES-GCM-256', kdf: pw.kdf === 'argon2id' ? 'Argon2id' : 'PBKDF2-SHA-256',
      pw, code: cd,
      pruef: b64(await verschluesseln(await subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt']), 'rechnungsapp'))
    };
  }
  // -> {key, roh} oder null (falsches Passwort/Code)
  async function auswickeln(info, geheim, mitCode){
    const t = mitCode ? info.code : info.pw;
    try{
      const k = await huelleSchluessel(t, mitCode ? codeNormal(geheim) : geheim);
      const roh = await entschluesseln(k, ausB64(t.wrap));
      const key = await subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt']);
      return { key, roh };
    }catch(e){ return null; }
  }
  // Passwort aendern (Code bleibt): neue Huelle fuer das Passwort
  async function passwortNeu(info, roh, neuesPasswort){
    const pw = await huelle(roh, neuesPasswort, false);
    return Object.assign({}, info, { v: 2, kdf: pw.kdf === 'argon2id' ? 'Argon2id' : info.kdf, pw });
  }
  // Huelle des Wiederherstellungsschluessels neu (gleicher Code, z. B. Umstellung auf Argon2id)
  async function codeHuelleNeu(info, roh, code){ return Object.assign({}, info, { code: await huelle(roh, codeNormal(code), true) }); }
  // Passkey (WebAuthn-Erweiterung PRF): das Geheimnis, das der Passkey nach
  // Fingerabdruck/Face ID liefert, wird per HKDF-SHA-256 zum Schluessel, der
  // den Hauptschluessel einwickelt. Das Geheimnis verlaesst den Passkey nur
  // nach erfolgreicher Pruefung des Nutzers und wird nirgends gespeichert.
  async function prfSchluessel(prfAusgabe, salt){
    const basis = await subtle.importKey('raw', alsBytes(prfAusgabe), 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: alsBytes(salt), info: enc.encode('rechnungsapp-passkey-v1') },
      basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // Geraet merken: nicht exportierbarer Schluessel (bleibt im Browser des Geraets)
  async function nichtExportierbar(roh){ return subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function sha256Hex(text){
    const h = new Uint8Array(await subtle.digest('SHA-256', alsBytes(text)));
    return Array.from(h, x=> x.toString(16).padStart(2, '0')).join('');
  }

  global.Krypto = { verfuegbar: !!subtle, zufall, b64, ausB64, verschluesseln, entschluesseln, jsonVer, jsonEnt,
    neuerCode, codeNormal, hauptschluesselNeu, einwickeln, auswickeln, passwortNeu, codeHuelleNeu, veraltet, argonDa, nichtExportierbar, sha256Hex, prfSchluessel,
    text: (b)=> dec.decode(b), bytes: alsBytes };
})(typeof window !== 'undefined' ? window : globalThis);
