// Bisherige Microsoft-Anmeldung über die Bibliothek MSAL (Rückfallebene, Notausgang ?msal=alt) mit MSAL 5.x:
// Bibliothek lädt, Anmeldung per Redirect (PKCE), Rückkehr mit Code, Zugriffsschlüssel aus dem Zwischenspeicher,
// Anmeldung übersteht Neuladen, Daten im localStorage verschlüsselt, Abmelden. Microsoft wird nachgebildet.
// Optional: MSAL_ALT=<Pfad zu msal-browser.min.js 3.x> prüft zusätzlich die Übernahme einer Anmeldung von MSAL 3.
const fs = require('fs');
const { geraet, SEITE } = require('./hilfe');
const MS = 'https://login.microsoftonline.com';
// Adresse von Microsoft? (ueber den Hostnamen, nicht ueber den Textanfang)
const istMs = (u)=>{ try{ return new URL(String(u)).hostname === 'login.microsoftonline.com'; }catch(_){ return false; } };
const TID = '9188040d-6c67-4c5b-b112-36a304b66dad', UID = '00000000-0000-0000-1234-56789abcdef0';
const b64u = (o)=> Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Nachgebildeter Microsoft-Anmeldedienst; merkt sich die Anfragen
async function microsoft(c, clientId){
  const log = { authorize: [], token: [], logout: [] }; let nonce = '', n = 0;
  await c.route((u)=> istMs(u), async (r)=>{
    const url = new URL(r.request().url()), pfad = url.pathname;
    const json = (o)=> r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if(/openid-configuration$/.test(pfad)) return json({ issuer: MS + '/{tenantid}/v2.0', authorization_endpoint: MS + '/consumers/oauth2/v2.0/authorize',
      token_endpoint: MS + '/consumers/oauth2/v2.0/token', end_session_endpoint: MS + '/consumers/oauth2/v2.0/logout', jwks_uri: MS + '/consumers/discovery/v2.0/keys',
      response_modes_supported: ['query', 'fragment', 'form_post'], scopes_supported: ['openid', 'profile', 'email', 'offline_access'] });
    if(/discovery\/instance$/.test(pfad)) return json({ tenant_discovery_endpoint: MS + '/consumers/v2.0/.well-known/openid-configuration', 'api-version': '1.1',
      metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net'] }] });
    if(/\/authorize$/.test(pfad)){ log.authorize.push(url); nonce = url.searchParams.get('nonce') || ''; return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Microsoft-Anmeldung (nachgebildet)</p>' }); }
    if(/\/logout$/.test(pfad)){ log.logout.push(url); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>abgemeldet</p>' }); }
    if(/\/token$/.test(pfad)){
      const f = new URLSearchParams(r.request().postData() || ''); log.token.push(f); n++;
      const jetzt = Math.floor(Date.now() / 1000);
      const id = [b64u({ alg: 'none', typ: 'JWT' }), b64u({ aud: clientId, iss: MS + '/' + TID + '/v2.0', tid: TID, oid: UID, sub: 'sub-1', name: 'Test Konto',
        preferred_username: 'test@outlook.de', nonce, iat: jetzt, nbf: jetzt, exp: jetzt + 3600 }), 'x'].join('.');
      return json({ token_type: 'Bearer', scope: 'Files.ReadWrite User.Read openid profile offline_access', expires_in: 3600, ext_expires_in: 3600,
        access_token: 'AT-' + n, refresh_token: 'RT-' + n, id_token: id, client_info: b64u({ uid: UID, utid: TID }) });
    }
    return r.fulfill({ status: 404, body: '' });
  });
  return log;
}

module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  const c = p.context();
  // Notausgang ?msal=alt dieser Sitzung: Anmeldung über die Bibliothek
  await p.addInitScript(()=>{ try{ sessionStorage.setItem('msal_notfall', '1'); localStorage.setItem('ms_anmeldung', '"msal"'); }catch(_){} });
  const clientId = await (async ()=>{ const s = fs.readFileSync(require('path').join(__dirname, '..', SEITE), 'utf8'); return /const MSGRAPH_CLIENT_ID = '([^']+)'/.exec(s)[1]; })();
  const log = await microsoft(c, clientId);
  const alt = process.env.MSAL_ALT;
  if(alt) await c.route(basis + 'lib/msal/msal-browser.min.js', (r)=> r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(alt) }));

  const bereit = async ()=>{ await p.waitForFunction(()=> typeof msGraphStatus !== 'undefined' && msGraphStatus !== 'unbekannt' && typeof msAnmeldeArt === 'function', null, { timeout: 60000 }); await p.waitForTimeout(1000); };
  // Neues Gerät: Datentresor einrichten (danach läuft die App)
  await p.goto(basis + SEITE);
  try{ const { tresorEinrichten } = require('./hilfe'); if(await p.$('#tsPw1') || await p.waitForSelector('#tsPw1', { timeout: 8000 }).catch(()=> null)) await tresorEinrichten(p); }catch(_){}
  await bereit();
  const start = await p.evaluate(()=> ({ art: msAnmeldeArt(), version: typeof msal !== 'undefined' && msal.version, status: msGraphStatus }));
  if(!alt) pr('MSAL 5.30.0 geladen, Anmeldeart „msal“, abgemeldet', start.version === '5.30.0' && start.art === 'msal' && start.status === 'abgemeldet', start);

  // Anmelden: Redirect zu Microsoft mit PKCE
  const anmelden = async ()=>{
    const vorher = log.authorize.length;
    await Promise.all([ p.waitForURL((u)=> istMs(u), { timeout: 30000 }), p.evaluate(()=>{ msGraphAnmelden(); }) ]);
    const a = log.authorize[vorher];
    return a;
  };
  const a = await anmelden();
  const q = a ? Object.fromEntries(a.searchParams) : {};
  pr('Anmelden leitet zu Microsoft (consumers, Client-ID, Redirect-URI der App, PKCE S256, Rückgabe im Fragment)',
    !!a && a.pathname === '/consumers/oauth2/v2.0/authorize' && q.client_id === clientId && q.redirect_uri === 'https://seblussi.github.io/rechnung-mobil/Rechnungserfassung_Mobil.html'
    && q.code_challenge_method === 'S256' && !!q.code_challenge && q.response_mode === 'fragment' && /Files\.ReadWrite/.test(q.scope || '') && /offline_access/.test(q.scope || ''), q);

  // Rückkehr von Microsoft mit Code
  await p.goto(basis + SEITE + '#code=CODE-1&state=' + encodeURIComponent(q.state || '') + '&client_info=' + b64u({ uid: UID, utid: TID }));
  if(alt) try{ await require('./hilfe').entsperren(p); }catch(_){}
  else try{ if(await p.waitForSelector('#tsPw', { timeout: 8000 }).catch(()=> null)) await require('./hilfe').entsperren(p); }catch(_){}
  await bereit();
  const t1 = log.token[0];
  const nach = await p.evaluate(async ()=> ({ status: msGraphStatus, konto: msGraphKonto, token: await msGraphTokenHolen(), hash: location.hash }));
  pr((alt ? '[MSAL 3] ' : '') + 'Rückkehr: Code gegen Schlüssel getauscht (mit code_verifier), angemeldet als Test Konto, Zugriffsschlüssel vorhanden',
    !!t1 && t1.get('grant_type') === 'authorization_code' && t1.get('code') === 'CODE-1' && !!t1.get('code_verifier') && nach.status === 'angemeldet'
    && nach.konto && nach.konto.username === 'test@outlook.de' && nach.token === 'AT-1' && !/code=/.test(nach.hash), { nach, grant: t1 && t1.get('grant_type') });

  if(alt){
    // Bibliothek tauschen (Update auf MSAL 5): bestehende Anmeldung muss erhalten bleiben
    await c.unroute(basis + 'lib/msal/msal-browser.min.js');
    await p.goto(basis + SEITE);
    try{ await require('./hilfe').entsperren(p); }catch(_){}
    await bereit();
    const m = await p.evaluate(async ()=> ({ version: msal.version, status: msGraphStatus, konto: msGraphKonto, token: await msGraphTokenHolen() }));
    pr('Update MSAL 3 → 5: Anmeldung bleibt erhalten, Zugriffsschlüssel weiter nutzbar', m.version === '5.30.0' && m.status === 'angemeldet' && m.token === 'AT-1', m);
  }

  // Neuladen: Anmeldung bleibt; Langzeitschlüssel nicht im Klartext im localStorage
  await p.reload();
  try{ if(await p.waitForSelector('#tsPw', { timeout: 8000 }).catch(()=> null)) await require('./hilfe').entsperren(p); }catch(_){}
  await bereit();
  const neu = await p.evaluate(async ()=>{
    const roh = []; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(/^msal\./.test(k)) roh.push(localStorage.getItem(k)); }
    return { status: msGraphStatus, token: await msGraphTokenHolen(), klartext: roh.some((v)=> /RT-\d|AT-\d|"secret"/.test(v)), anzahl: roh.length };
  });
  pr('nach Neuladen weiter angemeldet, Schlüssel nur verschlüsselt im localStorage', neu.status === 'angemeldet' && /^AT-\d$/.test(neu.token || '') && !neu.klartext && neu.anzahl > 0, neu);

  // Zugriffsschlüssel abgelaufen: Erneuerung mit dem Langzeitschlüssel (ohne verstecktes Fenster)
  const vorRt = log.token.length;
  const erneuert = await p.evaluate(async ()=>{ const k = msGraphMsal.getActiveAccount(); return (await msGraphMsal.acquireTokenSilent({ scopes: MSGRAPH_SCOPES, account: k, forceRefresh: true, cacheLookupPolicy: msal.CacheLookupPolicy.AccessTokenAndRefreshToken })).accessToken; });
  const rt = log.token[vorRt];
  pr('Erneuerung über den Langzeitschlüssel (refresh_token)', !!rt && rt.get('grant_type') === 'refresh_token' && /^RT-\d$/.test(rt.get('refresh_token') || '') && /^AT-\d$/.test(erneuert), { erneuert, grant: rt && rt.get('grant_type') });

  // Abmelden: Redirect zur Microsoft-Abmeldung, danach keine Anmeldedaten mehr im Speicher
  await Promise.all([ p.waitForURL((u)=> istMs(u), { timeout: 30000 }), p.evaluate(()=>{ msGraphAbmelden(); }) ]);
  const lo = log.logout[0];
  await p.goto(basis + SEITE);
  try{ if(await p.waitForSelector('#tsPw', { timeout: 8000 }).catch(()=> null)) await require('./hilfe').entsperren(p); }catch(_){}
  await bereit();
  const ab = await p.evaluate(()=>{ const t = []; for(const s of [localStorage, sessionStorage]) for(let i = 0; i < s.length; i++){ const k = s.key(i); if(/^msal\.\d|refreshtoken|accesstoken|idtoken/i.test(k)) t.push(k); } return { status: msGraphStatus, reste: t }; });
  pr('Abmelden: Microsoft-Abmeldung mit Rücksprung zur App, danach abgemeldet und keine Schlüssel mehr gespeichert',
    !!lo && lo.searchParams.get('post_logout_redirect_uri') === 'https://seblussi.github.io/rechnung-mobil/Rechnungserfassung_Mobil.html' && ab.status === 'abgemeldet' && ab.reste.length === 0, ab);
  pr('keine Skriptfehler', p.fehler.length === 0, p.fehler.slice(0, 3));
  await c.close();
};
