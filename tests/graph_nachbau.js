// Nachbildung von Microsoft-Anmeldung (authorize/token) und OneDrive (Graph, pfad- und kennungsbasiert) für Tests.
// Dateien: Map 'ROOT/KVBW Onedrive/x.json' -> { bytes, eTag, id }. Ordner ergeben sich aus den Pfaden.
const KLIENT = '579a39e0-b7fd-4c46-8684-af22e1bc45a2';
const { msKonto } = require('./ms_konto');
function nachbau(){
  const dateien = new Map(); let nr = 0; const log = []; const konto = msKonto();
  const idVon = new Map();   // id -> pfad (Dateien und Ordner)
  const neueId = (pfad)=>{ for(const [i, p] of idVon) if(p === pfad) return i; const i = 'I' + (++nr); idVon.set(i, pfad); return i; };
  const json = (route, status, body)=> route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body || {}) });
  const ordnerDa = (pfad)=> pfad === 'ROOT' || pfad === 'APP' || [...dateien.keys()].some((k)=> k.startsWith(pfad + '/'));
  function setzen(pfad, inhalt){ const b = Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(String(inhalt)); const e = '"e' + (++nr) + '"'; dateien.set(pfad, { bytes: b, eTag: e, id: neueId(pfad) }); return e; }
  async function graph(route){
    const q = route.request(), m = q.method(), u = new URL(q.url()), h = q.headers();
    let p = decodeURIComponent(u.pathname).replace(/^\/v1\.0\/me\/drive/, '');
    log.push(m + ' ' + p);
    let pfad = null, rest = '', mm;
    if((mm = p.match(/^\/root:\/([^:]*):?(\/.*)?$/))){ pfad = 'ROOT/' + mm[1].replace(/\/+$/, ''); rest = mm[2] || ''; }
    else if((mm = p.match(/^\/special\/approot:\/([^:]*):?(\/.*)?$/))){ pfad = 'APP/' + mm[1].replace(/\/+$/, ''); rest = mm[2] || ''; }
    else if((mm = p.match(/^\/special\/approot(\/.*)?$/))){ pfad = 'APP'; rest = mm[1] || ''; }
    else if((mm = p.match(/^\/root(\/.*)?$/))){ pfad = 'ROOT'; rest = mm[1] || ''; }
    else if((mm = p.match(/^\/items\/([^/]+)(\/.*)?$/))){ pfad = idVon.get(mm[1]) || null; rest = mm[2] || ''; if(!pfad) return json(route, 404, { error: { code: 'itemNotFound' } }); }
    else return json(route, 404, {});
    const verwehrt = konto.pruefen(h['authorization'], pfad === 'APP' || pfad.startsWith('APP/'));
    if(verwehrt) return json(route, verwehrt[0], verwehrt[1]);
    const d = dateien.get(pfad);
    if(rest === '/content' && m === 'PUT'){
      if(h['if-none-match'] === '*' && d) return json(route, 412, {});
      if(h['if-match'] && (!d || d.eTag !== h['if-match'])) return json(route, 412, {});
      const e = setzen(pfad, q.postDataBuffer() || Buffer.alloc(0)); return json(route, 201, { id: dateien.get(pfad).id, eTag: e });
    }
    if(rest === '/content' && m === 'GET'){ if(!d) return json(route, 404, { error: { code: 'itemNotFound' } }); return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: d.bytes }); }
    if(rest === '/children' && m === 'GET'){
      if(!ordnerDa(pfad)) return json(route, 404, {});
      const namen = new Map();
      for(const k of dateien.keys()) if(k.startsWith(pfad + '/')){ const rest2 = k.slice(pfad.length + 1), n = rest2.split('/')[0], ordner = rest2.includes('/'); namen.set(n, ordner); }
      return json(route, 200, { value: [...namen].map(([n, ordner])=> ({ id: neueId(pfad + '/' + n), name: n, folder: ordner ? {} : undefined, file: ordner ? undefined : {} })) });
    }
    if(rest === '/children' && m === 'POST') return json(route, 201, {});
    if(!rest && m === 'GET'){
      if(d) return json(route, 200, { id: d.id, eTag: d.eTag, size: d.bytes.length, name: pfad.split('/').pop(), file: {} });
      if(ordnerDa(pfad) && pfad !== 'ROOT/KVBW Onedrive/Nichtda') return json(route, 200, { id: neueId(pfad), name: pfad.split('/').pop(), folder: {} });
      return json(route, 404, { error: { code: 'itemNotFound' } });
    }
    if(!rest && m === 'DELETE'){ if(d){ dateien.delete(pfad); return route.fulfill({ status: 204, body: '' }); } let n = 0; for(const k of [...dateien.keys()]) if(k.startsWith(pfad + '/')){ dateien.delete(k); n++; } return n ? route.fulfill({ status: 204, body: '' }) : json(route, 404, {}); }
    return json(route, 404, {});
  }
  async function login(route, basis){
    const q = route.request(), u = new URL(q.url());
    if(/\/authorize$/.test(u.pathname)){
      const zurueck = u.searchParams.get('redirect_uri').replace('https://seblussi.github.io/rechnung-mobil/', basis);
      konto.authorize(u.searchParams.get('scope'));
      return route.fulfill({ status: 302, headers: { location: zurueck + '?code=CODE123&state=' + encodeURIComponent(u.searchParams.get('state')) } });
    }
    if(/\/token$/.test(u.pathname)){
      const b = new URLSearchParams(q.postData() || '');
      const idt = 'x.' + Buffer.from(JSON.stringify({ name: 'Test Arzt', preferred_username: 'test@beispiel.de' })).toString('base64url') + '.y';
      const t = konto.token(b); if(t.status) return json(route, t.status, t);
      return json(route, 200, Object.assign(t, { id_token: idt }));
    }
    return json(route, 404, {});
  }
  // Seite mit Nachbau verbinden; mitMsal: bisherige Anmeldung der Microsoft-Bibliothek im localStorage
  async function verbinden(p, basis, mitMsal){
    await p.context().route(/graph\.microsoft\.com/, (r)=> graph(r));
    await p.context().route(/login\.microsoftonline\.com/, (r)=> login(r, basis));
    if(mitMsal) await p.addInitScript(([k])=>{
      if(localStorage.getItem('test_msal_gesetzt')) return; localStorage.setItem('test_msal_gesetzt', '1');
      localStorage.setItem('uid.utid-login.windows.net-consumers', JSON.stringify({ authorityType: 'MSSTS', username: 'test@beispiel.de', name: 'Test Arzt' }));
      localStorage.setItem('uid.utid-login.windows.net-refreshtoken-' + k + '----', JSON.stringify({ credentialType: 'RefreshToken', secret: 'RT-MSAL', clientId: k }));
    }, [KLIENT]);
  }
  // irgendwo im OneDrive Klartext? -> Liste der Pfade
  const klartext = (wort)=> [...dateien].filter(([, d])=> d.bytes.toString('utf8').includes(wort)).map(([k])=> k);
  return { dateien, setzen, graph, login, verbinden, log, klartext, konto };
}
module.exports = { nachbau, KLIENT };
