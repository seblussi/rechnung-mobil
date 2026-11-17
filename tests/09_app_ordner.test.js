// P3: Microsoft-Anmeldung im Datentresor und Zugriff nur auf den App-Ordner.
// Microsoft-Anmeldung (authorize/token) und OneDrive (Graph) sind nachgebildet. Geprüft wird:
//  - die bisherige Anmeldung der Microsoft-Bibliothek wird übernommen, ihre Klartext-Daten im Browser gelöscht
//  - „In den App-Ordner verschieben“: Ordner wird verschoben, danach nur noch Schlüssel für den App-Ordner
//  - ein zweites Gerät stellt sich selbst um; „Zurückverschieben“ als Rückweg
const { geraet, oeffnen, entsperren } = require('./hilfe');
const KLIENT = '579a39e0-b7fd-4c46-8684-af22e1bc45a2';
function onedrive(){
  // Elemente: id -> { name, eltern }
  const el = new Map([['ROOT', { name: '', eltern: null }], ['APPS', { name: 'Apps', eltern: 'ROOT' }], ['F1', { name: 'KVBW Onedrive', eltern: 'ROOT' }], ['F2', { name: 'einstellungen.ini', eltern: 'F1', inhalt: '[ARZT]\nNAME=Dr. Test\n' }]]);
  let approot = null; const log = [], scopes = [];
  const kind = (eltern, name)=>{ for(const [id, x] of el) if(x.eltern === eltern && x.name === name) return id; return null; };
  const pfad = (start, teile)=>{ let id = start; for(const t of teile){ id = kind(id, t); if(!id) return null; } return id; };
  const json = (route, status, body)=> route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body || {}) });
  async function graph(route){
    const q = route.request(), m = q.method(), u = new URL(q.url()), auth = q.headers()['authorization'] || '';
    let p = decodeURIComponent(u.pathname).replace(/^\/v1\.0\/me\/drive/, '');
    log.push(m + ' ' + p + ' [' + auth.replace(/^Bearer /, '') + ']');
    const nurApp = /AppFolder/.test(auth) && !/Files\.ReadWrite(?!\.AppFolder)/.test(auth.replace('Files.ReadWrite.AppFolder', ''));
    if(p.startsWith('/special/approot') && !approot){ approot = 'APPR'; el.set('APPR', { name: 'Rechnungserfassung', eltern: 'APPS' }); }
    const aufloesen = ()=>{
      let mm;
      if(p === '/root') return { id: 'ROOT', rest: '' };
      if(p === '/special/approot') return { id: approot, rest: '' };
      if((mm = p.match(/^\/root:\/([^:]*):?(\/.*)?$/))){ if(nurApp) return { verboten: true }; return { id: pfad('ROOT', mm[1].split('/').filter(Boolean)), rest: mm[2] || '' }; }
      if((mm = p.match(/^\/special\/approot:\/([^:]*):?(\/.*)?$/))) return { id: pfad(approot, mm[1].split('/').filter(Boolean)), rest: mm[2] || '' };
      if((mm = p.match(/^\/items\/([^/]+)(\/.*)?$/))) return { id: el.has(mm[1]) ? mm[1] : null, rest: mm[2] || '' };
      return { id: null, rest: '' };
    };
    const a = aufloesen();
    if(a.verboten) return json(route, 403, { error: { code: 'accessDenied', message: 'nur App-Ordner' } });
    // Zugriff mit App-Ordner-Schlüssel ausserhalb des App-Ordners verboten
    if(a.id && nurApp){ let x = a.id, drin = false; while(x){ if(x === approot){ drin = true; break; } x = el.get(x).eltern; } if(!drin) return json(route, 403, { error: { code: 'accessDenied' } }); }
    if(!a.id) return json(route, 404, { error: { code: 'itemNotFound' } });
    const it = el.get(a.id);
    if(m === 'PATCH' && !a.rest){
      const b = JSON.parse(q.postData() || '{}'); const neu = b.parentReference && b.parentReference.id;
      if(!el.has(neu)) return json(route, 400, {});
      if(kind(neu, it.name)) return json(route, 409, { error: { code: 'nameAlreadyExists' } });
      it.eltern = neu; return json(route, 200, { id: a.id, name: it.name });
    }
    if(m === 'GET' && !a.rest) return json(route, 200, { id: a.id, name: it.name, folder: it.inhalt == null ? {} : undefined, file: it.inhalt != null ? {} : undefined });
    if(m === 'GET' && a.rest === '/content' && it.inhalt != null) return route.fulfill({ status: 200, contentType: 'text/plain', body: it.inhalt });
    return json(route, 404, { error: { code: 'itemNotFound' } });
  }
  async function login(route){
    const q = route.request(), u = new URL(q.url());
    if(/\/authorize$/.test(u.pathname)){
      scopes.push('authorize: ' + u.searchParams.get('scope'));
      const zurueck = u.searchParams.get('redirect_uri').replace('https://seblussi.github.io/rechnung-mobil/', route.basis);
      return route.fulfill({ status: 302, headers: { location: zurueck + '?code=CODE123&state=' + encodeURIComponent(u.searchParams.get('state')) } });
    }
    if(/\/token$/.test(u.pathname)){
      const b = new URLSearchParams(q.postData() || ''); scopes.push(b.get('grant_type') + ': ' + b.get('scope'));
      const idt = 'x.' + Buffer.from(JSON.stringify({ name: 'Test Arzt', preferred_username: 'test@beispiel.de' })).toString('base64url') + '.y';
      return json(route, 200, { access_token: 'AT ' + b.get('scope'), refresh_token: 'RT-GEHEIM-' + Date.now(), id_token: idt, expires_in: 3600 });
    }
    return json(route, 404, {});
  }
  return { el, graph, login, log, scopes, wo: ()=>{ const f = el.get('F1'); return f.eltern === 'ROOT' ? 'Hauptordner' : f.eltern === approot ? 'App-Ordner' : f.eltern; } };
}
async function neuesGeraet(browser, basis, od, mitMsal){
  const p = await geraet(browser, basis, { echt: true });
  await p.context().route(/graph\.microsoft\.com/, (r)=> od.graph(r));
  await p.context().route(/login\.microsoftonline\.com/, (r)=>{ r.basis = basis; return od.login(r); });
  if(mitMsal) await p.addInitScript(([k])=>{   // Anmeldung der Microsoft-Bibliothek wie bisher im localStorage
    if(localStorage.getItem('test_msal_gesetzt')) return; localStorage.setItem('test_msal_gesetzt', '1');
    localStorage.setItem('msal.account.keys', JSON.stringify(['k1']));
    localStorage.setItem('uid.utid-login.windows.net-consumers', JSON.stringify({ authorityType: 'MSSTS', username: 'test@beispiel.de', name: 'Test Arzt' }));
    localStorage.setItem('uid.utid-login.windows.net-refreshtoken-' + k + '----', JSON.stringify({ credentialType: 'RefreshToken', secret: 'RT-MSAL-KLARTEXT', clientId: k }));
  }, [KLIENT]);
  return p;
}
const imKlartext = (p)=> p.evaluate(()=>{ const t = []; for(const s of [localStorage, sessionStorage]) for(let i = 0; i < s.length; i++){ const k = s.key(i); if(/RT-|msal\.|refreshtoken/i.test(k + ' ' + s.getItem(k))) t.push(k); } return t; });
const angemeldet = (p)=> p.waitForFunction(()=> typeof msGraphStatus !== 'undefined' && msGraphStatus === 'angemeldet', null, { timeout: 30000 });
const ladenUndEntsperren = async (p)=>{ await entsperren(p); await p.waitForFunction(()=> typeof ansichtStart === 'function', null, { timeout: 40000 }); };

