// Automatische Erneuerung der Microsoft-Anmeldung (Wunsch 20.11.2026) mit der Microsoft-Bibliothek (MSAL 5),
// bisheriger Speicher ohne Datentresor (noch nicht umgestellte Geräte). Ist die letzte Anmeldung 12 h oder mehr her,
// holt die App beim Start still eine neue (acquireTokenRedirect, prompt=none). Microsoft ist nachgebildet.
const fs = require('fs'), path = require('path');
const { geraet, SEITE } = require('./hilfe');
const { altAnlegen } = require('./altspeicher');
const MS = 'https://login.microsoftonline.com';
// Adresse von Microsoft? (ueber den Hostnamen, nicht ueber den Textanfang)
const istMs = (u)=>{ try{ return new URL(String(u)).hostname === 'login.microsoftonline.com'; }catch(_){ return false; } };
const TID = '9188040d-6c67-4c5b-b112-36a304b66dad', UID = '00000000-0000-0000-1234-56789abcdef0';
const b64u = (o)=> Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const STD = 3600000;

async function microsoft(c, clientId){
  const log = { authorize: [], token: [] }; let nonce = '', n = 0;
  await c.route((u)=> istMs(u), async (r)=>{
    const url = new URL(r.request().url()), pfad = url.pathname;
    const json = (o)=> r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if(/openid-configuration$/.test(pfad)) return json({ issuer: MS + '/{tenantid}/v2.0', authorization_endpoint: MS + '/consumers/oauth2/v2.0/authorize',
      token_endpoint: MS + '/consumers/oauth2/v2.0/token', end_session_endpoint: MS + '/consumers/oauth2/v2.0/logout', jwks_uri: MS + '/consumers/discovery/v2.0/keys',
      response_modes_supported: ['query', 'fragment', 'form_post'], scopes_supported: ['openid', 'profile', 'email', 'offline_access'] });
    if(/discovery\/instance$/.test(pfad)) return json({ tenant_discovery_endpoint: MS + '/consumers/v2.0/.well-known/openid-configuration', 'api-version': '1.1',
      metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net'] }] });
    if(/\/authorize$/.test(pfad)){ log.authorize.push(url); nonce = url.searchParams.get('nonce') || ''; return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Microsoft (nachgebildet)</p>' }); }
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
  await c.route(/graph\.microsoft\.com/, (r)=> r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"itemNotFound"}}' }));
  const clientId = /const MSGRAPH_CLIENT_ID = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', SEITE), 'utf8'))[1];
  const log = await microsoft(c, clientId);
  await altAnlegen(p, basis, { einstellungen: JSON.stringify({ arztName: 'Dr. Test' }), einrichtung_gesehen: 'true', app_sperre_abgelehnt: 'true' });
  const bereit = async ()=>{ await p.waitForFunction(()=> typeof msGraphStatus !== 'undefined' && msGraphStatus !== 'unbekannt' && typeof MsErneuerung !== 'undefined', null, { timeout: 60000 }); await p.waitForTimeout(600); };
  const merker = ()=> p.evaluate(()=> JSON.parse(localStorage.getItem('ms_erneuerung') || 'null'));
  const setzeMerker = (o)=> p.evaluate((o)=> localStorage.setItem('ms_erneuerung', JSON.stringify(o)), o);
  const zurueck = async (hash)=>{ await p.goto(basis + SEITE + '#' + hash); await bereit(); await p.waitForTimeout(2500); };
  const umleitung = async ()=>{ const vorher = log.authorize.length; await p.goto(basis + SEITE).catch(()=>{}); await p.waitForURL((u)=> istMs(u), { timeout: 20000 }).catch(()=>{}); return log.authorize.length > vorher ? log.authorize[log.authorize.length - 1] : null; };

  await p.goto(basis + SEITE); await bereit();
  const start = await p.evaluate(()=> ({ tresor: !!window.TRESOR_MODUS, art: msAnmeldeArt(), status: msGraphStatus }));
  pr('Ausgangslage: bisheriger Speicher, Microsoft-Bibliothek, abgemeldet', !start.tresor && start.art === 'msal' && start.status === 'abgemeldet', start);

  // von Hand anmelden
  await Promise.all([ p.waitForURL((u)=> istMs(u), { timeout: 30000 }), p.evaluate(()=>{ msGraphAnmelden(); }) ]);
  const a0 = log.authorize[0];
  await zurueck('code=CODE-1&state=' + encodeURIComponent(a0.searchParams.get('state')) + '&client_info=' + b64u({ uid: UID, utid: TID }));
  let m = await merker();
  pr('Anmeldung von Hand: angemeldet, Zeitpunkt gemerkt (Art „msal“)', (await p.evaluate(()=> msGraphStatus)) === 'angemeldet' && m && m.art === 'msal' && Date.now() - m.am < 120000, m);

  // 13 h später: Start leitet still zu Microsoft (prompt=none), auch wenn die App-Sperre (PIN) gerade offen ist
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'msal' });
  const a1 = await umleitung();
  pr('Start nach 13 h: stille Erneuerung (prompt=none, mit Konto-Hinweis, PKCE)', !!a1 && a1.searchParams.get('prompt') === 'none' && !!(a1.searchParams.get('login_hint') || a1.searchParams.get('sid')) && a1.searchParams.get('code_challenge_method') === 'S256', a1 && Object.fromEntries(a1.searchParams));
  const tokVorher = log.token.length;
  await zurueck('code=CODE-2&state=' + encodeURIComponent(a1 ? a1.searchParams.get('state') : '') + '&client_info=' + b64u({ uid: UID, utid: TID }));
  m = await merker();
  const z = await p.evaluate(()=> ({ status: msGraphStatus, text: document.body.innerText, hash: location.hash }));
  pr('Rückkehr: neuer Schlüssel, Zeitpunkt erneuert, keine Fehlermeldung', log.token.length > tokVorher && log.token[tokVorher].get('code') === 'CODE-2' && z.status === 'angemeldet' && m && Date.now() - m.am < 120000 && !/Microsoft-Anmeldung:/.test(z.text) && !/code=/.test(z.hash), { m, status: z.status });
  const a2 = await umleitung();
  pr('Frische Anmeldung: keine weitere Umleitung', !a2, a2 && a2.search);
  await bereit();

  // Microsoft ohne Sitzung: Fehler login_required -> leise, weiter angemeldet, Pause
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'msal' });
  const a3 = await umleitung();
  await zurueck('error=login_required&error_description=' + encodeURIComponent('AADSTS50058: A silent sign-in request was sent but no user is signed in.') + '&state=' + encodeURIComponent(a3 ? a3.searchParams.get('state') : ''));
  m = await merker();
  const f = await p.evaluate(()=> ({ status: msGraphStatus, text: document.body.innerText }));
  pr('Stille Erneuerung abgelehnt: keine Fehlermeldung, weiter angemeldet, Fehlschlag gemerkt', !!a3 && f.status === 'angemeldet' && !/Microsoft-Anmeldung:/.test(f.text) && m && m.fehl > 0, { m, status: f.status });
  const a4 = await umleitung();
  pr('Nach Ablehnung: kein neuer Versuch beim nächsten Start', !a4, a4 && a4.search);
  await bereit();

  // Eingabe läuft (Feld hat den Fokus): keine Umleitung
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'msal' });
  const vorher = log.authorize.length;
  await p.addInitScript(()=>{ if(sessionStorage.getItem('test_fokus')) return; sessionStorage.setItem('test_fokus', '1'); document.addEventListener('DOMContentLoaded', ()=>{ const i = document.createElement('input'); i.id = 'testFeld'; document.body.appendChild(i); setInterval(()=>{ if(document.activeElement !== i && !document.querySelector('#appSperre:not([hidden])')) i.focus(); }, 50); setTimeout(()=> i.focus(), 0); }); });
  await p.goto(basis + SEITE); await bereit(); await p.waitForTimeout(4000);
  pr('Während einer Eingabe: keine Umleitung', log.authorize.length === vorher && !istMs(p.url()), log.authorize.length - vorher);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler.slice(0, 3));
  await c.close();
};
