// =====================================================================
// LokalGraph: der Teil von Microsoft Graph (OneDrive + Excel), den die App
// benutzt -- im Geraet, auf dem verschluesselten Tresor
// =====================================================================
// Die App war fuer OneDrive gebaut (Dateien, Excel-Uebersicht, Fahrtenbuch,
// Word->PDF). In der Launch-Version liegen alle Daten verschluesselt im
// Geraet. Damit die erprobte Logik unveraendert bleibt, faengt diese Datei
// alle Aufrufe an https://graph.microsoft.com/v1.0/me/drive... ab und
// beantwortet sie lokal (gleiche Antwortform wie Microsoft).
// Die Synchronisation mit OneDrive (verschluesselt, App-Ordner) laeuft
// getrennt (lokal/sync.js) und benutzt das echte fetch.
(function(global){
  'use strict';
  const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
  const echtesFetch = global.fetch.bind(global);
  const MAPPE_TYP = 'application/vnd.rechnungsapp.mappe+json';
  const MAPPEN_ORDNER = '.mappen';
  const mappen = new Map();   // datei-id -> {m, quelleRev, dirty, timer}
  const sitzungen = new Set();

  function antwort(status, daten, typ){
    if(status === 204) return new Response(null, { status });
    if(daten instanceof Uint8Array || daten instanceof ArrayBuffer || daten instanceof Blob)
      return new Response(daten, { status, headers: { 'Content-Type': typ || 'application/octet-stream' } });
    return new Response(JSON.stringify(daten == null ? {} : daten), { status, headers: { 'Content-Type': 'application/json' } });
  }
  function fehler(status, code, text){ return antwort(status, { error: { code, message: text } }); }
  function lokalUrl(id){ return location.origin + location.pathname + '#lokaldatei=' + id; }
  function itemJson(m){
    const eltern = m.pfad.split('/').slice(0, -1).join('/');
    const pm = eltern ? Tresor.metaPfad(eltern) : null;
    const j = { id: m.id, name: m.name, size: m.groesse || 0, eTag: '"' + (m.rev || m.id) + '"', cTag: '"c' + (m.rev || m.id) + '"',
      lastModifiedDateTime: m.geaendert, createdDateTime: m.angelegt || m.geaendert, webUrl: lokalUrl(m.id),
      parentReference: { path: '/drive/root:' + (eltern ? '/' + eltern : ''), id: pm ? pm.id : 'root' } };
    if(m.ordner) j.folder = { childCount: Tresor.kinder(m.pfad).filter(x=> !x.name.startsWith('.')).length };
    else j.file = { mimeType: m.typ || 'application/octet-stream' };
    return j;
  }
  function wurzelJson(){ return { id: 'root', name: 'root', folder: { childCount: Tresor.kinder('').length }, root: {}, webUrl: lokalUrl('root') }; }

  // ---------- Mappen (Excel) ----------
  function mappePfad(id){ return MAPPEN_ORDNER + '/' + id + '.json'; }
  async function mappeHolen(meta){
    let e = mappen.get(meta.id);
    if(e && e.quelleRev === meta.rev) return e;
    if(e && e.eigen) return e;
    const gespeichert = Tresor.metaPfad(mappePfad(meta.id));
    if(gespeichert && gespeichert.quelleRev === meta.rev){
      const t = Krypto.text(await Tresor.dateiLesen(gespeichert.id));
      e = { m: Mappe.ausJson(t), quelleRev: meta.rev, eigen: !!gespeichert.eigen };
    } else {
      const bytes = await Tresor.dateiLesen(meta.id);
      e = { m: await Mappe.ausXlsx(bytes), quelleRev: meta.rev, eigen: false };
    }
    mappen.set(meta.id, e);
    return e;
  }
  // nach Aenderung: Modell speichern (gesammelt, max. alle 300 ms)
  function mappeGeaendert(meta, e){
    e.eigen = true; e.dirty = true;
    clearTimeout(e.timer);
    e.timer = setTimeout(()=> mappeSichern(meta.id).catch(err=> console.error('Mappe speichern', err)), 300);
  }
  async function mappeSichern(id){
    const e = mappen.get(id); if(!e || !e.dirty) return;
    e.dirty = false;
    const meta = Tresor.metaId(id); if(!meta) return;
    // Das Modell ist ab jetzt der Stand dieser Datei (die urspruengliche
    // .xlsx bleibt unveraendert liegen; Export/Download baut daraus eine neue)
    await Tresor.dateiSchreiben(mappePfad(id), Mappe.zuJson(e.m), MAPPE_TYP, { quelleRev: meta.rev, eigen: true, fuer: id });
  }
  async function allesSichern(){ for(const id of Array.from(mappen.keys())) await mappeSichern(id); }
  // Inhalt einer Datei: bei veraenderter Mappe als frische .xlsx
  async function inhalt(meta){
    const gespeichert = Tresor.metaPfad(mappePfad(meta.id));
    const e = mappen.get(meta.id);
    if((e && e.eigen) || (gespeichert && gespeichert.eigen && gespeichert.quelleRev === meta.rev)){
      const x = await mappeHolen(meta);
      return Mappe.alsXlsx(x.m);
    }
    return Tresor.dateiLesen(meta.id);
  }
  // Sync/Sicherung hat eine Datei ersetzt -> Zwischenspeicher verwerfen
  if(global.Tresor) Tresor.beiAenderung((ev)=>{
    if(ev.art !== 'datei' || ev.quelle === 'app') return;
    if(ev.pfad && ev.pfad.startsWith(MAPPEN_ORDNER + '/')){ const id = ev.pfad.slice(MAPPEN_ORDNER.length + 1).replace(/\.json$/, ''); mappen.delete(id); }
    else if(ev.id) mappen.delete(ev.id);
  });

  async function workbook(meta, rest, methode, koerper){
    const e = await mappeHolen(meta);
    const m = e.m;
    const geaendert = ()=> mappeGeaendert(meta, e);
    let r;
    if(/^\/createSession/.test(rest)){ const id = 's' + Math.random().toString(36).slice(2); sitzungen.add(id); return antwort(201, { id, persistChanges: true }); }
    if(/^\/closeSession/.test(rest)){ await mappeSichern(meta.id); return antwort(204); }
    if(/^\/application\/calculate/.test(rest)) return antwort(204);
    if(/^\/worksheets\/add/.test(rest)){
      const name = (koerper && koerper.name) || ('Tabelle' + (m.blaetter.length + 1));
      if(Mappe.blatt(m, name)) return fehler(400, 'ItemAlreadyExists', 'Ein Blatt mit diesem Namen gibt es schon.');
      const b = Mappe.blattNeu(m, name); geaendert();
      return antwort(201, { id: '{' + b.name + '}', name: b.name, position: b.pos, visibility: 'Visible' });
    }
    if((r = /^\/worksheets\/?(?:\?.*)?$/.exec(rest))){
      return antwort(200, { value: m.blaetter.slice().sort((a, b)=> a.pos - b.pos).map(b=> ({ id: '{' + b.name + '}', name: b.name, position: b.pos, visibility: 'Visible' })) });
    }
    r = /^\/worksheets(?:\('([^']*)'\)|\/([^/(?]+))(.*)$/.exec(rest);
    if(!r) return fehler(400, 'invalidRequest', 'Nicht unterstützt: workbook' + rest);
    const bName = decodeURIComponent(r[1] != null ? r[1] : r[2]).replace(/^\{|\}$/g, '');
    const b = Mappe.blatt(m, bName);
    if(!b) return fehler(404, 'ItemNotFound', 'Tabellenblatt „' + bName + '“ nicht gefunden.');
    let s = r[3] || '';
    const q = s.indexOf('?'); let query = ''; if(q >= 0){ query = s.slice(q + 1); s = s.slice(0, q); }
    const felder = (/\$select=([^&]*)/.exec(decodeURIComponent(query)) || [])[1];
    const feldListe = felder ? felder.split(',').map(x=> x.trim()) : null;
    if(s === '' || s === '/') return antwort(200, { id: '{' + b.name + '}', name: b.name, position: b.pos, visibility: 'Visible' });
    if(/^\/protection\/?$/.test(s)) return antwort(200, { protected: false, options: {} });
    if(/^\/protection\/(un)?protect/.test(s)) return antwort(204);
    let u;
    if((u = /^\/usedRange(\(valuesOnly=(true|false)\))?\/?$/.exec(s))){
      const g = Mappe.genutzt(b, u[2] === 'true');
      if(g.leer) return antwort(200, { address: b.name + '!A1', values: [['']], formulas: [['']], numberFormat: [['General']], rowCount: 1, columnCount: 1 });
      return antwort(200, Mappe.bereichLesen(m, b, Mappe.adresse(g.r1, g.c1, g.r2, g.c2), feldListe));
    }
    if((u = /^\/range\(address='([^']*)'\)(\/.*)?$/.exec(s))){
      const adr = decodeURIComponent(u[1]), unter = u[2] || '';
      if(unter === '' || unter === '/'){
        if(methode === 'GET'){
          const a = Mappe.bereich(adr);
          if(a.ganzeSpalten && a.ganzeZeilen) return antwort(200, Mappe.bereichLesen(m, b, Mappe.adresse(0, 0, Mappe.genutzt(b).r2, Mappe.genutzt(b).c2), feldListe));
          return antwort(200, Mappe.bereichLesen(m, b, adr, feldListe));
        }
        if(methode === 'PATCH'){ Mappe.bereichSchreiben(m, b, adr, koerper || {}); geaendert(); return antwort(200, Mappe.bereichLesen(m, b, adr, ['values'])); }
      }
      if(unter === '/insert' && methode === 'POST'){ Mappe.einfuegen(m, b, adr, (koerper && koerper.shift) || 'Down'); geaendert(); return antwort(200, { address: b.name + '!' + adr }); }
      if(unter === '/delete' && methode === 'POST'){ Mappe.loeschen(m, b, adr, (koerper && koerper.shift) || 'Up'); geaendert(); return antwort(204); }
      if(unter === '/clear' && methode === 'POST'){ const a = Mappe.bereich(adr); for(let rr = a.r1; rr <= Math.min(a.r2, Mappe.genutzt(b).r2); rr++) for(let cc = a.c1; cc <= Math.min(a.c2, Mappe.genutzt(b).c2); cc++) delete b.zellen[rr + ',' + cc]; geaendert(); return antwort(204); }
      if(unter === '/format/font'){
        if(methode === 'GET') return antwort(200, { bold: Mappe.fettLesen(b, adr), name: 'Arial', size: 11 });
        if(methode === 'PATCH'){ if(koerper && 'bold' in koerper){ Mappe.fettSetzen(b, adr, !!koerper.bold); geaendert(); } return antwort(200, { bold: Mappe.fettLesen(b, adr) }); }
      }
      if(unter === '/format'){
        const a = Mappe.bereich(adr);
        if(methode === 'GET') return antwort(200, { columnWidth: b.breiten[a.c1] || 64, rowHeight: b.hoehen[a.r1] || 15, wrapText: !!b.umbruch[a.r1] });
        if(methode === 'PATCH'){
          const k = koerper || {};
          if(k.columnWidth != null) for(let c = a.c1; c <= Math.min(a.c2, 200); c++) b.breiten[c] = k.columnWidth;
          if(k.rowHeight != null) for(let rr = a.r1; rr <= Math.min(a.r2, a.r1 + 5000); rr++) b.hoehen[rr] = k.rowHeight;
          if(k.wrapText != null) for(let rr = a.r1; rr <= Math.min(a.r2, a.r1 + 5000); rr++){ if(k.wrapText) b.umbruch[rr] = true; else delete b.umbruch[rr]; }
          geaendert(); return antwort(200, {});
        }
      }
      if(/^\/format\/(fill|borders|protection)/.test(unter)) return antwort(200, {});
    }
    return fehler(400, 'invalidRequest', 'Nicht unterstützt: workbook' + rest + ' (' + methode + ')');
  }

  // ---------- Router ----------
  async function bearbeiten(url, opt){
    if(!Tresor.offen()) return fehler(401, 'locked', 'Die App ist gesperrt.');
    const methode = String((opt && opt.method) || 'GET').toUpperCase();
    let koerper = opt && opt.body;
    let rest = url.slice(GRAPH.length);
    // Query vom Pfad trennen (nur fuer Nicht-Workbook-Teile relevant)
    let meta = null, unter = '';
    let r;
    if(rest === '' || rest.startsWith('?')) return antwort(200, { id: 'lokal', driveType: 'lokal', name: 'Dieses Gerät' });
    if((r = /^\/root:\/(.*?):(\/.*|\?.*)?$/.exec(rest)) || (r = /^\/root:\/(.*)$/.exec(rest))){
      const pfad = Tresor.pfadNorm(r[1].split('/').map(decodeURIComponent).join('/'));
      unter = r[2] || '';
      if(!pfad){
        // Wurzel ("root:/:")
        if(/^\/children/.test(unter) && methode === 'GET') return antwort(200, { value: Tresor.kinder('').filter(x=> !x.name.startsWith('.')).map(itemJson) });
        if(/^\/children/.test(unter) && methode === 'POST'){
          let k = koerper; if(typeof k === 'string'){ try{ k = JSON.parse(k); }catch(_){ k = {}; } }
          if(k && k.name){ if(Tresor.metaPfad(k.name) && k['@microsoft.graph.conflictBehavior'] === 'fail') return fehler(409, 'nameAlreadyExists', 'Gibt es schon.'); return antwort(201, itemJson(await Tresor.ordnerAnlegen(k.name))); }
        }
        return antwort(200, wurzelJson());
      }
      meta = Tresor.metaPfad(pfad);
      if(!meta){
        // anlegen per PUT .../content bzw. Ordner per POST .../children
        if(/^\/content/.test(unter) && methode === 'PUT') return dateiPut(pfad, koerper, opt);
        if(/^\/children/.test(unter) && methode === 'POST'){ await Tresor.ordnerAnlegen(pfad); meta = Tresor.metaPfad(pfad); }
        else return fehler(404, 'itemNotFound', 'Das Element „' + pfad + '“ gibt es nicht.');
      }
    } else if((r = /^\/items\/([^/?]+)(\/.*|\?.*)?$/.exec(rest))){
      if(r[1] === 'root'){ meta = null; unter = r[2] || ''; if(/^\/children/.test(unter) && methode === 'GET') return antwort(200, { value: Tresor.kinder('').filter(x=> !x.name.startsWith('.')).map(itemJson) }); return antwort(200, wurzelJson()); }
      meta = Tresor.metaId(r[1]);
      if(!meta) return fehler(404, 'itemNotFound', 'Element nicht gefunden.');
      unter = r[2] || '';
    } else if((r = /^\/root(\/children)?(\?.*)?$/.exec(rest))){
      if(r[1]) return antwort(200, { value: Tresor.kinder('').filter(x=> !x.name.startsWith('.')).map(itemJson) });
      return antwort(200, wurzelJson());
    } else return fehler(400, 'invalidRequest', 'Nicht unterstützt: ' + rest);

    if(typeof koerper === 'string' && /json/.test(((opt && opt.headers) && (opt.headers['Content-Type'] || opt.headers['content-type'])) || '') && !/^\/content/.test(unter)){
      try{ koerper = JSON.parse(koerper); }catch(_){}
    } else if(typeof koerper === 'string' && /^\/(workbook|children|copy|createLink)/.test(unter)){ try{ koerper = JSON.parse(koerper); }catch(_){} }
    else if(typeof koerper === 'string' && (unter === '' || unter.startsWith('?')) && methode === 'PATCH'){ try{ koerper = JSON.parse(koerper); }catch(_){} }

    if(/^\/workbook/.test(unter)) return workbook(meta, unter.slice('/workbook'.length), methode, koerper);
    if(/^\/content/.test(unter)){
      if(methode === 'GET'){
        if(meta.ordner) return fehler(400, 'invalidRequest', 'Ordner hat keinen Inhalt.');
        if(/format=pdf/.test(unter)){
          if(!global.DocxPdf) return fehler(500, 'generalException', 'PDF-Umwandlung nicht verfügbar.');
          try{ const pdf = await DocxPdf.umwandeln(await Tresor.dateiLesen(meta.id)); return antwort(200, pdf, 'application/pdf'); }
          catch(e){ console.error(e); return fehler(500, 'generalException', 'PDF konnte nicht erzeugt werden: ' + (e.message || e)); }
        }
        return antwort(200, await inhalt(meta), meta.typ);
      }
      if(methode === 'PUT') return dateiPut(meta.pfad, koerper, opt);
    }
    if(/^\/children/.test(unter)){
      if(methode === 'GET') return antwort(200, { value: Tresor.kinder(meta.pfad).filter(x=> !x.name.startsWith('.')).map(itemJson) });
      if(methode === 'POST'){
        const k = koerper || {};
        const ziel = meta.pfad + '/' + k.name;
        if(Tresor.metaPfad(ziel)){
          if(k['@microsoft.graph.conflictBehavior'] === 'fail') return fehler(409, 'nameAlreadyExists', 'Gibt es schon.');
        }
        const neu = await Tresor.ordnerAnlegen(ziel);
        return antwort(201, itemJson(neu));
      }
    }
    if(/^\/copy/.test(unter) && methode === 'POST'){
      const k = koerper || {};
      const zielOrdner = k.parentReference && k.parentReference.id ? Tresor.metaId(k.parentReference.id) : null;
      const ordnerPfad = zielOrdner ? zielOrdner.pfad : meta.pfad.split('/').slice(0, -1).join('/');
      const name = k.name || meta.name;
      const ziel = (ordnerPfad ? ordnerPfad + '/' : '') + name;
      const daten = await inhalt(meta);
      await Tresor.dateiSchreiben(ziel, daten, meta.typ);
      return new Response(null, { status: 202, headers: { Location: lokalUrl(Tresor.metaPfad(ziel).id) } });
    }
    if(/^\/createLink/.test(unter)) return fehler(400, 'notSupported', 'Freigabelinks gibt es lokal nicht.');
    if(unter === '' || unter.startsWith('?')){
      if(methode === 'GET') return antwort(200, itemJson(meta));
      if(methode === 'DELETE'){ await Tresor.dateiLoeschen(meta.id); mappen.delete(meta.id); const mm = Tresor.metaPfad(mappePfad(meta.id)); if(mm) await Tresor.dateiLoeschen(mm.id); return antwort(204); }
      if(methode === 'PATCH'){
        const k = koerper || {};
        let ziel = meta.pfad;
        if(k.parentReference && k.parentReference.id){ const o = Tresor.metaId(k.parentReference.id); if(o) ziel = o.pfad + '/' + meta.name; }
        if(k.name) ziel = ziel.split('/').slice(0, -1).concat([k.name]).join('/');
        if(ziel !== meta.pfad){
          if(Tresor.metaPfad(ziel) && Tresor.metaPfad(ziel).id !== meta.id) return fehler(409, 'nameAlreadyExists', 'Gibt es schon.');
          await Tresor.dateiUmbenennen(meta.id, ziel);
        }
        return antwort(200, itemJson(Tresor.metaId(meta.id)));
      }
    }
    return fehler(400, 'invalidRequest', 'Nicht unterstützt: ' + methode + ' ' + rest);
  }
  async function dateiPut(pfad, koerper, opt){
    const h = (opt && opt.headers) || {};
    let typ = h['Content-Type'] || h['content-type'] || '';
    if(koerper instanceof Blob && !typ) typ = koerper.type;
    if(!typ || typ === 'application/octet-stream') typ = typAusName(pfad);
    const vorher = Tresor.metaPfad(pfad);
    const m = await Tresor.dateiSchreiben(pfad, koerper == null ? '' : koerper, typ);
    mappen.delete(m.id);
    const mm = Tresor.metaPfad(mappePfad(m.id)); if(mm) await Tresor.dateiLoeschen(mm.id);
    return antwort(vorher ? 200 : 201, itemJson(m));
  }
  function typAusName(n){
    const e = String(n).toLowerCase().split('.').pop();
    return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docm: 'application/vnd.ms-word.document.macroEnabled.12',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', json: 'application/json',
      ini: 'text/plain', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', html: 'text/html', csv: 'text/csv' }[e] || 'application/octet-stream';
  }

  let aktiv = false;
  function einschalten(){
    if(aktiv) return; aktiv = true;
    global.fetch = function(input, opt){
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if(url.startsWith(GRAPH) && !url.startsWith(GRAPH + '/special/approot') && !url.startsWith(GRAPH + '/items/approot')){
        if(input && typeof input !== 'string' && !opt) opt = { method: input.method, headers: {}, body: undefined };
        // Koerper bei Request-Objekten wird nicht genutzt (die App uebergibt immer url + opt)
        const h = {};
        if(opt && opt.headers){ if(typeof Headers !== 'undefined' && opt.headers instanceof Headers) opt.headers.forEach((v, k)=> h[k] = v); else Object.assign(h, opt.headers); }
        return bearbeiten(url, Object.assign({}, opt, { headers: h })).catch(e=>{ console.error('LokalGraph', e); return fehler(500, 'generalException', e.message || String(e)); });
      }
      return echtesFetch(input, opt);
    };
    global.addEventListener('pagehide', ()=>{ allesSichern(); });
    document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') allesSichern(); });
  }
  // fuer den Excel-Export: Mappe einer Datei als .xlsx
  async function alsXlsx(pfad){
    const meta = Tresor.metaPfad(pfad); if(!meta) return null;
    await allesSichern();
    return inhalt(meta);
  }

  global.LokalGraph = { einschalten, echtesFetch, alsXlsx, allesSichern, lokalUrl, typAusName,
    idAusUrl: (u)=>{ const m = /#lokaldatei=([0-9a-f]+)/.exec(String(u || '')); return m ? m[1] : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