module.exports = async ({ browser, basis, pr })=>{
  const od = onedrive();
  // ---- Gerät A: Tresor, bisherige Anmeldung der Microsoft-Bibliothek ----
  const A = await neuesGeraet(browser, basis, od, true);
  await oeffnen(A, basis, { einrichten: true });
  await angemeldet(A); await A.waitForTimeout(1500);
  pr('bisherige Anmeldung übernommen (ohne neue Anmeldung), Microsoft-Bibliothek nicht mehr im Spiel', await A.evaluate(()=> msAnmeldeArt() === 'eigen' && MsEigen.angemeldet()));
  pr('keine Anmeldedaten mehr im Klartext im Browser', (await imKlartext(A)).length === 0, await imKlartext(A));
  pr('Langzeitschlüssel liegt nur verschlüsselt im Tresor', await A.evaluate(()=> /RT-/.test(Tresor.kvText('ms_eigen_rt') || '')));
  pr('vor dem Verschieben: Hauptordner, Zugriff aufs ganze OneDrive', od.wo() === 'Hauptordner' && await A.evaluate(()=> !msAppOrdner() && /\/root:/.test(msGraphPfadUrl('KVBW Onedrive/x'))));
  await A.evaluate(async ()=>{ await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 800)); });
  pr('Einstellungen: Angebot „In den App-Ordner verschieben“, kein Test-Schalter mehr', await A.evaluate(()=> !!document.getElementById('appOrdnerHin') && !document.getElementById('chkMsEigen')));
  if(process.env.BILDER){ await A.evaluate(()=> document.getElementById('appOrdnerHin').scrollIntoView({ block: 'center' })); await A.waitForTimeout(300); await A.screenshot({ path: process.env.BILDER + '/4_app_ordner_angebot.png' }); }
  // Klick -> Rückfrage -> Microsoft -> zurück -> entsperren -> verschieben
  await A.evaluate(()=> document.getElementById('appOrdnerHin').click());
  await A.waitForSelector('.beta-overlay.aktiv .btn-primaer', { timeout: 10000 }); await A.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await A.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(A); await angemeldet(A); await A.waitForTimeout(2500);
  pr('Anmeldung zum Verschieben fragte einmal nach OneDrive UND App-Ordner', od.scopes.some((s)=> /^authorize: .*Files\.ReadWrite Files\.ReadWrite\.AppFolder/.test(s)), od.scopes);
  pr('Ordner liegt jetzt im App-Ordner (Kennung unverändert)', od.wo() === 'App-Ordner' && od.el.get('F2').eltern === 'F1', od.wo());
  pr('App nutzt den App-Ordner; Code nicht mehr in der Adresszeile', await A.evaluate(()=> msAppOrdner() && /special\/approot:\/KVBW%20Onedrive/.test(msGraphPfadUrl('KVBW Onedrive/x')) && !/code=/.test(location.href)));
  od.log.length = 0; od.scopes.length = 0;
  const ini = await A.evaluate(async ()=>{ const t = await msGraphTokenHolen(); const r = await fetch(msGraphPfadUrl('KVBW Onedrive/einstellungen.ini') + '/content', { headers: { Authorization: 'Bearer ' + t } }); return r.status + ' ' + (await r.text()).slice(0, 12); });
  const schl = od.log.map((l)=> l.replace(/^.*\[AT (.*)\]$/, '$1'));
  pr('danach: Zugriffsschlüssel nur für den App-Ordner, Dateien weiter lesbar', /^200 \[ARZT\]/.test(ini) && schl.length > 0 && schl.every((s)=> /Files\.ReadWrite\.AppFolder/.test(s) && !/Files\.ReadWrite /.test(s)), { ini, schl });
  pr('mit dem App-Ordner-Schlüssel ist das übrige OneDrive gesperrt', await A.evaluate(async ()=>{ const t = await msGraphTokenHolen(); return (await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/Privat:', { headers: { Authorization: 'Bearer ' + t } })).status; }) === 403);
  pr('Verschieben steht im Sicherheitsprotokoll', await A.evaluate(async ()=> (await Tresor.protokollLesen()).some((e)=> /App-Ordner verschoben/.test(e.text))));
  pr('Gerät A: keine Skriptfehler', A.fehler.length === 0, A.fehler.slice(0, 3));

  // ---- Gerät B: noch weiter Zugriff, Ordner schon verschoben -> stellt sich selbst um ----
  const B = await neuesGeraet(browser, basis, od, true);
  await oeffnen(B, basis, { einrichten: true });
  await angemeldet(B); await B.waitForFunction(()=> msAppOrdner(), null, { timeout: 20000 }).catch(()=>{});
  pr('zweites Gerät erkennt den verschobenen Ordner und nutzt nur noch den App-Ordner', await B.evaluate(()=> msAppOrdner() && MsEigen.angemeldet()));
  await B.context().close();

  // ---- Rückweg ----
  await A.evaluate(async ()=>{ await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 800)); });
  await A.evaluate(()=> document.getElementById('appOrdnerZurueck').click());
  await A.waitForSelector('.beta-overlay.aktiv .btn-primaer', { timeout: 10000 }); await A.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await A.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(A); await angemeldet(A); await A.waitForTimeout(2500);
  pr('„Zurückverschieben“: Ordner wieder im Hauptordner, App nutzt ihn dort', od.wo() === 'Hauptordner' && await A.evaluate(()=> !msAppOrdner()), od.wo());
  await A.context().close();
};
