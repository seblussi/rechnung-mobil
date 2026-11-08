// =====================================================================
// Mappe: Excel-Arbeitsmappen lokal (Ersatz fuer Excel in OneDrive)
// =====================================================================
// Die App spricht Rechnungsuebersicht, Fahrtenbuch und Positions-Vorlagen
// ueber die Excel-Schnittstelle von Microsoft Graph an. Diese Datei bildet
// den benutzten Teil davon im Geraet nach: Zellwerte, Formeln, Zahlenformate,
// Fett, Zeilen/Spalten einfuegen und loeschen, Spaltenbreiten. Formeln werden
// beim Lesen ausgerechnet (die in der App vorkommenden Funktionen).
// Einlesen aus .xlsx/.xlsm und Ausgabe als .xlsx (Export auf Knopfdruck).
(function(global){
  'use strict';

  // ---------- Adressen ----------
  function spNr(b){ let n = 0; for(const ch of String(b).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
  function spName(n){ let s = ''; n++; while(n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  const MAXR = 1048575, MAXC = 16383;
  // "A1", "A1:B2", "5:6", "A:C", "Blatt!A1", "$A$1"
  function bereich(adr){
    adr = String(adr || '').replace(/\$/g, '');
    const i = adr.lastIndexOf('!'); if(i >= 0) adr = adr.slice(i + 1);
    const [a, b] = adr.split(':');
    const teil = (t)=>{
      const m = /^([A-Za-z]*)(\d*)$/.exec(t.trim()); if(!m) throw new Error('Ungültige Adresse: ' + adr);
      return { c: m[1] ? spNr(m[1]) : null, r: m[2] ? +m[2] - 1 : null };
    };
    const p = teil(a), q = b != null ? teil(b) : p;
    const r1 = p.r == null ? 0 : p.r, r2 = q.r == null ? MAXR : q.r;
    const c1 = p.c == null ? 0 : p.c, c2 = q.c == null ? MAXC : q.c;
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2), ganzeZeilen: p.c == null, ganzeSpalten: p.r == null };
  }
  function adresse(r1, c1, r2, c2){ const a = spName(c1) + (r1 + 1); return (r2 === r1 && c2 === c1) ? a : a + ':' + spName(c2) + (r2 + 1); }
  const K = (r, c)=> r + ',' + c;

  // ---------- Mappe ----------
  function neu(){ return { v: 1, blaetter: [] }; }
  function blatt(m, name){
    const n = String(name).toLowerCase();
    return m.blaetter.find(b=> b.name.toLowerCase() === n) || null;
  }
  function blattNeu(m, name){
    const b = { name, pos: m.blaetter.length, zellen: {}, breiten: {}, hoehen: {}, umbruch: {} };
    m.blaetter.push(b); return b;
  }
  function zelle(b, r, c){ return b.zellen[K(r, c)] || null; }
  function zelleSetzen(b, r, c, x){
    const k = K(r, c);
    if(!x || (x.v == null && !x.f && !x.nf && !x.b && !x.u)) delete b.zellen[k];
    else b.zellen[k] = x;
  }
  function genutzt(b, nurWerte){
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for(const k in b.zellen){
      const z = b.zellen[k];
      if(nurWerte && (z.v == null || z.v === '') && !z.f) continue;
      const [r, c] = k.split(',').map(Number);
      if(r < r1) r1 = r; if(r > r2) r2 = r; if(c < c1) c1 = c; if(c > c2) c2 = c;
    }
    if(r2 < 0) return { r1: 0, c1: 0, r2: 0, c2: 0, leer: true };
    return { r1, c1, r2, c2 };
  }

  // ---------- Formeln ----------
  // Zerlegen in Tokens
  function tokens(f){
    const t = []; let i = 0;
    while(i < f.length){
      const ch = f[i];
      if(/\s/.test(ch)){ i++; continue; }
      if(ch === '"'){ let s = ''; i++; while(i < f.length){ if(f[i] === '"'){ if(f[i + 1] === '"'){ s += '"'; i += 2; continue; } i++; break; } s += f[i++]; } t.push({ t: 'str', v: s }); continue; }
      if(ch === "'"){ let s = ''; i++; while(i < f.length && f[i] !== "'"){ s += f[i++]; } i++; t.push({ t: 'blattname', v: s }); continue; }
      let m = /^(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(f.slice(i));
      if(m && !/^[A-Za-z]/.test(f.slice(i))){ t.push({ t: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      m = /^(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(])/.exec(f.slice(i));
      if(m){ t.push({ t: 'ref', v: m[1] }); i += m[1].length; continue; }
      m = /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(f.slice(i));
      if(m){ t.push({ t: 'name', v: m[1] }); i += m[1].length; continue; }
      m = /^(<>|<=|>=|[-+*/^&=<>(),;:!%])/.exec(f.slice(i));
      if(m){ t.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      throw new Error('Formel nicht lesbar: ' + f);
    }
    return t;
  }
  // Rekursiver Parser -> AST
  function parse(f){
    const t = tokens(f.replace(/^=/, '')); let p = 0;
    const peek = ()=> t[p], next = ()=> t[p++];
    const ist = (typ, v)=> t[p] && t[p].t === typ && (v === undefined || t[p].v === v);
    function ausdruck(){ return vergleich(); }
    function vergleich(){ let l = verkettung(); while(ist('op') && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)){ const o = next().v; l = { op: o, l, r: verkettung() }; } return l; }
    function verkettung(){ let l = summe(); while(ist('op', '&')){ next(); l = { op: '&', l, r: summe() }; } return l; }
    function summe(){ let l = produkt(); while(ist('op') && ['+', '-'].includes(peek().v)){ const o = next().v; l = { op: o, l, r: produkt() }; } return l; }
    function produkt(){ let l = potenz(); while(ist('op') && ['*', '/'].includes(peek().v)){ const o = next().v; l = { op: o, l, r: potenz() }; } return l; }
    function potenz(){ let l = unaer(); while(ist('op', '^')){ next(); l = { op: '^', l, r: unaer() }; } return l; }
    function unaer(){ if(ist('op', '-')){ next(); return { op: 'neg', l: unaer() }; } if(ist('op', '+')){ next(); return unaer(); } let x = basis(); if(ist('op', '%')){ next(); x = { op: '/', l: x, r: { k: 100 } }; } return x; }
    function basis(){
      const x = next(); if(!x) throw new Error('Formel unvollständig');
      if(x.t === 'num') return { k: x.v };
      if(x.t === 'str') return { k: x.v };
      if(x.t === 'blattname' || (x.t === 'name' && ist('op', '!'))){ if(ist('op', '!')) next(); const r = next(); return { ref: r.v, blatt: x.v }; }
      if(x.t === 'ref') return { ref: x.v };
      if(x.t === 'name'){
        const n = x.v.toUpperCase();
        if(n === 'TRUE' && !ist('op', '(')) return { k: true };
        if(n === 'FALSE' && !ist('op', '(')) return { k: false };
        if(!ist('op', '(')) return { fehler: '#NAME?' };
        next(); const args = [];
        if(!ist('op', ')')){ do{ if(ist('op', ',') || ist('op', ';')){ args.push({ k: null }); continue; } args.push(ausdruck()); } while((ist('op', ',') || ist('op', ';')) && next()); }
        if(!ist('op', ')')) throw new Error('Klammer fehlt'); next();
        return { fn: n, args };
      }
      if(x.t === 'op' && x.v === '('){ const e = ausdruck(); if(ist('op', ')')) next(); return e; }
      throw new Error('Unerwartet: ' + x.v);
    }
    const ast = ausdruck(); if(p < t.length) throw new Error('Formel: Rest nicht lesbar');
    return ast;
  }
  const FEHLER = /^#(NAME\?|VALUE!|DIV\/0!|REF!|N\/A|NUM!|NULL!)$/;
  function heuteSerial(){ const d = new Date(); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }
  function zahl(v){
    if(v == null || v === '') return 0; if(typeof v === 'number') return v; if(typeof v === 'boolean') return v ? 1 : 0;
    if(typeof v === 'string' && FEHLER.test(v)) throw { xl: v };
    const n = Number(String(v).replace(',', '.')); if(isFinite(n)) return n; throw { xl: '#VALUE!' };
  }
  function wahr(v){ if(typeof v === 'boolean') return v; if(typeof v === 'string'){ if(v.toUpperCase() === 'TRUE') return true; if(v.toUpperCase() === 'FALSE' || v === '') return false; throw { xl: '#VALUE!' }; } return zahl(v) !== 0; }
  function text(v){ if(v == null) return ''; if(typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if(typeof v === 'number') return String(Math.round(v * 1e10) / 1e10); return String(v); }
  function vergleichen(a, b, o){
    const leer = (x)=> x == null || x === '';
    let x = a, y = b;
    if(leer(x) && typeof y === 'number') x = 0; if(leer(y) && typeof x === 'number') y = 0;
    if(leer(x) && typeof y === 'string') x = ''; if(leer(y) && typeof x === 'string') y = '';
    if(leer(x) && leer(y)){ x = ''; y = ''; }
    let c;
    if(typeof x === 'number' && typeof y === 'number') c = x - y;
    else if(typeof x === 'string' && typeof y === 'string'){ const s = x.toLowerCase(), u = y.toLowerCase(); c = s < u ? -1 : s > u ? 1 : 0; }
    else { const rang = (v)=> typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2; c = rang(x) - rang(y); }
    return { '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[o];
  }
  // Kriterium fuer SUMIF/COUNTIF
  function kriterium(k){
    if(typeof k === 'number') return (v)=> typeof v === 'number' ? v === k : String(v) === String(k);
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(String(k == null ? '' : k));
    const o = m[1] || '=', w = m[2];
    const n = w !== '' && isFinite(Number(w)) ? Number(w) : null;
    if(n != null) return (v)=> typeof v === 'number' ? vergleichen(v, n, o) : (o === '<>' ? true : false);
    if(/[*?]/.test(w) && (o === '=' || o === '<>')){ const re = new RegExp('^' + w.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'); return (v)=> (o === '=') === re.test(text(v)); }
    return (v)=> vergleichen(v == null ? '' : v, w, o);
  }

  function auswerter(m, standardBlatt){
    const memo = new Map(), laeuft = new Set();
    function wert(b, r, c){
      const k = b.name + '!' + r + ',' + c;
      if(memo.has(k)) return memo.get(k);
      const z = zelle(b, r, c);
      if(!z) return null;
      if(!z.f){ return z.v == null ? null : z.v; }
      if(laeuft.has(k)) return '#REF!';
      laeuft.add(k);
      let v;
      try{ v = rechne(z.ast || (z.ast = parse(z.f)), b, r, c); if(Array.isArray(v)) v = v[0]; if(v && v.bereich) v = einzel(v); }
      catch(e){ v = e && e.xl ? e.xl : (z.v !== undefined && z.v !== null ? z.v : '#NAME?'); }
      laeuft.delete(k);
      if(typeof v === 'number' && !isFinite(v)) v = '#NUM!';
      memo.set(k, v);
      return v;
    }
    function einzel(x){ if(x && x.bereich){ const { b, r1, c1 } = x; return wert(b, r1, c1); } return x; }
    function werteAus(x){
      if(x && x.bereich){
        const out = []; const g = genutzt(x.b);
        for(let r = x.r1; r <= Math.min(x.r2, g.r2); r++) for(let c = x.c1; c <= Math.min(x.c2, g.c2); c++) out.push(wert(x.b, r, c));
        return out;
      }
      return [x];
    }
    function rechne(n, b){
      if('k' in n) return n.k;
      if(n.fehler) throw { xl: n.fehler };
      if(n.ref){
        const bl = n.blatt ? blatt(m, n.blatt) : b; if(!bl) throw { xl: '#REF!' };
        const a = bereich(n.ref);
        if(a.r1 === a.r2 && a.c1 === a.c2 && !/:/.test(n.ref)) return wert(bl, a.r1, a.c1);
        return { bereich: true, b: bl, r1: a.r1, r2: a.r2, c1: a.c1, c2: a.c2 };
      }
      if(n.op){
        if(n.op === 'neg') return -zahl(einzel(rechne(n.l, b)));
        const l = einzel(rechne(n.l, b)), r = einzel(rechne(n.r, b));
        if(typeof l === 'string' && FEHLER.test(l)) throw { xl: l };
        if(typeof r === 'string' && FEHLER.test(r)) throw { xl: r };
        switch(n.op){
          case '+': return zahl(l) + zahl(r);
          case '-': return zahl(l) - zahl(r);
          case '*': return zahl(l) * zahl(r);
          case '/': { const d = zahl(r); if(d === 0) throw { xl: '#DIV/0!' }; return zahl(l) / d; }
          case '^': return Math.pow(zahl(l), zahl(r));
          case '&': return text(l) + text(r);
          default: return vergleichen(l, r, n.op);
        }
      }
      if(n.fn){
        const A = n.args, e = (i)=> einzel(rechne(A[i], b)), roh = (i)=> rechne(A[i], b);
        const alleWerte = ()=> A.flatMap((x)=> werteAus(rechne(x, b)));
        const zahlen = ()=> alleWerte().filter(v=> typeof v === 'number' || typeof v === 'boolean').map(v=> typeof v === 'boolean' ? (v ? 1 : 0) : v);
        switch(n.fn){
          case 'IF': return wahr(e(0)) ? (A.length > 1 ? e(1) : true) : (A.length > 2 ? e(2) : false);
          case 'IFERROR': try{ const v = e(0); if(typeof v === 'string' && FEHLER.test(v)) return e(1); return v; }catch(x){ return e(1); }
          case 'AND': return alleWerte().filter(v=> v !== null && v !== '').every(wahr);
          case 'OR': return alleWerte().filter(v=> v !== null && v !== '').some(wahr);
          case 'NOT': return !wahr(e(0));
          case 'SUM': return zahlen().reduce((s, x)=> s + x, 0);
          case 'PRODUCT': return zahlen().reduce((s, x)=> s * x, 1);
          // Fahrtenbuch: Summe je Patient = SUMPRODUCT(Preise Zeile 3, Anzahlen der Zeile); Text/leer zaehlt als 0
          case 'SUMPRODUCT': { const fl = A.map((_, i)=> werteAus(roh(i))); const len = Math.min(...fl.map(x=> x.length)); let sum = 0;
            for(let i = 0; i < len; i++){ let p = 1; for(const x of fl){ const v = x[i]; p *= typeof v === 'number' ? v : (typeof v === 'boolean' ? (v ? 1 : 0) : 0); } sum += p; } return sum; }
          case 'MIN': { const z = zahlen(); return z.length ? Math.min(...z) : 0; }
          case 'MAX': { const z = zahlen(); return z.length ? Math.max(...z) : 0; }
          case 'AVERAGE': { const z = zahlen(); if(!z.length) throw { xl: '#DIV/0!' }; return z.reduce((s, x)=> s + x, 0) / z.length; }
          case 'COUNT': return alleWerte().filter(v=> typeof v === 'number').length;
          case 'COUNTA': return alleWerte().filter(v=> v !== null && v !== '').length;
          case 'COUNTBLANK': return alleWerte().filter(v=> v === null || v === '').length;
          case 'COUNTIF': { const k = kriterium(e(1)); return werteAus(roh(0)).filter(k).length; }
          case 'SUMIF': { const k = kriterium(e(1)), w = werteAus(roh(0)), s = A.length > 2 ? werteAus(roh(2)) : w; let sum = 0; w.forEach((v, i)=>{ if(k(v)){ const x = s[i]; if(typeof x === 'number') sum += x; } }); return sum; }
          case 'SUMIFS': case 'COUNTIFS': {
            const sum = n.fn === 'SUMIFS'; const start = sum ? 1 : 0; const s = sum ? werteAus(roh(0)) : null;
            const paare = []; for(let i = start; i + 1 < A.length; i += 2) paare.push([werteAus(roh(i)), kriterium(e(i + 1))]);
            const len = paare.length ? paare[0][0].length : 0; let erg = 0;
            for(let i = 0; i < len; i++){ if(paare.every(([w, k])=> k(w[i]))){ if(sum){ if(typeof s[i] === 'number') erg += s[i]; } else erg++; } }
            return erg;
          }
          case 'ROUND': { const f = Math.pow(10, zahl(e(1) || 0)); const x = zahl(e(0)) * f; return Math.sign(x) * Math.round(Math.abs(x) + 1e-9) / f; }
          case 'ROUNDUP': { const f = Math.pow(10, zahl(e(1) || 0)); const x = zahl(e(0)) * f; return Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9) / f; }
          case 'ROUNDDOWN': { const f = Math.pow(10, zahl(e(1) || 0)); const x = zahl(e(0)) * f; return Math.sign(x) * Math.floor(Math.abs(x) + 1e-9) / f; }
          case 'INT': return Math.floor(zahl(e(0)));
          case 'ABS': return Math.abs(zahl(e(0)));
          case 'MOD': { const d = zahl(e(1)); if(d === 0) throw { xl: '#DIV/0!' }; const x = zahl(e(0)); return x - d * Math.floor(x / d); }
          case 'TODAY': return heuteSerial();
          case 'NOW': { const d = new Date(); return heuteSerial() + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; }
          case 'DATE': return Math.round((Date.UTC(zahl(e(0)), zahl(e(1)) - 1, zahl(e(2))) - Date.UTC(1899, 11, 30)) / 86400000);
          case 'YEAR': case 'MONTH': case 'DAY': case 'WEEKDAY': {
            const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(zahl(e(0))) * 86400000);
            if(n.fn === 'YEAR') return d.getUTCFullYear(); if(n.fn === 'MONTH') return d.getUTCMonth() + 1; if(n.fn === 'DAY') return d.getUTCDate();
            return d.getUTCDay() + 1;
          }
          case 'HOUR': return Math.floor(((zahl(e(0)) % 1) * 24) + 1e-9);
          case 'MINUTE': return Math.floor(((zahl(e(0)) * 1440) % 60) + 1e-9);
          case 'ISBLANK': { const v = e(0); return v === null || v === ''; }
          case 'ISNUMBER': return typeof e(0) === 'number';
          case 'ISTEXT': return typeof e(0) === 'string';
          case 'LEN': return text(e(0)).length;
          case 'TRIM': return text(e(0)).trim().replace(/\s+/g, ' ');
          case 'UPPER': return text(e(0)).toUpperCase();
          case 'LOWER': return text(e(0)).toLowerCase();
          case 'LEFT': return text(e(0)).slice(0, A.length > 1 ? zahl(e(1)) : 1);
          case 'RIGHT': { const s = text(e(0)), n2 = A.length > 1 ? zahl(e(1)) : 1; return n2 ? s.slice(-n2) : ''; }
          case 'MID': return text(e(0)).substr(zahl(e(1)) - 1, zahl(e(2)));
          case 'CONCATENATE': case 'CONCAT': return A.map((x, i)=> text(e(i))).join('');
          case 'VALUE': return zahl(e(0));
          case 'N': { const v = e(0); return typeof v === 'number' ? v : 0; }
          case 'CHOOSE': { const i = zahl(e(0)); if(i < 1 || i >= A.length) throw { xl: '#VALUE!' }; return e(i); }
          case 'VLOOKUP': {
            const such = e(0), t2 = roh(1); if(!t2 || !t2.bereich) throw { xl: '#N/A' };
            const sp = zahl(e(2)) - 1, genau = A.length > 3 ? !wahr(e(3)) : false;
            const g = genutzt(t2.b);
            for(let r = t2.r1; r <= Math.min(t2.r2, g.r2); r++){
              const v = wert(t2.b, r, t2.c1);
              if(vergleichen(v, such, '=')) return wert(t2.b, r, t2.c1 + sp);
            }
            if(!genau){ /* naeherungsweise: letzter kleinerer */ let treffer = null; for(let r = t2.r1; r <= Math.min(t2.r2, g.r2); r++){ const v = wert(t2.b, r, t2.c1); if(v !== null && vergleichen(v, such, '<=')) treffer = r; } if(treffer != null) return wert(t2.b, treffer, t2.c1 + sp); }
            throw { xl: '#N/A' };
          }
          default: throw { xl: '#NAME?' };
        }
      }
      throw { xl: '#VALUE!' };
    }
    return { wert: (b, r, c)=> wert(b, r, c) };
  }

  // Bezuege in Formeln nach Einfuegen/Loeschen verschieben.
  // aenderung: {art:'zeilen', ab, n (neg = geloescht), c1, c2} | {art:'spalten', ab, n, r1, r2}
  function formelVerschieben(f, a){
    const ersetze = (ref)=>{
      const m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(ref); if(!m) return ref;
      let c = spNr(m[2]), r = +m[4] - 1;
      if(a.art === 'zeilen' && c >= a.c1 && c <= a.c2){
        if(a.n > 0){ if(r >= a.ab) r += a.n; }
        else { const bis = a.ab - a.n - 1; if(r > bis) r += a.n; else if(r >= a.ab) return '#REF!'; }
      }
      if(a.art === 'spalten' && r >= a.r1 && r <= a.r2){
        if(a.n > 0){ if(c >= a.ab) c += a.n; }
        else { const bis = a.ab - a.n - 1; if(c > bis) c += a.n; else if(c >= a.ab) return '#REF!'; }
      }
      return m[1] + spName(c) + m[3] + (r + 1);
    };
    let out = '', i = 0, inStr = false;
    while(i < f.length){
      const ch = f[i];
      if(ch === '"'){ inStr = !inStr; out += ch; i++; continue; }
      if(inStr){ out += ch; i++; continue; }
      const m = /^(\$?[A-Z]{1,3}\$?\d+)(:(\$?[A-Z]{1,3}\$?\d+))?/.exec(f.slice(i));
      const davor = out.slice(-1);
      if(m && !/[A-Za-z0-9_.]/.test(davor) && !/^[A-Za-z0-9_(]/.test(f.slice(i + m[0].length))){
        if(m[3]){
          // Bereich: Ende bei Loeschung des letzten Teils sinnvoll kuerzen
          let a1 = ersetze(m[1]), a2 = ersetze(m[3]);
          if(a1 === '#REF!' && a2 !== '#REF!') a1 = ersetze(m[1].replace(/\d+$/, (x)=> String(a.ab - a.n + 1)));
          if(a2 === '#REF!' && a1 !== '#REF!') a2 = ersetze(m[3].replace(/\d+$/, (x)=> String(a.ab)));
          out += a1 + ':' + a2;
        } else out += ersetze(m[1]);
        i += m[0].length; continue;
      }
      out += ch; i++;
    }
    return out;
  }
  function alleFormelnAnpassen(m, b, a){
    for(const bl of m.blaetter){
      for(const k in bl.zellen){
        const z = bl.zellen[k];
        if(!z.f) continue;
        if(bl !== b && !new RegExp("(^|[^A-Za-z])'?" + b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'?!", 'i').test(z.f)) continue;
        if(bl === b){ const n = formelVerschieben(z.f, a); if(n !== z.f){ z.f = n; delete z.ast; } }
      }
    }
  }
  // Zellen verschieben (Einfuegen/Loeschen mit Verschieben nach unten/oben bzw. rechts/links)
  function einfuegen(m, b, adr, richtung){
    const a = bereich(adr);
    const ganzeZ = a.ganzeZeilen || richtung === 'zeilen';
    if(String(richtung || 'Down').toLowerCase() === 'right'){
      const n = a.c2 - a.c1 + 1, neu2 = {};
      for(const k in b.zellen){ const [r, c] = k.split(',').map(Number); if(r >= a.r1 && r <= a.r2 && c >= a.c1) neu2[K(r, c + n)] = b.zellen[k]; else neu2[k] = b.zellen[k]; }
      b.zellen = neu2;
      alleFormelnAnpassen(m, b, { art: 'spalten', ab: a.c1, n, r1: a.r1, r2: a.r2 });
      return;
    }
    const n = a.r2 - a.r1 + 1, c1 = ganzeZ ? 0 : a.c1, c2 = ganzeZ ? MAXC : a.c2, neu2 = {};
    for(const k in b.zellen){ const [r, c] = k.split(',').map(Number); if(c >= c1 && c <= c2 && r >= a.r1) neu2[K(r + n, c)] = b.zellen[k]; else neu2[k] = b.zellen[k]; }
    b.zellen = neu2;
    if(ganzeZ){ const h = {}; for(const r in b.hoehen){ h[+r >= a.r1 ? +r + n : r] = b.hoehen[r]; } b.hoehen = h; const u = {}; for(const r in b.umbruch){ u[+r >= a.r1 ? +r + n : r] = b.umbruch[r]; } b.umbruch = u; }
    alleFormelnAnpassen(m, b, { art: 'zeilen', ab: a.r1, n, c1, c2 });
  }
  function loeschen(m, b, adr, richtung){
    const a = bereich(adr);
    if(String(richtung || 'Up').toLowerCase() === 'left'){
      const n = a.c2 - a.c1 + 1, neu2 = {};
      for(const k in b.zellen){ const [r, c] = k.split(',').map(Number); if(r >= a.r1 && r <= a.r2 && c >= a.c1){ if(c > a.c2) neu2[K(r, c - n)] = b.zellen[k]; } else neu2[k] = b.zellen[k]; }
      b.zellen = neu2;
      alleFormelnAnpassen(m, b, { art: 'spalten', ab: a.c1, n: -n, r1: a.r1, r2: a.r2 });
      return;
    }
    const ganzeZ = a.ganzeZeilen;
    const n = a.r2 - a.r1 + 1, c1 = ganzeZ ? 0 : a.c1, c2 = ganzeZ ? MAXC : a.c2, neu2 = {};
    for(const k in b.zellen){ const [r, c] = k.split(',').map(Number); if(c >= c1 && c <= c2 && r >= a.r1){ if(r > a.r2) neu2[K(r - n, c)] = b.zellen[k]; } else neu2[k] = b.zellen[k]; }
    b.zellen = neu2;
    if(ganzeZ){ const h = {}; for(const r in b.hoehen){ if(+r < a.r1) h[r] = b.hoehen[r]; else if(+r > a.r2) h[+r - n] = b.hoehen[r]; } b.hoehen = h; }
    alleFormelnAnpassen(m, b, { art: 'zeilen', ab: a.r1, n: -n, c1, c2 });
  }

  // ---------- Bereich lesen/schreiben (Graph-Form) ----------
  function bereichLesen(m, b, adr, felder){
    const a = typeof adr === 'string' ? bereich(adr) : adr;
    const g = genutzt(b);
    const r2 = a.ganzeSpalten ? Math.max(a.r1, g.r2) : a.r2, c2 = a.ganzeZeilen ? Math.max(a.c1, g.c2) : a.c2;
    const aw = auswerter(m, b);
    const out = { address: b.name + '!' + adresse(a.r1, a.c1, r2, c2), rowCount: r2 - a.r1 + 1, columnCount: c2 - a.c1 + 1 };
    const W = [], F = [], N = [];
    for(let r = a.r1; r <= r2; r++){
      const w = [], f = [], nf = [];
      for(let c = a.c1; c <= c2; c++){
        const z = zelle(b, r, c);
        let v = z ? (z.f ? aw.wert(b, r, c) : z.v) : null;
        if(v === null || v === undefined) v = '';
        w.push(v);
        f.push(z && z.f ? z.f : v);
        nf.push(z && z.nf ? z.nf : 'General');
      }
      W.push(w); F.push(f); N.push(nf);
    }
    if(!felder || felder.includes('values')) out.values = W;
    if(!felder || felder.includes('formulas')) out.formulas = F;
    if(!felder || felder.includes('numberFormat')) out.numberFormat = N;
    if(felder && felder.includes('text')) out.text = W.map(z=> z.map(v=> String(v)));
    return out;
  }
  function wertUmwandeln(x, nf){
    if(typeof x === 'string'){
      if(x.length > 1 && x[0] === '=') return { f: x };
      if(nf === '@') return { v: x };
      if(x === '') return { v: null };
      if(/^-?\d+(\.\d+)?$/.test(x.trim()) && !/^0\d/.test(x.trim())) return { v: Number(x.trim()) };
      if(/^(TRUE|FALSE)$/i.test(x)) return { v: x.toUpperCase() === 'TRUE' };
      return { v: x };
    }
    if(x == null) return { v: null };
    return { v: x };
  }
  function bereichSchreiben(m, b, adr, daten){
    const a = bereich(adr);
    const arr = (x)=> x == null ? null : Array.isArray(x) ? x : [[x]];
    const werte = arr(daten.values), formeln = arr(daten.formulas), formate = arr(daten.numberFormat);
    const zeilen = (werte || formeln || formate || []).length || 1;
    const r2 = a.ganzeSpalten ? a.r1 + zeilen - 1 : a.r2;
    for(let r = a.r1; r <= r2; r++){
      const i = r - a.r1;
      const breite = Math.max(...[werte, formeln, formate].filter(Boolean).map(x=> (x[i] || x[0] || []).length), 1);
      const c2 = a.ganzeZeilen ? a.c1 + breite - 1 : a.c2;
      for(let c = a.c1; c <= c2; c++){
        const j = c - a.c1;
        const hol = (x)=>{ if(!x) return undefined; const zeile = x.length === 1 ? x[0] : x[i]; if(!zeile) return undefined; return zeile.length === 1 ? zeile[0] : zeile[j]; };
        const z = Object.assign({}, zelle(b, r, c) || {});
        const nf = hol(formate);
        if(nf !== undefined && nf !== null) z.nf = nf === 'General' ? undefined : String(nf);
        const fx = hol(formeln), vx = hol(werte);
        const neuW = fx !== undefined ? fx : vx;
        if(neuW !== undefined){
          const u = wertUmwandeln(neuW, z.nf);
          delete z.ast;
          if(u.f){ z.f = u.f; z.v = null; } else { delete z.f; z.v = u.v; }
        }
        zelleSetzen(b, r, c, z);
      }
    }
  }
  function fettLesen(b, adr){
    const a = bereich(adr); let alle = true, keine = true;
    const g = genutzt(b), r2 = Math.min(a.r2, Math.max(g.r2, a.r1)), c2 = Math.min(a.c2, Math.max(g.c2, a.c1));
    for(let r = a.r1; r <= r2; r++) for(let c = a.c1; c <= c2; c++){ const z = zelle(b, r, c); if(z && z.b) keine = false; else alle = false; }
    return alle ? true : keine ? false : null;
  }
  function fettSetzen(b, adr, an){
    const a = bereich(adr), g = genutzt(b);
    const r2 = a.ganzeSpalten ? g.r2 : a.r2, c2 = a.ganzeZeilen ? g.c2 : a.c2;
    for(let r = a.r1; r <= r2; r++) for(let c = a.c1; c <= c2; c++){ const z = Object.assign({}, zelle(b, r, c) || {}); if(an) z.b = true; else delete z.b; zelleSetzen(b, r, c, z); }
  }

  // ---------- .xlsx/.xlsm einlesen ----------
  const EINGEBAUTE_FORMATE = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
    14: 'mm-dd-yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm', 49: '@' };
  function xmlText(s){ return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n)=> String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n)=> String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&'); }
  function attr(tag, name){ const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? xmlText(m[1]) : null; }
  async function ausXlsx(daten){
    const zip = await JSZip.loadAsync(daten);
    const lies = async (p)=>{ const f = zip.file(p); return f ? f.async('string') : null; };
    const wb = await lies('xl/workbook.xml');
    if(!wb) throw new Error('Keine Excel-Datei.');
    const rels = await lies('xl/_rels/workbook.xml.rels') || '';
    const relZiel = {};
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(t=>{ relZiel[attr(t, 'Id')] = attr(t, 'Target'); });
    // gemeinsame Texte
    const ss = [];
    const sst = await lies('xl/sharedStrings.xml');
    if(sst) (sst.match(/<si>[\s\S]*?<\/si>/g) || []).forEach(si=>{ ss.push(xmlText((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(x=> x.replace(/<t[^>]*>|<\/t>/g, '')).join(''))); });
    // Formate
    const st = await lies('xl/styles.xml') || '';
    const numFmts = Object.assign({}, EINGEBAUTE_FORMATE);
    (st.match(/<numFmt\b[^>]*>/g) || []).forEach(t=>{ numFmts[+attr(t, 'numFmtId')] = attr(t, 'formatCode'); });
    const fonts = (((/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(st) || [])[1]) || '').match(/<font\b[\s\S]*?<\/font>|<font\/>/g) || [];
    const fettFont = fonts.map(f=> /<b\/>|<b val="(1|true)"\/>/.test(f));
    const xfs = (((/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st) || [])[1]) || '').match(/<xf\b[^>]*\/?>/g) || [];
    const stil = xfs.map(x=> ({ nf: numFmts[+(attr(x, 'numFmtId') || 0)] || 'General', b: !!fettFont[+(attr(x, 'fontId') || 0)], u: /wrapText="1"/.test(x) }));
    const m = neu();
    const sheets = wb.match(/<sheet\b[^>]*\/?>/g) || [];
    for(const s of sheets){
      const name = attr(s, 'name'), rid = attr(s, 'r:id');
      let ziel = relZiel[rid] || ''; ziel = ziel.replace(/^\/?xl\//, '').replace(/^\//, '');
      const xml = await lies('xl/' + ziel) || '';
      const b = blattNeu(m, name);
      (xml.match(/<col\b[^>]*\/?>/g) || []).forEach(t=>{ const w = attr(t, 'width'); if(w){ for(let c = +attr(t, 'min') - 1; c <= +attr(t, 'max') - 1 && c < 200; c++) b.breiten[c] = Math.round(+w * 7.0); } });
      const zeilen = xml.match(/<row\b[^>]*\/>|<row\b[^>]*[^\/]>[\s\S]*?<\/row>/g) || [];
      for(const zr of zeilen){
        const rt = /<row\b[^>]*>/.exec(zr)[0];
        const rNr = +attr(rt, 'r') - 1;
        const ht = attr(rt, 'ht'); if(ht && attr(rt, 'customHeight') === '1') b.hoehen[rNr] = +ht;
        (zr.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach(ct=>{
          const kopf = /<c\b[^>]*>/.exec(ct)[0];
          const ref = attr(kopf, 'r'); const a = bereich(ref);
          const t = attr(kopf, 't'), si = attr(kopf, 's');
          const fm = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(ct), vm = /<v>([\s\S]*?)<\/v>/.exec(ct), im = /<is>([\s\S]*?)<\/is>/.exec(ct);
          const fTag = /<f\b[^>]*\/?>/.exec(ct);
          const z = {};
          const sti = si != null ? stil[+si] : null;
          if(sti){ if(sti.nf && sti.nf !== 'General') z.nf = sti.nf; if(sti.b) z.b = true; if(sti.u) z.u = true; }
          let v = null;
          if(t === 's' && vm) v = ss[+vm[1]];
          else if(t === 'inlineStr' && im) v = xmlText((im[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(x=> x.replace(/<t[^>]*>|<\/t>/g, '')).join(''));
          else if(t === 'str' && vm) v = xmlText(vm[1]);
          else if(t === 'b' && vm) v = vm[1] === '1';
          else if(t === 'e' && vm) v = vm[1];
          else if(vm) v = Number(vm[1]);
          if(fm && fm[1]) z.f = '=' + xmlText(fm[1]);
          else if(fTag && attr(fTag[0], 't') === 'shared' && attr(fTag[0], 'si') != null) z.geteilt = +attr(fTag[0], 'si');
          if(fm && fTag && attr(fTag[0], 't') === 'shared' && attr(fTag[0], 'ref')) z.geteiltBasis = +attr(fTag[0], 'si');
          z.v = v;
          zelleSetzen(b, a.r1, a.c1, z);
        });
      }
      // geteilte Formeln aufloesen (Basis + Verschiebung)
      const basen = {};
      for(const k in b.zellen){ const z = b.zellen[k]; if(z.geteiltBasis != null){ const [r, c] = k.split(',').map(Number); basen[z.geteiltBasis] = { r, c, f: z.f }; delete z.geteiltBasis; } }
      for(const k in b.zellen){
        const z = b.zellen[k]; if(z.geteilt == null) continue;
        const bs = basen[z.geteilt]; delete z.geteilt;
        if(!bs) continue;
        const [r, c] = k.split(',').map(Number);
        z.f = formelVerschieben(formelVerschieben(bs.f, { art: 'zeilen', ab: 0, n: r - bs.r, c1: 0, c2: MAXC }), { art: 'spalten', ab: 0, n: c - bs.c, r1: 0, r2: MAXR });
      }
    }
    m.blaetter.forEach((b, i)=> b.pos = i);
    return m;
  }

  // ---------- als .xlsx ausgeben ----------
  function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  async function alsXlsx(m){
    const zip = new JSZip();
    const formate = ['General'], fmtId = { General: 0 }, stile = [{ nf: 0, b: false, u: false }], stilIdx = { '0|0|0': 0 };
    const eigeneFmts = [];
    const stilFuer = (z)=>{
      let nfId = 0;
      if(z.nf && z.nf !== 'General'){
        const eingebaut = Object.entries(EINGEBAUTE_FORMATE).find(([, v])=> v === z.nf);
        if(eingebaut) nfId = +eingebaut[0];
        else { if(fmtId[z.nf] == null){ fmtId[z.nf] = 164 + eigeneFmts.length; eigeneFmts.push(z.nf); } nfId = fmtId[z.nf]; }
      }
      const k = nfId + '|' + (z.b ? 1 : 0) + '|' + (z.u ? 1 : 0);
      if(stilIdx[k] == null){ stilIdx[k] = stile.length; stile.push({ nf: nfId, b: !!z.b, u: !!z.u }); }
      return stilIdx[k];
    };
    const ss = [], ssIdx = new Map();
    const sIdx = (t)=>{ if(!ssIdx.has(t)){ ssIdx.set(t, ss.length); ss.push(t); } return ssIdx.get(t); };
    const blaetter = m.blaetter.slice().sort((a, b)=> a.pos - b.pos);
    blaetter.forEach((b, i)=>{
      const aw = auswerter(m, b);
      const zeilen = {};
      for(const k in b.zellen){ const [r, c] = k.split(',').map(Number); (zeilen[r] = zeilen[r] || []).push(c); }
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      const br = Object.keys(b.breiten).map(Number).sort((x, y)=> x - y);
      if(br.length) xml += '<cols>' + br.map(c=> '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (b.breiten[c] / 7).toFixed(2) + '" customWidth="1"/>').join('') + '</cols>';
      xml += '<sheetData>';
      Object.keys(zeilen).map(Number).sort((x, y)=> x - y).forEach(r=>{
        const h = b.hoehen[r];
        xml += '<row r="' + (r + 1) + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>';
        zeilen[r].sort((x, y)=> x - y).forEach(c=>{
          const z = b.zellen[K(r, c)]; const s = stilFuer(z); const ref = spName(c) + (r + 1);
          const st = s ? ' s="' + s + '"' : '';
          if(z.f){
            const v = aw.wert(b, r, c);
            const typ = typeof v === 'string' ? ' t="str"' : typeof v === 'boolean' ? ' t="b"' : '';
            xml += '<c r="' + ref + '"' + st + typ + '><f>' + esc(z.f.slice(1)) + '</f>' + (v === null || v === '' ? '' : '<v>' + esc(typeof v === 'boolean' ? (v ? 1 : 0) : v) + '</v>') + '</c>';
          } else if(z.v === null || z.v === undefined || z.v === '') xml += '<c r="' + ref + '"' + st + '/>';
          else if(typeof z.v === 'number') xml += '<c r="' + ref + '"' + st + '><v>' + z.v + '</v></c>';
          else if(typeof z.v === 'boolean') xml += '<c r="' + ref + '"' + st + ' t="b"><v>' + (z.v ? 1 : 0) + '</v></c>';
          else xml += '<c r="' + ref + '"' + st + ' t="s"><v>' + sIdx(String(z.v)) + '</v></c>';
        });
        xml += '</row>';
      });
      xml += '</sheetData></worksheet>';
      zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', xml);
    });
    zip.file('xl/sharedStrings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + ss.length + '" uniqueCount="' + ss.length + '">' + ss.map(t=> '<si><t xml:space="preserve">' + esc(t) + '</t></si>').join('') + '</sst>');
    zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (eigeneFmts.length ? '<numFmts count="' + eigeneFmts.length + '">' + eigeneFmts.map((f, i)=> '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(f) + '"/>').join('') + '</numFmts>' : '') +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + stile.length + '">' + stile.map(s=> '<xf numFmtId="' + s.nf + '" fontId="' + (s.b ? 1 : 0) + '" fillId="0" borderId="0" xfId="0"' + (s.nf ? ' applyNumberFormat="1"' : '') + (s.b ? ' applyFont="1"' : '') + (s.u ? ' applyAlignment="1"><alignment wrapText="1"/></xf>' : '/>')).join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      blaetter.map((b, i)=> '<sheet name="' + esc(b.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      blaetter.map((b, i)=> '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      blaetter.map((b, i)=> '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  // Form zum Speichern: ohne zwischengespeicherte Formelbaeume
  function zuJson(m){ return JSON.stringify(m, (k, v)=> k === 'ast' ? undefined : v); }
  function ausJson(t){ return JSON.parse(t); }

  global.Mappe = { spNr, spName, bereich, adresse, neu, blatt, blattNeu, genutzt, bereichLesen, bereichSchreiben, einfuegen, loeschen,
    fettLesen, fettSetzen, ausXlsx, alsXlsx, zuJson, ausJson, auswerter, parse, formelVerschieben };
})(typeof window !== 'undefined' ? window : globalThis);
