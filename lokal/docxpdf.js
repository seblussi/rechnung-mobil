// =====================================================================
// DocxPdf: Word-Dokument (.docx) -> PDF, im Geraet
// =====================================================================
// Frueher hat Microsoft (OneDrive) die Rechnungen von Word nach PDF
// umgewandelt. Hier passiert das in der App: Absaetze, Formatvorlagen,
// Tabellen mit Rahmen, Kopf-/Fusszeilen, Tabstopps, Falzmarken (Linien) und
// Bilder (PNG/JPEG). Schrift: Arial -> Helvetica (gleiche Laufweiten).
// Benoetigt JSZip und pdf-lib (lib/).
(function(global){
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const TW = 1 / 20, EMU = 1 / 12700;
  const ZEILE_FAKTOR = 1.15, ASC = 0.905;

  // ---------- XML-Hilfen ----------
  const kinder = (el, name)=> el ? Array.from(el.childNodes).filter(n=> n.nodeType === 1 && (!name || n.localName === name)) : [];
  const kind = (el, name)=> kinder(el, name)[0] || null;
  const pfad = (el, ...namen)=>{ for(const n of namen){ el = kind(el, n); if(!el) return null; } return el; };
  const wAttr = (el, n)=> el ? (el.getAttributeNS(W, n) || el.getAttribute('w:' + n)) : null;
  const zahlAttr = (el, n, f)=>{ const v = wAttr(el, n); return v == null || v === '' ? f : Number(v); };
  const anAus = (el)=>{ if(!el) return undefined; const v = wAttr(el, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };

  // ---------- Eigenschaften lesen ----------
  function rPrLesen(el, z){
    z = z || {};
    if(!el) return z;
    for(const k of kinder(el)){
      switch(k.localName){
        case 'b': z.b = anAus(k); break;
        case 'i': z.i = anAus(k); break;
        case 'caps': z.caps = anAus(k); break;
        case 'smallCaps': z.smallCaps = anAus(k); break;
        case 'vanish': z.vanish = anAus(k); break;
        case 'strike': z.strike = anAus(k); break;
        case 'u': { const v = wAttr(k, 'val'); z.u = !!v && v !== 'none'; break; }
        case 'sz': z.sz = zahlAttr(k, 'val', 22) / 2; break;
        case 'color': { const v = wAttr(k, 'val'); if(v && v !== 'auto') z.farbe = v; else if(v === 'auto') delete z.farbe; break; }
        case 'vertAlign': z.vert = wAttr(k, 'val'); break;
        case 'rStyle': z.rStyle = wAttr(k, 'val'); break;
        case 'highlight': break;
      }
    }
    return z;
  }
  function pPrLesen(el, z){
    z = z || {};
    if(!el) return z;
    for(const k of kinder(el)){
      switch(k.localName){
        case 'jc': z.jc = wAttr(k, 'val'); break;
        case 'ind': {
          const l = wAttr(k, 'left') ?? wAttr(k, 'start'), r = wAttr(k, 'right') ?? wAttr(k, 'end');
          if(l != null) z.indL = +l * TW; if(r != null) z.indR = +r * TW;
          if(wAttr(k, 'firstLine') != null){ z.indFirst = +wAttr(k, 'firstLine') * TW; }
          if(wAttr(k, 'hanging') != null){ z.indFirst = -(+wAttr(k, 'hanging')) * TW; }
          break;
        }
        case 'spacing': {
          if(wAttr(k, 'before') != null) z.vor = +wAttr(k, 'before') * TW;
          if(wAttr(k, 'after') != null) z.nach = +wAttr(k, 'after') * TW;
          if(wAttr(k, 'line') != null){ z.zeile = +wAttr(k, 'line'); z.zeileRegel = wAttr(k, 'lineRule') || 'auto'; }
          if(wAttr(k, 'beforeAutospacing') === '1') z.vor = 14;
          if(wAttr(k, 'afterAutospacing') === '1') z.nach = 14;
          break;
        }
        case 'tabs': {
          const t = (z.tabs || []).slice();
          for(const tab of kinder(k, 'tab')){
            const pos = zahlAttr(tab, 'pos', 0) * TW, val = wAttr(tab, 'val');
            const i = t.findIndex(x=> Math.abs(x.pos - pos) < 0.5);
            if(val === 'clear'){ if(i >= 0) t.splice(i, 1); }
            else { const e = { pos, val: val || 'left' }; if(i >= 0) t[i] = e; else t.push(e); }
          }
          z.tabs = t.sort((a, b)=> a.pos - b.pos); break;
        }
        case 'pStyle': z.pStyle = wAttr(k, 'val'); break;
        case 'contextualSpacing': z.kontext = anAus(k); break;
        case 'keepNext': z.keepNext = anAus(k); break;
        case 'pageBreakBefore': z.umbruchVor = anAus(k); break;
        case 'pBdr': z.rahmen = rahmenLesen(k); break;
        case 'shd': { const f = k.getAttributeNS(W, 'fill') || k.getAttribute('w:fill'); if(f && f !== 'auto') z.fuellung = f; break; }
      }
    }
    return z;
  }
  function rahmenLesen(el){
    const r = {};
    for(const k of kinder(el)){
      const v = wAttr(k, 'val');
      r[k.localName] = (!v || v === 'none' || v === 'nil') ? null : { breite: Math.max(0.25, zahlAttr(k, 'sz', 4) / 8), farbe: (wAttr(k, 'color') && wAttr(k, 'color') !== 'auto') ? wAttr(k, 'color') : '000000' };
    }
    return r;
  }
  function randLesen(el){ const r = {}; if(!el) return r; for(const k of kinder(el)){ const n = k.localName === 'start' ? 'left' : k.localName === 'end' ? 'right' : k.localName; r[n] = zahlAttr(k, 'w', 0) * TW; } return r; }

  // ---------- Formatvorlagen ----------
  function stileLesen(xml){
    const st = { p: {}, r: {}, t: {}, def: { p: {}, r: { sz: 11 } }, standardP: null, standardT: null };
    if(!xml) return st;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const dd = doc.getElementsByTagNameNS(W, 'docDefaults')[0];
    if(dd){ rPrLesen(pfad(dd, 'rPrDefault', 'rPr'), st.def.r); pPrLesen(pfad(dd, 'pPrDefault', 'pPr'), st.def.p); }
    for(const s of Array.from(doc.getElementsByTagNameNS(W, 'style'))){
      const typ = wAttr(s, 'type'), id = wAttr(s, 'styleId');
      const e = { basis: wAttr(kind(s, 'basedOn'), 'val'), pPr: kind(s, 'pPr'), rPr: kind(s, 'rPr'), tblPr: kind(s, 'tblPr'), tcPr: kind(s, 'tcPr'), trPr: kind(s, 'trPr'), bedingt: {} };
      for(const b of kinder(s, 'tblStylePr')) e.bedingt[wAttr(b, 'type')] = { pPr: kind(b, 'pPr'), rPr: kind(b, 'rPr'), tcPr: kind(b, 'tcPr') };
      if(typ === 'paragraph'){ st.p[id] = e; if(wAttr(s, 'default') === '1') st.standardP = id; }
      else if(typ === 'character') st.r[id] = e;
      else if(typ === 'table'){ st.t[id] = e; if(wAttr(s, 'default') === '1') st.standardT = id; }
    }
    return st;
  }
  function kette(map, id){ const out = []; let n = 0; while(id && map[id] && n++ < 20){ out.unshift(map[id]); id = map[id].basis; } return out; }

  // ---------- Dokument lesen ----------
  class Leser {
    constructor(zip, stile, rels, ablage){ this.zip = zip; this.st = stile; this.rels = rels; this.ablage = ablage; }
    tabellenStil(id){ return kette(this.st.t, id || this.st.standardT); }
    absatzEig(pPrEl, tStil){
      let p = Object.assign({}, this.st.def.p), r = Object.assign({}, this.st.def.r);
      (tStil || []).forEach(s=>{ pPrLesen(s.pPr, p); rPrLesen(s.rPr, r); });
      const sid = (pPrEl && wAttr(kind(pPrEl, 'pStyle'), 'val')) || this.st.standardP;
      kette(this.st.p, sid).forEach(s=>{ pPrLesen(s.pPr, p); rPrLesen(s.rPr, r); });
      pPrLesen(pPrEl, p);
      const markR = rPrLesen(pfad(pPrEl, 'rPr'), Object.assign({}, r));
      return { p, r, markR };
    }
    laufEig(basisR, rPrEl){
      const r = Object.assign({}, basisR);
      const rs = rPrEl && wAttr(kind(rPrEl, 'rStyle'), 'val');
      if(rs) kette(this.st.r, rs).forEach(s=> rPrLesen(s.rPr, r));
      return rPrLesen(rPrEl, r);
    }
    bloecke(el, tStil){
      const out = [];
      for(const k of kinder(el)){
        if(k.localName === 'p') out.push(this.absatz(k, tStil));
        else if(k.localName === 'tbl') out.push(this.tabelle(k));
        else if(k.localName === 'sdt'){ const c = kind(k, 'sdtContent'); if(c) out.push(...this.bloecke(c, tStil)); }
        else if(k.localName === 'customXml' || k.localName === 'ins' || k.localName === 'smartTag') out.push(...this.bloecke(k, tStil));
      }
      return out;
    }
    absatz(el, tStil){
      const pPrEl = kind(el, 'pPr');
      const e = this.absatzEig(pPrEl, tStil);
      const teile = [], anker = [];
      const feld = { tiefe: 0, zeigen: [true] };
      const lauf = (r)=>{
        const rp = this.laufEig(e.r, kind(r, 'rPr'));
        for(const k of kinder(r)){
          const n = k.localName;
          if(n === 'fldChar'){
            const t = wAttr(k, 'fldCharType');
            if(t === 'begin'){ feld.zeigen.push(false); }
            else if(t === 'separate'){ feld.zeigen[feld.zeigen.length - 1] = true; }
            else if(t === 'end'){ if(feld.zeigen.length > 1) feld.zeigen.pop(); }
            continue;
          }
          if(!feld.zeigen[feld.zeigen.length - 1]) continue;
          if(n === 't'){ if(!rp.vanish) teile.push({ text: k.textContent, r: rp }); }
          else if(n === 'tab') teile.push({ tab: true, r: rp });
          else if(n === 'br' || n === 'cr'){ const t = wAttr(k, 'type'); teile.push({ br: true, seite: t === 'page', r: rp }); }
          else if(n === 'noBreakHyphen') teile.push({ text: '-', r: rp });
          else if(n === 'softHyphen') continue;
          else if(n === 'sym') teile.push({ text: String.fromCharCode(parseInt(wAttr(k, 'char') || '3F', 16) & 0xff), r: rp });
          else if(n === 'drawing') this.zeichnung(k, teile, anker, rp);
          else if(n === 'AlternateContent'){ const c = kind(k, 'Choice'); if(c) for(const d of kinder(c, 'drawing')) this.zeichnung(d, teile, anker, rp); }
          else if(n === 'pict' || n === 'object') this.vml(k, anker);
        }
      };
      const durch = (c)=>{
        for(const k of kinder(c)){
          const n = k.localName;
          if(n === 'r') lauf(k);
          else if(n === 'hyperlink' || n === 'smartTag' || n === 'ins' || n === 'customXml' || n === 'fldSimple' || n === 'bdo' || n === 'dir') durch(k);
          else if(n === 'sdt'){ const sc = kind(k, 'sdtContent'); if(sc) durch(sc); }
          else if(n === 'AlternateContent'){ const ch = kind(k, 'Choice'); if(ch) durch(ch); }
        }
      };
      durch(el);
      return { typ: 'p', p: e.p, markR: e.markR, teile, anker };
    }
    zeichnung(d, teile, anker, rp){
      const inl = kind(d, 'inline'), anc = kind(d, 'anchor'), el = inl || anc;
      if(!el) return;
      const ext = kind(el, 'extent');
      const breite = +(ext && ext.getAttribute('cx') || 0) * EMU, hoehe = +(ext && ext.getAttribute('cy') || 0) * EMU;
      const g = el.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'graphicData')[0];
      let art = null;
      const blip = g && g.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
      if(blip){
        const rid = blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttribute('r:embed');
        art = { bild: this.rels[rid] || null };
      } else {
        const geom = g && g.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'prstGeom')[0];
        const prst = geom && geom.getAttribute('prst');
        if(prst === 'line' || prst === 'straightConnector1'){
          const ln = g.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'ln')[0];
          const w = ln && ln.getAttribute('w') ? +ln.getAttribute('w') * EMU : 0.75;
          const xfrm = g.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'xfrm')[0];
          art = { linie: true, breiteLinie: w, farbe: linienFarbe(ln), flipH: xfrm && xfrm.getAttribute('flipH') === '1', flipV: xfrm && xfrm.getAttribute('flipV') === '1' };
        } else if(prst === 'rect'){
          const ln = g.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'ln')[0];
          art = { rechteck: true, breiteLinie: ln && ln.getAttribute('w') ? +ln.getAttribute('w') * EMU : 0.75, farbe: linienFarbe(ln) };
        }
      }
      if(!art) return;
      Object.assign(art, { breite, hoehe });
      if(inl){ if(art.bild) teile.push({ bild: art, r: rp }); return; }
      const ph = kind(anc, 'positionH'), pv = kind(anc, 'positionV');
      const pos = (p)=>{ if(!p) return { von: 'page', off: 0 }; const o = kind(p, 'posOffset'), a = kind(p, 'align'); return { von: p.getAttribute('relativeFrom'), off: o ? +o.textContent * EMU : 0, align: a ? a.textContent : null }; };
      anker.push(Object.assign(art, { h: pos(ph), v: pos(pv), hinten: anc.getAttribute('behindDoc') === '1' }));
    }
    vml(el, anker){
      // nur einfache Linien (Fallback-Grafik); OLE-Objekte/Bilder in VML werden uebergangen
      for(const l of Array.from(el.getElementsByTagName('v:line'))){
        const st = l.getAttribute('style') || '';
        if(!/position:absolute/.test(st)) continue;
        const pt = (s)=>{ const m = /(-?[\d.]+)pt,(-?[\d.]+)pt/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };
        const a = pt(l.getAttribute('from')), b = pt(l.getAttribute('to'));
        if(a && b) anker.push({ linie: true, vml: true, a, b, breiteLinie: 0.75, farbe: 'BFBFBF', h: { von: /left-margin-area|page/.test(st) ? 'leftMargin' : 'page' }, v: { von: /top-margin-area/.test(st) ? 'topMargin' : 'page' } });
      }
    }
    tabelle(el){
      const tblPr = kind(el, 'tblPr');
      const sid = wAttr(kind(tblPr, 'tblStyle'), 'val');
      const tSt = this.tabellenStil(sid);
      const t = { typ: 'tbl', rand: { left: 5.4, right: 5.4, top: 0, bottom: 0 }, rahmen: {}, abstand: 0, einzug: 0, jc: 'left' };
      const pr = (x)=>{
        if(!x) return;
        const ind = kind(x, 'tblInd'); if(ind) t.einzug = zahlAttr(ind, 'w', 0) * TW;
        const cm = kind(x, 'tblCellMar'); if(cm) Object.assign(t.rand, randLesen(cm));
        const b = kind(x, 'tblBorders'); if(b) Object.assign(t.rahmen, rahmenLesen(b));
        const cs = kind(x, 'tblCellSpacing'); if(cs) t.abstand = zahlAttr(cs, 'w', 0) * TW;
        const jc = kind(x, 'jc'); if(jc) t.jc = wAttr(jc, 'val');
        const tw = kind(x, 'tblW'); if(tw){ t.breite = zahlAttr(tw, 'w', 0); t.breiteTyp = wAttr(tw, 'type'); }
      };
      tSt.forEach(s=> pr(s.tblPr));
      pr(tblPr);
      const look = kind(tblPr, 'tblLook');
      const ersteZeile = look && (wAttr(look, 'firstRow') === '1' || ((parseInt(wAttr(look, 'val') || '0', 16) & 0x20) !== 0));
      t.spalten = kinder(kind(el, 'tblGrid'), 'gridCol').map(g=> zahlAttr(g, 'w', 0) * TW);
      t.zeilen = [];
      kinder(el, 'tr').forEach((tr, zi)=>{
        const trPr = kind(tr, 'trPr');
        const hEl = kind(trPr, 'trHeight');
        const z = { zellen: [], hoehe: hEl ? zahlAttr(hEl, 'val', 0) * TW : 0, hoeheRegel: hEl ? (wAttr(hEl, 'hRule') || 'atLeast') : 'auto' };
        let sp = 0;
        const zellen = [];
        const sammle = (c)=>{ for(const k of kinder(c)){ if(k.localName === 'tc') zellen.push(k); else if(k.localName === 'sdt'){ const sc = kind(k, 'sdtContent'); if(sc) sammle(sc); } else if(k.localName === 'customXml') sammle(k); } };
        sammle(tr);
        const gb = kind(trPr, 'gridBefore'); if(gb) sp += zahlAttr(gb, 'val', 0);
        for(const tc of zellen){
          const tcPr = kind(tc, 'tcPr');
          const span = zahlAttr(kind(tcPr, 'gridSpan'), 'val', 1);
          const vm = kind(tcPr, 'vMerge');
          const zelle = { spalte: sp, span, vmerge: vm ? (wAttr(vm, 'val') === 'restart' ? 'start' : 'weiter') : null, rand: Object.assign({}, t.rand), rahmen: {}, valign: wAttr(kind(tcPr, 'vAlign'), 'val') || 'top' };
          const bedingt = (ersteZeile && zi === 0) ? tSt.map(s=> s.bedingt.firstRow).filter(Boolean) : [];
          tSt.forEach(s=>{ const b = kind(s.tcPr, 'tcBorders'); if(b) Object.assign(zelle.rahmen, rahmenLesen(b)); });
          bedingt.forEach(b=>{ const tb = kind(b.tcPr, 'tcBorders'); if(tb) Object.assign(zelle.rahmen, rahmenLesen(tb)); });
          const tb = kind(tcPr, 'tcBorders'); if(tb) Object.assign(zelle.rahmen, rahmenLesen(tb));
          const tm = kind(tcPr, 'tcMar'); if(tm) Object.assign(zelle.rand, randLesen(tm));
          const stileFuerAbsatz = tSt.concat(bedingt.map(b=> ({ pPr: b.pPr, rPr: b.rPr })));
          zelle.bloecke = this.bloecke(tc, stileFuerAbsatz);
          z.zellen.push(zelle);
          sp += span;
        }
        t.zeilen.push(z);
      });
      const n = Math.max(t.spalten.length, ...t.zeilen.map(z=> z.zellen.reduce((s, c)=> Math.max(s, c.spalte + c.span), 0)));
      while(t.spalten.length < n) t.spalten.push(60);
      return t;
    }
  }
  function linienFarbe(ln){
    if(!ln) return '000000';
    const s = ln.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'srgbClr')[0];
    if(s) return s.getAttribute('val');
    const sc = ln.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'schemeClr')[0];
    if(sc){
      const val = sc.getAttribute('val');
      const lm = sc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'lumMod')[0];
      let grau = (val === 'bg1' || val === 'lt1') ? 255 : 0;
      if(lm) grau = Math.round(grau * (+lm.getAttribute('val') / 100000));
      const h = grau.toString(16).padStart(2, '0'); return h + h + h;
    }
    return '000000';
  }

  // ---------- Schrift ----------
  // WinAnsi-faehig machen (pdf-lib-Standardschriften)
  const ERSATZ = { ' ': ' ', '‑': '-', '‐': '-', '−': '-', ' ': ' ', ' ': ' ', '​': '', '­': '', '\t': ' ', ' ': ' ', ' ': ' ' };
  const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
  function saeubern(t){
    let o = '';
    for(const ch of String(t)){
      if(ERSATZ[ch] !== undefined){ o += ERSATZ[ch]; continue; }
      const c = ch.codePointAt(0);
      if((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.has(ch)) o += ch;
      else o += '?';
    }
    return o;
  }

  // ---------- Satz ----------
  class Satz {
    constructor(pdf, fonts, bilder){ this.pdf = pdf; this.f = fonts; this.bilder = bilder; }
    font(r){ return r.b && r.i ? this.f.bi : r.b ? this.f.b : r.i ? this.f.i : this.f.n; }
    breite(text, r){ const t = r.caps ? text.toUpperCase() : text; return this.font(r).widthOfTextAtSize(t, groesse(r)); }
    // Absatz -> Zeilen (jede: {hoehe, ops[], grundlinie}); x relativ zum Absatzrahmen
    absatz(b, breite, frameLinks){
      const p = b.p;
      const indL = p.indL || 0, indR = p.indR || 0, indF = p.indFirst || 0;
      // Woerter/Leerzeichen/Tabs bilden
      const stuecke = [];
      for(const t of b.teile){
        if(t.br){ stuecke.push({ br: true, seite: t.seite, r: t.r }); continue; }
        if(t.tab){ stuecke.push({ tab: true, r: t.r }); continue; }
        if(t.bild){ stuecke.push({ bild: t.bild, w: t.bild.breite, h: t.bild.hoehe, r: t.r }); continue; }
        const text = saeubern(t.r.caps ? t.text.toUpperCase() : t.text);
        const teile = text.split(/( +)/);
        for(const s of teile){ if(s === '') continue; stuecke.push({ text: s, raum: /^ +$/.test(s), r: t.r, w: this.font(t.r).widthOfTextAtSize(s, groesse(t.r)) }); }
      }
      const zeilen = [];
      let akt = [], x = 0, erste = true;
      const verfuegbar = ()=> breite - indL - indR - (erste ? indF : 0);
      const tabsAbs = (p.tabs || []).filter(t=> t.val !== 'clear' && t.val !== 'bar');
      const naechsterTab = (xPos)=>{
        const abs = xPos + indL + (erste ? indF : 0);
        const t = tabsAbs.find(t=> t.pos > abs + 0.1);
        if(t) return { pos: t.pos - indL - (erste ? indF : 0), val: t.val };
        const std = 36; const n = Math.floor(abs / std + 1e-6) + 1;
        return { pos: n * std - indL - (erste ? indF : 0), val: 'left' };
      };
      const abschliessen = (letzte)=>{ zeilen.push({ stuecke: akt, erste, letzte, breite: x }); akt = []; x = 0; erste = false; };
      for(let i = 0; i < stuecke.length; i++){
        const s = stuecke[i];
        if(s.br){ abschliessen(true); continue; }
        if(s.tab){
          const t = naechsterTab(x);
          if(t.pos > verfuegbar() + 0.5 && akt.length){ abschliessen(false); const t2 = naechsterTab(0); akt.push({ tab: true, ziel: t2, r: s.r, x: 0 }); x = t2.val === 'left' ? t2.pos : 0; continue; }
          akt.push({ tab: true, ziel: t, r: s.r, x });
          x = t.val === 'left' || t.val === 'num' || t.val === 'start' ? t.pos : x;
          continue;
        }
        if(s.raum){ akt.push(Object.assign({}, s, { x })); x += s.w; continue; }
        // Wort (ggf. mehrere aneinanderhaengende Stuecke ohne Leerzeichen)
        if(x + s.w > verfuegbar() + 0.01 && akt.some(a=> !a.raum && !a.tab)){
          // Leerzeichen am Zeilenende entfernen
          while(akt.length && akt[akt.length - 1].raum){ x -= akt.pop().w; }
          abschliessen(false);
        }
        if(s.w > verfuegbar() && s.text && s.text.length > 1){
          // zu langes Wort hart trennen
          let rest = s.text;
          while(rest){
            let n = rest.length;
            while(n > 1 && this.breite(rest.slice(0, n), s.r) > verfuegbar() - x) n--;
            const teil = rest.slice(0, n), w = this.breite(teil, s.r);
            akt.push(Object.assign({}, s, { text: teil, w, x })); x += w; rest = rest.slice(n);
            if(rest) abschliessen(false);
          }
          continue;
        }
        akt.push(Object.assign({}, s, { x })); x += s.w;
      }
      if(akt.length || !zeilen.length) abschliessen(true);
      else if(zeilen.length) zeilen[zeilen.length - 1].letzte = true;
      // Ausrichtung, Tab-Ausrichtung, Hoehen
      const out = [];
      const markGr = groesse(b.markR);
      zeilen.forEach((z)=>{
        // Tabs rechts/zentriert: Segment hinter dem Tab verschieben
        for(let i = 0; i < z.stuecke.length; i++){
          const s = z.stuecke[i]; if(!s.tab) continue;
          if(s.ziel.val === 'right' || s.ziel.val === 'end' || s.ziel.val === 'center' || s.ziel.val === 'decimal'){
            let j = i + 1, w = 0;
            for(; j < z.stuecke.length && !z.stuecke[j].tab; j++) w += z.stuecke[j].w || 0;
            const start = s.ziel.val === 'center' ? s.ziel.pos - w / 2 : s.ziel.pos - w;
            let xx = Math.max(s.x, start);
            for(let k = i + 1; k < j; k++){ z.stuecke[k].x = xx; xx += z.stuecke[k].w || 0; }
            z.breite = Math.max(z.breite, xx);
          } else {
            let xx = s.ziel.pos;
            for(let k = i + 1; k < z.stuecke.length && !z.stuecke[k].tab; k++){ z.stuecke[k].x = xx; xx += z.stuecke[k].w || 0; }
          }
        }
        const inhalt = z.stuecke.filter(s=> !s.tab);
        const sichtbar = inhalt.filter(s=> !s.raum);
        let gr = sichtbar.length ? Math.max(...sichtbar.map(s=> s.bild ? 0 : groesse(s.r))) : markGr;
        if(!gr) gr = markGr;
        const bildH = Math.max(0, ...inhalt.filter(s=> s.bild).map(s=> s.h));
        let natur = gr * ZEILE_FAKTOR;
        let hoehe;
        const regel = p.zeileRegel || 'auto', wert = p.zeile || 240;
        if(regel === 'exact') hoehe = wert * TW;
        else if(regel === 'atLeast') hoehe = Math.max(wert * TW, natur);
        else hoehe = natur * (wert / 240);
        hoehe = Math.max(hoehe, bildH);
        const grundlinie = regel === 'exact' ? (hoehe - natur) / 2 + gr * ASC + (natur - gr * 1.117) / 2 : Math.max(bildH, gr * ASC + (natur - gr * 1.117) / 2);
        // horizontale Ausrichtung
        const links = indL + (z.erste ? indF : 0);
        const frei = breite - indR - links - (z.letzte ? trimBreite(z) : trimBreite(z));
        let versatz = 0, extraJeRaum = 0;
        const jc = p.jc || 'left';
        if(jc === 'right' || jc === 'end') versatz = frei;
        else if(jc === 'center') versatz = frei / 2;
        else if((jc === 'both' || jc === 'distribute') && !z.letzte){
          const raeume = inhalt.filter((s, i)=> s.raum && i < inhalt.length - 1 && !istLetzterRaum(inhalt, i));
          if(raeume.length && !z.stuecke.some(s=> s.tab)) extraJeRaum = frei / raeume.length;
        }
        const ops = [];
        let zusatz = 0;
        inhalt.forEach((s, i)=>{
          if(s.raum){ if(extraJeRaum && !istLetzterRaum(inhalt, i)) zusatz += extraJeRaum; return; }
          const xx = links + versatz + s.x + zusatz;
          if(s.bild){ ops.push({ bild: s.bild, x: xx, y: grundlinie - s.h, w: s.w, h: s.h }); return; }
          ops.push({ text: s.text, x: xx, y: grundlinie, r: s.r });
        });
        // Unterstreichung ueber Leerzeichen hinweg ist hier vereinfacht (je Wort)
        out.push({ hoehe, ops });
      });
      return out;
    }
    // Hoehe einer Blockliste in gegebener Breite (fuer Zellen, Kopf/Fuss)
    bloeckeSetzen(bloecke, breite){
      // -> [{hoehe, ops, vorAbstand?}] Liste von "Einheiten" (Zeilen bzw. Tabellenzeilen)
      const einheiten = [];
      let vorherNach = 0, vorherStil = null;
      bloecke.forEach((b, bi)=>{
        if(b.typ === 'p'){
          const p = b.p;
          let vor = p.vor || 0, nach = p.nach || 0;
          if(p.kontext && vorherStil === (p.pStyle || '') && bi > 0){ vor = 0; }
          const abstand = Math.max(vor, 0);
          const zeilen = this.absatz(b, breite);
          zeilen.forEach((z, i)=>{ einheiten.push({ hoehe: z.hoehe + (i === 0 ? abstand : 0), ops: z.ops.map(o=> Object.assign({}, o, { y: o.y + (i === 0 ? abstand : 0) })), anker: i === 0 ? b.anker : null, umbruchVor: i === 0 && p.umbruchVor }); });
          if(nach){
            const n = p.kontext && bloecke[bi + 1] && bloecke[bi + 1].typ === 'p' && (bloecke[bi + 1].p.pStyle || '') === (p.pStyle || '') ? 0 : nach;
            if(n) einheiten.push({ hoehe: n, ops: [] });
          }
          vorherNach = nach; vorherStil = p.pStyle || '';
        } else if(b.typ === 'tbl'){
          this.tabelleSetzen(b, breite).forEach(e=> einheiten.push(e));
          vorherNach = 0; vorherStil = null;
        }
      });
      return einheiten;
    }
    tabelleSetzen(t, breite){
      const spalten = t.spalten.slice();
      let gesamt = spalten.reduce((a, b)=> a + b, 0);
      if(t.breiteTyp === 'pct' && t.breite){ const soll = breite * t.breite / 5000; if(gesamt > soll * 1.3 || gesamt < soll * 0.7){ const f = soll / gesamt; spalten.forEach((w, i)=> spalten[i] = w * f); gesamt = soll; } }
      let x0 = t.einzug;
      if(t.jc === 'center') x0 = (breite - gesamt) / 2; else if(t.jc === 'right' || t.jc === 'end') x0 = breite - gesamt;
      const sx = [x0]; spalten.forEach((w, i)=> sx.push(sx[i] + w));
      const ab = t.abstand || 0;
      const einheiten = [];
      const zeilenN = t.zeilen.length;
      // vertikal verbundene Zellen: Hoehe am Ende zuteilen (vereinfachte Behandlung)
      t.zeilen.forEach((z, zi)=>{
        const ops = [];
        let hoehe = 0;
        const gesetzt = z.zellen.map(c=>{
          const x = sx[c.spalte] + ab, w = sx[Math.min(c.spalte + c.span, spalten.length)] - sx[c.spalte] - 2 * ab;
          const innen = w - (c.rand.left || 0) - (c.rand.right || 0);
          const inhalt = c.vmerge === 'weiter' ? [] : this.bloeckeSetzen(c.bloecke, Math.max(innen, 5));
          const h = inhalt.reduce((s, e)=> s + e.hoehe, 0) + (c.rand.top || 0) + (c.rand.bottom || 0);
          hoehe = Math.max(hoehe, h);
          return { c, x, w, inhalt, h };
        });
        if(z.hoeheRegel === 'exact') hoehe = z.hoehe; else if(z.hoehe) hoehe = Math.max(hoehe, z.hoehe);
        hoehe += 2 * ab;
        gesetzt.forEach(g=>{
          const c = g.c;
          let y = ab + (c.rand.top || 0);
          const innenH = g.inhalt.reduce((s, e)=> s + e.hoehe, 0);
          if(c.valign === 'center') y += (hoehe - 2 * ab - innenH - (c.rand.top || 0) - (c.rand.bottom || 0)) / 2;
          else if(c.valign === 'bottom') y += (hoehe - 2 * ab - innenH - (c.rand.top || 0) - (c.rand.bottom || 0));
          for(const e of g.inhalt){
            for(const o of e.ops) ops.push(Object.assign({}, o, { x: o.x + g.x + (c.rand.left || 0), y: o.y + y }));
            if(e.unterOps) for(const o of e.unterOps) ops.push(Object.assign({}, o, { x: (o.x || 0) + g.x + (c.rand.left || 0), x2: (o.x2 || 0) + g.x + (c.rand.left || 0), y: o.y + y, y2: o.y2 + y }));
            y += e.hoehe;
          }
          // Rahmen
          const rb = (seite, innen)=>{
            if(c.rahmen[seite] !== undefined) return c.rahmen[seite];
            if(seite === 'start') return rb('left'); if(seite === 'end') return rb('right');
            return t.rahmen[innen ? (seite === 'top' || seite === 'bottom' ? 'insideH' : 'insideV') : seite] || null;
          };
          const oben = rb('top', zi > 0), unten = rb('bottom', zi < zeilenN - 1);
          const links = rb('left', c.spalte > 0) || (c.rahmen.start !== undefined ? c.rahmen.start : null), rechts = rb('right', c.spalte + c.span < spalten.length) || (c.rahmen.end !== undefined ? c.rahmen.end : null);
          const x1 = g.x - ab, x2 = g.x + g.w + ab;
          if(oben && c.vmerge !== 'weiter') ops.push({ linie: true, x: x1, y: 0, x2, y2: 0, b: oben.breite, farbe: oben.farbe });
          if(unten) ops.push({ linie: true, x: x1, y: hoehe, x2, y2: hoehe, b: unten.breite, farbe: unten.farbe, unten: true });
          if(links) ops.push({ linie: true, x: x1, y: 0, x2: x1, y2: hoehe, b: links.breite, farbe: links.farbe });
          if(rechts) ops.push({ linie: true, x: x2, y: 0, x2, y2: hoehe, b: rechts.breite, farbe: rechts.farbe });
        });
        einheiten.push({ hoehe, ops, tabelle: true });
      });
      return einheiten;
    }
  }
  function trimBreite(z){
    const s = z.stuecke.filter(x=> !x.tab);
    let i = s.length - 1; while(i >= 0 && s[i].raum) i--;
    if(i < 0) return 0;
    return s[i].x + (s[i].w || 0);
  }
  function istLetzterRaum(inhalt, i){ for(let j = i + 1; j < inhalt.length; j++) if(!inhalt[j].raum) return false; return true; }
  function groesse(r){ let g = (r && r.sz) || 11; if(r && (r.vert === 'superscript' || r.vert === 'subscript')) g *= 0.65; return g; }
  function hexFarbe(h){ h = String(h || '000000').replace('#', ''); if(!/^[0-9a-f]{6}$/i.test(h)) h = '000000'; return PDFLib.rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); }

  // ---------- Hauptfunktion ----------
  async function umwandeln(daten){
    if(!global.PDFLib) throw new Error('PDF-Bibliothek fehlt.');
    const zip = await JSZip.loadAsync(daten);
    const lies = async (p)=>{ const f = zip.file(p); return f ? f.async('string') : null; };
    const docXml = await lies('word/document.xml'); if(!docXml) throw new Error('Kein Word-Dokument.');
    const stile = stileLesen(await lies('word/styles.xml'));
    const relsXml = await lies('word/_rels/document.xml.rels') || '';
    const rels = {}, relsZiel = {};
    const relDoc = new DOMParser().parseFromString(relsXml || '<Relationships/>', 'application/xml');
    for(const r of Array.from(relDoc.getElementsByTagName('Relationship'))){ relsZiel[r.getAttribute('Id')] = { ziel: r.getAttribute('Target'), typ: r.getAttribute('Type') || '', extern: r.getAttribute('TargetMode') === 'External' }; }
    const teilRels = async (teil)=>{
      const p = teil.replace(/^word\//, ''); const x = await lies('word/_rels/' + p + '.rels'); const out = {};
      if(!x) return out;
      const d = new DOMParser().parseFromString(x, 'application/xml');
      for(const r of Array.from(d.getElementsByTagName('Relationship'))) out[r.getAttribute('Id')] = r.getAttribute('Target');
      return out;
    };
    const pdf = await PDFLib.PDFDocument.create();
    const fonts = { n: await pdf.embedFont(PDFLib.StandardFonts.Helvetica), b: await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold),
      i: await pdf.embedFont(PDFLib.StandardFonts.HelveticaOblique), bi: await pdf.embedFont(PDFLib.StandardFonts.HelveticaBoldOblique) };
    const bildCache = {};
    const bildLaden = async (ziel)=>{
      if(!ziel) return null;
      const p = 'word/' + ziel.replace(/^\/?word\//, '').replace(/^\.\//, '');
      if(bildCache[p] !== undefined) return bildCache[p];
      const f = zip.file(p); if(!f){ bildCache[p] = null; return null; }
      const b = await f.async('uint8array');
      try{
        if(b[0] === 0x89 && b[1] === 0x50) bildCache[p] = await pdf.embedPng(b);
        else if(b[0] === 0xFF && b[1] === 0xD8) bildCache[p] = await pdf.embedJpg(b);
        else bildCache[p] = null;
      }catch(_){ bildCache[p] = null; }
      return bildCache[p];
    };
    const doc = new DOMParser().parseFromString(docXml, 'application/xml');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const sect = kind(body, 'sectPr') || doc.getElementsByTagNameNS(W, 'sectPr')[0];
    const pgSz = kind(sect, 'pgSz'), pgMar = kind(sect, 'pgMar');
    const seiteB = zahlAttr(pgSz, 'w', 11906) * TW, seiteH = zahlAttr(pgSz, 'h', 16838) * TW;
    const m = { oben: zahlAttr(pgMar, 'top', 1440) * TW, unten: zahlAttr(pgMar, 'bottom', 1440) * TW, links: zahlAttr(pgMar, 'left', 1440) * TW, rechts: zahlAttr(pgMar, 'right', 1440) * TW,
      kopf: zahlAttr(pgMar, 'header', 720) * TW, fuss: zahlAttr(pgMar, 'footer', 720) * TW };
    const textB = seiteB - m.links - m.rechts;
    const titelSeite = !!kind(sect, 'titlePg') && anAus(kind(sect, 'titlePg')) !== false;
    // Kopf-/Fusszeilen lesen
    const kf = { header: {}, footer: {} };
    for(const art of ['header', 'footer']){
      for(const ref of kinder(sect, art + 'Reference')){
        const typ = wAttr(ref, 'type') || 'default';
        const rid = ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ref.getAttribute('r:id');
        const z = relsZiel[rid]; if(!z) continue;
        const teil = 'word/' + z.ziel.replace(/^\/?word\//, '');
        const x = await lies(teil); if(!x) continue;
        const xd = new DOMParser().parseFromString(x, 'application/xml');
        const tr = await teilRels(teil);
        const leser = new Leser(zip, stile, tr);
        kf[art][typ] = { bloecke: leser.bloecke(xd.documentElement) };
      }
    }
    const leser = new Leser(zip, stile, Object.fromEntries(Object.entries(relsZiel).map(([k, v])=> [k, v.ziel])));
    const bloecke = leser.bloecke(body);
    const satz = new Satz(pdf, fonts);
    // Bilder vorladen (inline + Anker)
    const bilderVorladen = async (bl)=>{
      for(const b of bl){
        if(b.typ === 'p'){
          for(const t of b.teile) if(t.bild && t.bild.bild && !t.bild.pdfBild) t.bild.pdfBild = await bildLaden(t.bild.bild);
          for(const a of b.anker) if(a.bild && !a.pdfBild) a.pdfBild = await bildLaden(a.bild);
        } else if(b.typ === 'tbl') for(const z of b.zeilen) for(const c of z.zellen) await bilderVorladen(c.bloecke);
      }
    };
    await bilderVorladen(bloecke);
    for(const art of ['header', 'footer']) for(const k of Object.keys(kf[art])) await bilderVorladen(kf[art][k].bloecke);

    // Seiten
    const seiten = [];
    const neueSeite = ()=>{
      const nr = seiten.length;
      const page = pdf.addPage([seiteB, seiteH]);
      const typ = (nr === 0 && titelSeite) ? 'first' : (nr % 2 === 1 && kf.header.even && false ? 'even' : 'default');
      const kopf = kf.header[typ] || (typ === 'first' ? null : kf.header.default);
      const fuss = kf.footer[typ] || (typ === 'first' ? null : kf.footer.default);
      let kopfUnten = m.kopf, fussOben = seiteH - m.fuss;
      const zeichneOps = (ops, dx, dy)=> ops.forEach(o=> zeichnen(page, o, dx, dy, satz, seiteH));
      if(kopf){
        const e = satz.bloeckeSetzen(kopf.bloecke, textB);
        let y = m.kopf;
        e.forEach(x=>{ zeichneOps(x.ops, m.links, y); if(x.anker) ankerZeichnen(page, x.anker, { m, seiteB, seiteH, y }); y += x.hoehe; });
        kopfUnten = y;
      }
      if(fuss){
        const e = satz.bloeckeSetzen(fuss.bloecke, textB);
        const h = e.reduce((s, x)=> s + x.hoehe, 0);
        let y = seiteH - m.fuss - h;
        fussOben = y;
        e.forEach(x=>{ zeichneOps(x.ops, m.links, y); if(x.anker) ankerZeichnen(page, x.anker, { m, seiteB, seiteH, y }); y += x.hoehe; });
      }
      const s = { page, y: Math.max(m.oben, kopfUnten), unten: Math.min(seiteH - m.unten, fussOben) };
      seiten.push(s);
      return s;
    };
    let s = neueSeite();
    const einheiten = satz.bloeckeSetzen(bloecke, textB);
    for(const e of einheiten){
      if(e.umbruchVor && s.y > m.oben + 1) s = neueSeite();
      if(s.y + e.hoehe > s.unten + 0.5 && s.y > m.oben + 1 && e.ops.length) s = neueSeite();
      for(const o of e.ops) zeichnen(s.page, o, m.links, s.y, satz, seiteH);
      if(e.anker) ankerZeichnen(s.page, e.anker, { m, seiteB, seiteH, y: s.y });
      s.y += e.hoehe;
    }
    pdf.setProducer('Rechnungs-App'); pdf.setCreator('Rechnungs-App');
    return pdf.save();
  }
  function zeichnen(page, o, dx, dy, satz, seiteH){
    if(o.linie){
      const b = Math.max(0.25, o.b || 0.5);
      page.drawLine({ start: { x: dx + o.x, y: seiteH - (dy + o.y) }, end: { x: dx + o.x2, y: seiteH - (dy + o.y2) }, thickness: b, color: hexFarbe(o.farbe) });
      return;
    }
    if(o.bild){
      if(o.bild.pdfBild) page.drawImage(o.bild.pdfBild, { x: dx + o.x, y: seiteH - (dy + o.y + o.h), width: o.w, height: o.h });
      return;
    }
    if(o.text){
      const r = o.r || {};
      const gr = groesse(r);
      let y = dy + o.y; if(r.vert === 'superscript') y -= gr * 0.45; else if(r.vert === 'subscript') y += gr * 0.15;
      const font = satz.font(r);
      page.drawText(o.text, { x: dx + o.x, y: seiteH - y, size: gr, font, color: hexFarbe(r.farbe || '000000') });
      if(r.u || r.strike){
        const w = font.widthOfTextAtSize(o.text, gr);
        const yy = r.u ? y + gr * 0.12 : y - gr * 0.3;
        page.drawLine({ start: { x: dx + o.x, y: seiteH - yy }, end: { x: dx + o.x + w, y: seiteH - yy }, thickness: Math.max(0.4, gr / 18), color: hexFarbe(r.farbe || '000000') });
      }
    }
  }
  function ankerZeichnen(page, anker, k){
    const { m, seiteB, seiteH } = k;
    for(const a of anker){
      let x, y;
      if(a.vml){
        const bx = a.h.von === 'leftMargin' ? 0 : 0, by = a.v.von === 'topMargin' ? 0 : 0;
        page.drawLine({ start: { x: bx + a.a[0], y: seiteH - (by + a.a[1]) }, end: { x: bx + a.b[0], y: seiteH - (by + a.b[1]) }, thickness: a.breiteLinie, color: hexFarbe(a.farbe) });
        continue;
      }
      const hBasis = { page: 0, margin: m.links, leftMargin: 0, rightMargin: seiteB - m.rechts, column: m.links, character: m.links, insideMargin: 0, outsideMargin: seiteB - m.rechts }[a.h.von] ?? m.links;
      const vBasis = { page: 0, margin: m.oben, topMargin: 0, bottomMargin: seiteH - m.unten, paragraph: k.y, line: k.y }[a.v.von] ?? k.y;
      x = hBasis + (a.h.off || 0); y = vBasis + (a.v.off || 0);
      if(a.h.align){ const breiteBereich = a.h.von === 'page' ? seiteB : a.h.von === 'leftMargin' ? m.links : seiteB - m.links - m.rechts; x = hBasis + (a.h.align === 'center' ? (breiteBereich - a.breite) / 2 : a.h.align === 'right' ? breiteBereich - a.breite : 0); }
      if(a.v.align){ const hoeheBereich = a.v.von === 'page' ? seiteH : a.v.von === 'topMargin' ? m.oben : seiteH - m.oben - m.unten; y = vBasis + (a.v.align === 'center' ? (hoeheBereich - a.hoehe) / 2 : a.v.align === 'bottom' ? hoeheBereich - a.hoehe : 0); }
      if(a.linie){
        const x1 = a.flipH ? x + a.breite : x, x2 = a.flipH ? x : x + a.breite;
        const y1 = a.flipV ? y + a.hoehe : y, y2 = a.flipV ? y : y + a.hoehe;
        page.drawLine({ start: { x: x1, y: seiteH - y1 }, end: { x: x2, y: seiteH - y2 }, thickness: a.breiteLinie || 0.75, color: hexFarbe(a.farbe) });
      } else if(a.rechteck){
        page.drawRectangle({ x, y: seiteH - y - a.hoehe, width: a.breite, height: a.hoehe, borderWidth: a.breiteLinie || 0.75, borderColor: hexFarbe(a.farbe) });
      } else if(a.pdfBild){
        page.drawImage(a.pdfBild, { x, y: seiteH - y - a.hoehe, width: a.breite, height: a.hoehe });
      }
    }
  }

  global.DocxPdf = { umwandeln };
})(typeof window !== 'undefined' ? window : globalThis);
