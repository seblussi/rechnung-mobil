// =====================================================================
// Start der Privatversion mit Datentresor (Sicherheitsbericht P1)
// =====================================================================
// Bisher lagen die Daten verschluesselt im Browser, der Schluessel aber direkt daneben (Datenbank
// "rechnung-daten"); die App-Sperre war nur ein Sichtschutz. Jetzt oeffnet erst das Passwort, der
// Fingerabdruck / Face ID oder der Wiederherstellungsschluessel den Schluessel (lokal/tresor.js, wie in der
// Launch-Version). Die eigentliche App (Skript "hauptskript") laeuft erst danach.
//
// Zustaende beim Start:
//  - Tresor vorhanden            -> Sperrseite, nach dem Entsperren App im Tresor-Modus
//  - kein Tresor, alte Daten da  -> bisheriger Speicher (bis zum Umzug); Umzug ueber Einstellungen
//                                   (UMZUG_PFLICHT = false) bzw. beim Start (UMZUG_PFLICHT = true)
//  - weder noch (neues Geraet)   -> Passwort festlegen, dann App im Tresor-Modus
//
// Umzug (einmalig): Passwort festlegen -> alle Eintraege in den Tresor kopieren -> sperren, mit dem neuen
// Passwort wieder oeffnen und JEDEN Eintrag vergleichen -> Fotos in einem Schritt neu verschluesseln ->
// Wiederherstellungsschluessel zeigen (letzter Block wird abgefragt) -> alte Datenbank samt Schluessel loeschen.
// Fortschritt steht (ohne Inhalte) im localStorage 'privat_umzug'; ein abgebrochener Umzug wird beim
// naechsten Start sauber zurueckgerollt ('laeuft') bzw. abgeschlossen ('kopiert').
(function(global){
  'use strict';
  const UMZUG_PFLICHT = false;            // Stufe 1: freiwillig (Einstellungen). Stufe 2: true = beim naechsten Start
  const ALT_DB = 'rechnung-daten', UMZUG_KEY = 'privat_umzug';
  const FEHL_KEY = 'tresor_privat_fehlversuche';
  const APP_NAME = 'Rechnungserfassung';
  let cfg = null, gestartet = false;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c=> ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function huelle(){
    let el = document.getElementById('tresorSeite');
    if(!el){ el = document.createElement('div'); el.id = 'tresorSeite'; document.body.appendChild(el); }
    el.hidden = false; return el;
  }
  function weg(){ const el = document.getElementById('tresorSeite'); if(el) el.remove(); }
  function seite(html){ const el = huelle(); el.innerHTML = '<div class="ts-karte"><div class="ts-logo">🔒</div>' + html + '</div>'; el.scrollTop = 0; return el; }
  const $ = (id)=> document.getElementById(id);
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  function lsSet(k, v){ try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(_){} }
  function passwortStaerke(pw){ if(Tresor.passwortFehlt(pw).length) return 0; const n = [...pw].length; return n >= 25 ? 4 : n >= 20 ? 3 : 2; }
  const STAERKE = ['', 'schwach', 'ausreichend', 'gut', 'sehr gut'];
  function passwortFelder(){
    return '<label class="ts-feld"><span>Passwort</span><input type="password" id="tsPw1" autocomplete="new-password"></label>' +
      '<p class="ts-klein">' + Tresor.PASSWORT_REGEL + '</p><div class="ts-staerke" id="tsStaerke"></div>' +
      '<label class="ts-feld"><span>Passwort wiederholen</span><input type="password" id="tsPw2" autocomplete="new-password"></label>';
  }
  function passwortFelderVerdrahten(){
    const p1 = $('tsPw1');
    p1.oninput = ()=>{ const s = passwortStaerke(p1.value); $('tsStaerke').innerHTML = p1.value ? '<i style="width:' + (s * 25) + '%" class="s' + s + '"></i><span>' + (s ? STAERKE[s] : esc(Tresor.passwortRegelFehler(p1.value))) + '</span>' : ''; };
    setTimeout(()=> p1.focus(), 50);
    return ()=>{ const a = $('tsPw1').value, b = $('tsPw2').value; if(Tresor.passwortRegelFehler(a)) return { fehler: Tresor.passwortRegelFehler(a) }; if(a !== b) return { fehler: 'Die beiden Passwörter sind nicht gleich.' }; return { pw: a }; };
  }

  // ---------- alte Datenbank ----------
  function altOeffnen(){
    return new Promise((ok)=>{
      let neu = false; const r = indexedDB.open(ALT_DB);
      r.onupgradeneeded = ()=>{ neu = true; };
      r.onsuccess = ()=>{ const d = r.result; if(neu || !d.objectStoreNames.contains('meta')){ d.close(); if(neu) indexedDB.deleteDatabase(ALT_DB); return ok(null); } ok(d); };
      r.onerror = ()=> ok(null); r.onblocked = ()=> ok(null);
    });
  }
  // Gibt es Daten im bisherigen Speicher (oder noch aeltere im localStorage)?
  async function altDa(){
    const d = await altOeffnen();
    if(d){ const k = await new Promise((ok)=>{ const t = d.transaction('meta').objectStore('meta').get('schluessel'); t.onsuccess = ()=> ok(t.result); t.onerror = ()=> ok(null); }); d.close(); if(k) return true; }
    try{ for(let i = 0; i < localStorage.length; i++){ if(/^(faelle_|einstellungen$|gkv_faelle$|dienste)/.test(localStorage.key(i) || '')) return true; } }catch(_){}
    return false;
  }
  async function altLoeschen(){
    try{ Speicher.altSchliessen(); }catch(_){}
    await new Promise((ok)=>{ const r = indexedDB.deleteDatabase(ALT_DB); r.onsuccess = r.onerror = ()=> ok(); r.onblocked = ()=> setTimeout(ok, 1500); });
    lsSet('app_sperre', null);   // alte App-Sperre (PIN-Pruefwert) wird nicht mehr gebraucht
  }

  // ---------- Fotos (Datenbank rechnung_doku): alter Geraeteschluessel -> Tresor ----------
  // Alles erst im Arbeitsspeicher umschluesseln und pruefen, dann in EINER Transaktion schreiben (ganz oder gar nicht).
  async function fotosUmziehen(altKey){
    const db = await new Promise((ok, nein)=>{ const r = indexedDB.open('rechnung_doku', 1); r.onupgradeneeded = ()=> r.result.createObjectStore('fotos'); r.onsuccess = ()=> ok(r.result); r.onerror = ()=> nein(r.error); });
    try{
      const [ks, vs] = await new Promise((ok, nein)=>{ const t = db.transaction('fotos'), s = t.objectStore('fotos'), a = s.getAllKeys(), b = s.getAll(); t.oncomplete = ()=> ok([a.result, b.result]); t.onerror = ()=> nein(t.error); });
      const neu = []; let fehler = 0;
      for(let i = 0; i < ks.length; i++){
        const x = vs[i]; let roh = null;
        if(x && x.v === 2) continue;   // schon umgezogen
        try{
          if(x instanceof Blob) roh = new Uint8Array(await x.arrayBuffer());
          else if(x && x.v === 1 && x.iv && x.d){ if(!altKey) throw new Error('alter Schlüssel fehlt'); roh = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: x.iv }, altKey, x.d)); }
          else continue;
          const d = await Tresor.ver(roh);
          const zurueck = await Tresor.ent(d);   // Gegenprobe
          if(zurueck.length !== roh.length || zurueck.some((b, j)=> b !== roh[j])) throw new Error('Gegenprobe');
          neu.push([ks[i], { v: 2, d, typ: (x && x.typ) || (x && x.type) || 'image/jpeg', am: (x && x.am) || Date.now(), oben: (x && x.oben) || 0 }]);
        }catch(e){ fehler++; console.warn('Umzug: Foto', ks[i], e); }
      }
      if(fehler) throw new Error(fehler + ' Foto(s) ließen sich nicht umschlüsseln');
      if(neu.length) await new Promise((ok, nein)=>{ const t = db.transaction('fotos', 'readwrite'), s = t.objectStore('fotos'); neu.forEach(([k, v])=> s.put(v, k)); t.oncomplete = ()=> ok(); t.onerror = ()=> nein(t.error); t.onabort = ()=> nein(t.error || new Error('abgebrochen')); });
      return neu.length;
    } finally { db.close(); }
  }
  async function altSchluessel(){
    const d = await altOeffnen(); if(!d) return null;
    const k = await new Promise((ok)=>{ const t = d.transaction('meta').objectStore('meta').get('schluessel'); t.onsuccess = ()=> ok(t.result || null); t.onerror = ()=> ok(null); });
    d.close(); return k;
  }

  // ---------- App starten ----------
  function appStarten(){
    if(gestartet) return; gestartet = true;
    weg();
    global.TRESOR_MODUS = true;
    Speicher.tresorModus();
    try{ Tresor.speicherDauerhaft(); }catch(_){}
    cfg.appLos();
    autoSperreEinrichten();
  }

  // ---------- Automatisch sperren ----------
  let letzteAktivitaet = Date.now(), verstecktSeit = null;
  function autoSperreEinrichten(){
    const minuten = ()=>{ try{ const e = JSON.parse(Tresor.kvText('einstellungen') || '{}') || {}; return Number(e.sperreMinuten) || 15; }catch(_){ return 15; } };
    ['pointerdown', 'keydown', 'touchstart'].forEach(n=> document.addEventListener(n, ()=>{ letzteAktivitaet = Date.now(); }, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'hidden') verstecktSeit = Date.now();
      else { if(verstecktSeit && Date.now() - verstecktSeit > minuten() * 60000) sperrenJetzt(); verstecktSeit = null; }
    });
    setInterval(()=>{ if(Date.now() - letzteAktivitaet > Math.max(minuten(), 5) * 2 * 60000) sperrenJetzt(); }, 30000);
  }
  async function sperrenJetzt(){
    try{ for(let i = 0; i < 20; i++){ await Tresor.kvWarten(); await new Promise(r=> setTimeout(r, 0)); if(!Tresor.schreibtNoch()) break; } }
    catch(e){ console.warn('Sperren: Schreiben abwarten', e); }
    Tresor.sperren();
    location.reload();
  }

  // ---------- Wiederherstellungsschluessel ----------
  function codeZeigen(code, nachher){
    const letzter = String(code).split('-').pop();
    seite('<h1>Wiederherstellungsschlüssel</h1>' +
      '<p>Falls du dein Passwort vergisst, kommst du nur mit diesem Schlüssel wieder an deine Daten. <b>Bitte ausdrucken oder sicher notieren</b> (nicht nur auf diesem Gerät speichern).</p>' +
      '<div class="ts-code" id="tsCode">' + esc(code) + '</div>' +
      '<div class="ts-reihe"><button type="button" class="btn-sekundaer" id="tsKopieren">Kopieren</button><button type="button" class="btn-sekundaer" id="tsDrucken">Drucken</button></div>' +
      '<label class="ts-feld" style="margin-top:12px;"><span>Zur Kontrolle: die letzten fünf Zeichen des Schlüssels</span><input type="text" id="tsLetzter" autocomplete="off" spellcheck="false" maxlength="5" style="text-transform:uppercase;"></label>' +
      '<div class="ts-fehler" id="tsFehler"></div>' +
      '<button type="button" class="btn-primaer ts-voll" id="tsFertig" disabled>Weiter</button>');
    $('tsLetzter').oninput = (e)=>{ const ok = e.target.value.trim().toUpperCase() === letzter; $('tsFertig').disabled = !ok; $('tsFehler').textContent = e.target.value.length === 5 && !ok ? 'Stimmt nicht – bitte vom notierten Schlüssel abschreiben.' : ''; };
    $('tsKopieren').onclick = async ()=>{ try{ await navigator.clipboard.writeText(code); $('tsKopieren').textContent = '✓ Kopiert'; }catch(_){} };
    $('tsDrucken').onclick = ()=>{
      const w = window.open('', '_blank'); if(!w) return;
      w.document.write('<!doctype html><meta charset="utf-8"><title>Wiederherstellungsschlüssel</title><body style="font-family:Arial,sans-serif;padding:40px"><h2>' + APP_NAME + ' – Wiederherstellungsschlüssel</h2>' +
        '<p>Erstellt am ' + new Date().toLocaleDateString('de-DE') + '. Mit diesem Schlüssel lassen sich die verschlüsselten Daten auch ohne Passwort öffnen. Sicher aufbewahren.</p>' +
        '<p style="font:bold 26px monospace;letter-spacing:2px;border:2px solid #000;padding:16px;display:inline-block">' + esc(code) + '</p></body>');
      w.document.close(); w.focus(); w.print();
    };
    $('tsFertig').onclick = ()=>{ try{ navigator.clipboard && navigator.clipboard.writeText && document.hasFocus() && $('tsKopieren').textContent.startsWith('✓') && navigator.clipboard.writeText(''); }catch(_){} (nachher || appStarten)(); };
  }

  // ---------- Neues Geraet ----------
  function neuEinrichten(){
    seite('<h1>' + APP_NAME + '</h1>' +
      '<p>Alle Daten liegen verschlüsselt auf diesem Gerät. Lege ein Passwort fest – <b>ohne Passwort oder Wiederherstellungsschlüssel kommt niemand an die Daten.</b> Danach kannst du das Entsperren mit Fingerabdruck / Face ID einrichten.</p>' +
      passwortFelder() + '<div class="ts-fehler" id="tsFehler"></div>' +
      '<button type="button" class="btn-primaer ts-voll" id="tsWeiter">Weiter</button>' +
      '<button type="button" class="ts-link" id="tsDemo">Erst ausprobieren: Demo mit Beispieldaten</button>');
    const lesen = passwortFelderVerdrahten();
    $('tsDemo').onclick = ()=>{ try{ sessionStorage.setItem('demo_modus', '1'); sessionStorage.setItem('demo_frei', '1'); }catch(_){} location.reload(); };
    $('tsWeiter').onclick = async ()=>{
      const r = lesen(); if(r.fehler){ $('tsFehler').textContent = r.fehler; return; }
      const b = $('tsWeiter'); b.disabled = true; b.textContent = 'Wird eingerichtet …';
      try{ const { code } = await Tresor.einrichten(r.pw); codeZeigen(code, ()=> passkeyAnbieten(r.pw)); }
      catch(e){ $('tsFehler').textContent = 'Einrichten fehlgeschlagen: ' + (e.message || e); b.disabled = false; b.textContent = 'Weiter'; }
    };
  }

  // ---------- Umzug der vorhandenen Daten ----------
  function umzugSeite(fehler){
    seite('<h1>Passwortschutz einrichten</h1>' +
      '<p>Bisher lag der Schlüssel zu deinen Daten direkt neben den Daten im Browser. Ab jetzt öffnet <b>nur dein Passwort</b> (oder Fingerabdruck / Face ID) die Daten.</p>' +
      '<p class="ts-klein">Dabei werden alle Daten auf diesem Gerät neu verschlüsselt und anschließend vollständig nachgeprüft. Geht etwas schief, bleibt alles, wie es war. Rechnungen und Dateien im OneDrive bleiben unberührt.</p>' +
      passwortFelder() + '<div class="ts-fehler" id="tsFehler">' + esc(fehler || '') + '</div>' +
      '<button type="button" class="btn-primaer ts-voll" id="tsWeiter">Umstellen</button>' +
      (UMZUG_PFLICHT ? '' : '<button type="button" class="ts-link" id="tsSpaeter">Später</button>'));
    const lesen = passwortFelderVerdrahten();
    if($('tsSpaeter')) $('tsSpaeter').onclick = ()=>{ try{ sessionStorage.removeItem('umzug_jetzt'); }catch(_){} location.reload(); };
    $('tsWeiter').onclick = async ()=>{
      const r = lesen(); if(r.fehler){ $('tsFehler').textContent = r.fehler; return; }
      umzugAusfuehren(r.pw);
    };
  }
  async function umzugAusfuehren(pw){
    seite('<h1>Daten werden umgestellt …</h1><p id="tsStand">Bitte die App offen lassen.</p>');
    const stand = (t)=>{ const el = $('tsStand'); if(el) el.textContent = t; };
    let tresorAngelegt = false;
    try{
      lsSet(UMZUG_KEY, 'laeuft');
      stand('Bisherige Daten werden gelesen …');
      await cfg.altStart();
      const alt = Speicher.altAlles();
      const schluessel = Object.keys(alt);
      if(!schluessel.length) throw new Error('Im bisherigen Speicher wurden keine Daten gefunden.');
      // Minuten der bisherigen App-Sperre fuer die automatische Sperre uebernehmen
      try{ const as = JSON.parse(lsGet('app_sperre') || 'null'); const e = JSON.parse(alt.einstellungen || '{}') || {};
        if(as && Number(as.minuten) > 0 && !e.sperreMinuten){ e.sperreMinuten = Math.max(5, Number(as.minuten)); alt.einstellungen = JSON.stringify(e); } }catch(_){}
      stand('Neuer Schlüssel wird erzeugt …');
      const { code } = await Tresor.einrichten(pw); tresorAngelegt = true;
      stand('Daten werden verschlüsselt (' + schluessel.length + ' Einträge) …');
      schluessel.forEach((k)=> Tresor.kvSetzenText(k, alt[k]));
      for(let i = 0; i < 20; i++){ await Tresor.kvWarten(); if(!Tresor.schreibtNoch()) break; }
      // Gegenprobe mit dem neuen Passwort: sperren, oeffnen, jeden Eintrag vergleichen
      stand('Nachprüfung …');
      Tresor.sperren();
      if(!await Tresor.entsperren(pw, false)) throw new Error('Der neue Tresor ließ sich mit dem Passwort nicht öffnen.');
      const falsch = schluessel.filter((k)=> Tresor.kvText(k) !== alt[k]);
      if(falsch.length || Tresor.nichtLesbar().length) throw new Error('Nachprüfung fehlgeschlagen (' + (falsch.length || Tresor.nichtLesbar().length) + ' Einträge)');
      lsSet(UMZUG_KEY, 'kopiert');   // ab hier gilt der Tresor; ein Abbruch wird beim naechsten Start abgeschlossen
      stand('Fotos werden neu verschlüsselt …');
      const fotos = await fotosUmziehen(await altSchluessel());
      Tresor.protokoll('umzug', 'Daten aus dem bisherigen Speicher übernommen (' + schluessel.length + ' Einträge, ' + fotos + ' Fotos)');
      codeZeigen(code, async ()=>{ await umzugAbschliessen(); passkeyAnbieten(pw, true); });
    }catch(e){
      console.error('Umzug', e);
      if(lsGet(UMZUG_KEY) === 'kopiert'){
        // Daten sind sicher im Tresor; nur die Fotos fehlen noch -> beim naechsten Start erneut (alter Schluessel bleibt bis dahin)
        seite('<h1>Fast fertig</h1><div class="ts-fehler">' + esc(e.message || e) + '</div><p>Deine Daten sind umgestellt. Die Fotos werden beim nächsten Start noch einmal versucht.</p><button type="button" class="btn-primaer ts-voll" id="tsOk">Neu laden</button>');
        $('tsOk').onclick = ()=> location.reload(); return;
      }
      if(tresorAngelegt) try{ await Tresor.allesLoeschen(); }catch(_){}
      lsSet(UMZUG_KEY, null);
      seite('<h1>Umstellung abgebrochen</h1><div class="ts-fehler">' + esc(e.message || e) + '</div><p>Es wurde nichts verändert – deine Daten sind wie bisher da.</p><button type="button" class="btn-primaer ts-voll" id="tsOk">Zurück zur App</button>');
      $('tsOk').onclick = ()=>{ try{ sessionStorage.removeItem('umzug_jetzt'); }catch(_){} location.reload(); };
    }
  }
  // Fotos nachholen (falls noch alte da) und den bisherigen Speicher samt Schluessel loeschen
  async function umzugAbschliessen(){
    const k = await altSchluessel();
    await fotosUmziehen(k);   // wirft, falls ein Foto nicht geht -> alter Speicher bleibt, naechster Start versucht es erneut
    await altLoeschen();
    lsSet(UMZUG_KEY, null);
    try{ sessionStorage.removeItem('umzug_jetzt'); }catch(_){}
    Tresor.protokoll('umzug', 'Bisheriger Speicher samt Geräteschlüssel gelöscht');
  }

  // ---------- Fingerabdruck / Face ID anbieten ----------
  async function passkeyAnbieten(pw, nachUmzug){
    let geht = false; try{ geht = await Tresor.passkeyUnterstuetzt() && !(await Tresor.passkeys()).length; }catch(_){}
    if(!geht){ pw = null; return appStarten(); }
    seite('<h1>Fingerabdruck / Face ID</h1>' + (nachUmzug ? '<p>✓ Die Umstellung ist abgeschlossen.</p>' : '') + '<p>Damit entsperrst du die App auf diesem Gerät künftig ohne Passwort. Passwort und Wiederherstellungsschlüssel bleiben gültig.</p>' +
      '<div class="ts-fehler" id="tsFehler"></div><button type="button" class="btn-primaer ts-voll" id="tsPkJetzt">Jetzt einrichten</button>' +
      '<button type="button" class="ts-link" id="tsPkSpaeter">Später</button>' +
      '<p class="ts-klein" style="margin-top:18px;">Später geht es unter Einstellungen › Sicherheit.</p>');
    const weiter = ()=>{ pw = null; appStarten(); };
    $('tsPkSpaeter').onclick = weiter;
    $('tsPkJetzt').onclick = async ()=>{
      const b = $('tsPkJetzt'), f = $('tsFehler'); b.disabled = true; f.textContent = '';
      const name = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android-Handy' : 'Dieses Gerät';
      let r; try{ r = await Tresor.passkeyEinrichten(pw, name); }catch(e){ r = { fehler: (e && e.message) || String(e) }; }
      if(r && r.ok) return weiter();
      b.disabled = false;
      const t = { abbruch: 'Abgebrochen. Du kannst es noch einmal versuchen oder „Später“ klicken.', kein_prf: 'Dieses Gerät bzw. dieser Passwort-Manager unterstützt das Entsperren per Passkey noch nicht. Bitte System und Browser aktualisieren.', vorhanden: 'Auf diesem Gerät ist bereits ein Passkey eingerichtet.' }[r && r.fehler];
      f.textContent = t || ('Einrichten fehlgeschlagen: ' + ((r && r.fehler) || 'unbekannter Fehler'));
    };
  }

  // ---------- Sperrseite ----------
  // Fehlversuche: ab dem 5. steigende Wartezeit (30 s … 15 min), 24 h ohne Fehlversuch setzt zurueck
  function fehlLesen(){ try{ const e = JSON.parse(lsGet(FEHL_KEY) || '{}') || {}; return Date.now() - (Number(e.zuletzt) || 0) > 24 * 3600000 ? {} : e; }catch(_){ return {}; } }
  function fehlSetzen(o){ lsSet(FEHL_KEY, o && o.fehl ? JSON.stringify(o) : null); }
  function warteRest(){ return Math.max(0, (Number(fehlLesen().warteBis) || 0) - Date.now()); }
  function fehlZaehlen(){ const e = fehlLesen(); e.fehl = (Number(e.fehl) || 0) + 1; e.zuletzt = Date.now(); if(e.fehl >= 5) e.warteBis = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, e.fehl - 5)); fehlSetzen(e); return e; }
  function wartezeitText(ms){ const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min' : s + ' s'; }
  async function sperre(fehler){
    let pk = [], pkGeht = false;
    try{ pkGeht = await Tresor.passkeyUnterstuetzt(); if(pkGeht) pk = await Tresor.passkeys(); }catch(_){}
    const pkAngebot = pkGeht && !pk.length;
    seite('<h1>' + APP_NAME + '</h1><p>Die App ist gesperrt.</p>' +
      (pk.length ? '<button type="button" class="btn-primaer ts-voll" id="tsPasskey">🔓 Mit Fingerabdruck / Face ID entsperren</button><div class="ts-oder">oder mit Passwort</div>' : '') +
      '<form id="tsForm" autocomplete="on"><input type="text" name="username" value="' + APP_NAME + ' (privat)" autocomplete="username" hidden>' +
      '<label class="ts-feld"><span>Passwort</span><input type="password" id="tsPw" autocomplete="current-password"></label>' +
      (pkAngebot ? '<label class="ts-check"><input type="checkbox" id="tsPkWunsch"> Danach Fingerabdruck / Face ID einrichten</label>' : '') +
      '<div class="ts-fehler" id="tsFehler">' + esc(fehler || '') + '</div>' +
      '<button type="submit" class="btn-primaer ts-voll" id="tsAuf">Entsperren</button></form>' +
      '<button type="button" class="ts-link" id="tsCodeWeg">Passwort vergessen? Mit Wiederherstellungsschlüssel</button>');
    let uhr = null;
    const warteAnzeigen = ()=>{
      const b = $('tsAuf'), f = $('tsFehler'); if(!b){ clearInterval(uhr); return; }
      const w = warteRest();
      if(w > 0){ b.disabled = true; f.textContent = 'Zu viele Fehlversuche – bitte ' + wartezeitText(w) + ' warten.'; }
      else { clearInterval(uhr); uhr = null; b.disabled = false; if(/^Zu viele/.test(f.textContent)) f.textContent = ''; }
    };
    const warteStarten = ()=>{ if(uhr) clearInterval(uhr); warteAnzeigen(); if(warteRest() > 0) uhr = setInterval(warteAnzeigen, 1000); };
    $('tsForm').onsubmit = async (ev)=>{
      ev.preventDefault();
      if(warteRest() > 0) return warteStarten();
      const b = $('tsAuf'); b.disabled = true; b.textContent = 'Prüfe …';
      const pw = $('tsPw').value, pkFeld = $('tsPkWunsch'), pkWunsch = !!(pkFeld && pkFeld.checked);
      let ok = false, technisch = null;
      try{ ok = await Tresor.entsperren(pw, false); }catch(err){ technisch = err || new Error('unbekannter Fehler'); }
      if(!ok && !technisch && Krypto.technischerFehler) technisch = Krypto.technischerFehler();
      if(!ok && technisch){
        console.error('Entsperren: technischer Fehler', technisch);
        b.disabled = false; b.textContent = 'Entsperren';
        $('tsFehler').textContent = 'Technischer Fehler beim Entsperren – das Passwort wurde nicht geprüft und der Versuch nicht gezählt. Bitte mit Internetverbindung neu laden und noch einmal versuchen. (' + String(technisch.message || technisch).slice(0, 120) + ')';
        return;
      }
      if(ok){
        if(Tresor.passwortRegelFehler(pw)){ fehlSetzen(null); return neuesPasswortSeite(pw, false, 'Dein Passwort erfüllt die Sicherheitsregeln nicht mehr. Bitte lege jetzt ein neues fest – erst dann geht es weiter.', pkWunsch); }
        return nachEntsperren(pkWunsch ? pw : null);
      }
      const e = fehlZaehlen();
      b.disabled = false; b.textContent = 'Entsperren';
      $('tsFehler').textContent = 'Passwort falsch' + (e.fehl >= 3 && e.fehl < 5 ? ' (' + e.fehl + '. Fehlversuch – ab dem 5. folgt eine Wartezeit)' : '') + '.';
      $('tsPw').select();
      if(warteRest() > 0) warteStarten();
    };
    if(warteRest() > 0) warteStarten();
    $('tsCodeWeg').onclick = ()=> mitCode();
    const pkKn = $('tsPasskey');
    if(pkKn){
      pkKn.onclick = async ()=>{
        pkKn.disabled = true;
        const r = await Tresor.passkeyEntsperren();
        if(r === true) return nachEntsperren(null);
        pkKn.disabled = false;
        $('tsFehler').textContent = r === 'abbruch' ? '' : String(r);
      };
    } else setTimeout(()=>{ const p = $('tsPw'); if(p) p.focus(); }, 50);
  }
  function neuesPasswortSeite(altGeheim, mitCode, hinweis, pkWunsch){
    seite('<h1>Neues Passwort</h1>' + (hinweis ? '<p>' + esc(hinweis) + '</p>' : '') + passwortFelder() + '<div class="ts-fehler" id="tsFehler"></div><button type="button" class="btn-primaer ts-voll" id="tsSetzen">Speichern</button>');
    const lesen = passwortFelderVerdrahten();
    $('tsSetzen').onclick = async ()=>{
      const r = lesen(); if(r.fehler){ $('tsFehler').textContent = r.fehler; return; }
      const b = $('tsSetzen'); b.disabled = true; b.textContent = 'Wird gespeichert …';
      if(!await Tresor.passwortAendern(altGeheim, mitCode, r.pw)){ b.disabled = false; b.textContent = 'Speichern'; $('tsFehler').textContent = 'Speichern fehlgeschlagen.'; return; }
      nachEntsperren(pkWunsch ? r.pw : null);
    };
  }
  function mitCode(){
    seite('<h1>Wiederherstellungsschlüssel</h1><p>Den Schlüssel eingeben (Bindestriche und Groß-/Kleinschreibung egal).</p>' +
      '<label class="ts-feld"><span>Schlüssel</span><input type="text" id="tsCodeIn" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>' +
      '<div class="ts-fehler" id="tsFehler"></div><button type="button" class="btn-primaer ts-voll" id="tsOk">Weiter</button><button type="button" class="ts-link" id="tsZurueck">Zurück</button>' +
      '<button type="button" class="ts-link" id="tsZuruecksetzen" style="color:#c62828;">Weder Passwort noch Schlüssel? Gerät zurücksetzen …</button>');
    $('tsZurueck').onclick = ()=> sperre();
    $('tsZuruecksetzen').onclick = zuruecksetzenSeite;
    $('tsOk').onclick = async ()=>{
      const b = $('tsOk'); b.disabled = true;
      const code = $('tsCodeIn').value;
      let passt = false, technisch = null;
      try{ passt = await Tresor.entsperren(code, true); }catch(err){ technisch = err || new Error('unbekannter Fehler'); }
      if(!passt && !technisch && Krypto.technischerFehler) technisch = Krypto.technischerFehler();
      if(!passt){ b.disabled = false; $('tsFehler').textContent = technisch ? 'Technischer Fehler – der Schlüssel wurde nicht geprüft. Bitte mit Internetverbindung neu laden und noch einmal versuchen.' : 'Der Schlüssel passt nicht.'; return; }
      neuesPasswortSeite(code, true);
    };
  }
  // Letzter Ausweg: Tresor auf diesem Geraet loeschen. Rechnungen/Dateien im OneDrive bleiben; Faelle kommen ueber den Abgleich zurueck.
  function zuruecksetzenSeite(){
    seite('<h1>Gerät zurücksetzen</h1><p>Ohne Passwort und Wiederherstellungsschlüssel lassen sich die Daten auf diesem Gerät nicht mehr öffnen – auch nicht vom Entwickler.</p>' +
      '<p>Beim Zurücksetzen werden sie <b>endgültig gelöscht</b>. Rechnungen, Übersicht und Dateien in deinem OneDrive bleiben erhalten; Fälle, die schon abgeglichen waren, holt die App nach der Neueinrichtung von dort zurück.</p>' +
      '<label class="ts-feld"><span>Zur Bestätigung LÖSCHEN eintippen</span><input type="text" id="tsBest" autocomplete="off"></label>' +
      '<button type="button" class="btn-primaer ts-voll" id="tsWeg" disabled style="background:#c62828;">Alle Daten auf diesem Gerät löschen</button><button type="button" class="ts-link" id="tsZurueck">Abbrechen</button>');
    $('tsBest').oninput = (e)=>{ $('tsWeg').disabled = e.target.value.trim().toUpperCase() !== 'LÖSCHEN'; };
    $('tsZurueck').onclick = ()=> sperre();
    $('tsWeg').onclick = async ()=>{
      $('tsWeg').disabled = true;
      try{ await Tresor.allesLoeschen(); }catch(_){}
      await new Promise((ok)=>{ const r = indexedDB.deleteDatabase('rechnung_doku'); r.onsuccess = r.onerror = ()=> ok(); r.onblocked = ()=> setTimeout(ok, 1500); });
      fehlSetzen(null); location.reload();
    };
  }
  async function nachEntsperren(pkPw){
    fehlSetzen(null);
    if(lsGet(UMZUG_KEY) === 'kopiert'){
      seite('<h1>Umstellung wird abgeschlossen …</h1>');
      try{ await umzugAbschliessen(); }catch(e){ console.warn('Umzug abschließen', e); }
    }
    if(pkPw) return passkeyAnbieten(pkPw);
    appStarten();
  }

  // ---------- Start ----------
  async function start(c){
    cfg = c;
    let st;
    try{ st = await Tresor.pruefen(); }
    catch(e){ seite('<h1>Fehler</h1><p>Der Gerätespeicher ist nicht verfügbar: ' + esc(e.message || e) + '</p><p class="ts-klein">Im privaten Modus mancher Browser gibt es keinen dauerhaften Speicher.</p>'); return; }
    if(st === 'nicht_unterstuetzt'){ seite('<h1>Browser zu alt</h1><p>Dieser Browser unterstützt die nötige Verschlüsselung nicht. Bitte einen aktuellen Browser verwenden.</p>'); return; }
    const alt = await altDa();
    if(st === 'neu'){
      if(lsGet(UMZUG_KEY) === 'kopiert'){ lsSet(UMZUG_KEY, null); }   // Tresor fehlt trotz Vermerk: wie bisher weiter
      if(!alt) return neuEinrichten();
      let jetzt = UMZUG_PFLICHT; try{ if(sessionStorage.getItem('umzug_jetzt')) jetzt = true; }catch(_){}
      if(jetzt) return umzugSeite();
      // bisheriger Speicher, bis umgestellt wird
      await cfg.altStart(); cfg.appLos(); return;
    }
    // Tresor vorhanden
    if(lsGet(UMZUG_KEY) === 'laeuft' && alt){
      // abgebrochener Umzug vor der Nachpruefung: Tresor verwerfen, bisherige Daten sind unveraendert
      try{ await Tresor.allesLoeschen(); }catch(_){}
      lsSet(UMZUG_KEY, null);
      await cfg.altStart(); cfg.appLos(); return;
    }
    return sperre();
  }

  global.TresorStart = { start, sperrenJetzt, codeZeigen,
    // Einstellungen (bisheriger Speicher): Umzug beim naechsten Laden beginnen
    umzugStarten: ()=>{ try{ sessionStorage.setItem('umzug_jetzt', '1'); }catch(_){} location.reload(); },
    UMZUG_PFLICHT };
})(typeof window !== 'undefined' ? window : globalThis);
