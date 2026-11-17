// P3: Microsoft-Anmeldung im Datentresor und Zugriff nur auf den App-Ordner.
// Microsoft-Anmeldung (authorize/token) und OneDrive (Graph) sind nachgebildet. Geprüft wird:
//  - die bisherige Anmeldung der Microsoft-Bibliothek wird übernommen, ihre Klartext-Daten im Browser gelöscht
//  - App-Ordner in der Privatversion NICHT mehr angeboten: die Excel-Schnittstelle verlangt Zugriff aufs ganze OneDrive
//    (mit App-Ordner-Recht: 403 „Could not obtain a WAC access token“, beobachtet 17.11.2026)
//  - schon verschobene Ordner: Angebot zum Zurückverschieben; ein zweites Gerät erkennt das und meldet sich neu an
const { geraet, oeffnen, entsperren } = require('./hilfe');
const KLIENT = '579a39e0-b7fd-4c46-8684-af22e1bc45a2';
const { msKonto } = require('./ms_konto');
function onedrive(){
  // Elemente: id -> { name, eltern }
  const el = new Map([['ROOT', { name: '', eltern: null }], ['APPS', { name: 'Apps', eltern: 'ROOT' }], ['F1', { name: 'KVBW Onedrive', eltern: 'ROOT' }], ['F2', { name: 'einstellungen.ini', eltern: 'F1', inhalt: '[ARZT]\nNAME=Dr. Test\n' }]]);
  let approot = null; const log = [], scopes = [], konto = msKonto();
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
    { let x = a.id, drin = false; while(x){ if(x === approot){ drin = true; break; } x = (el.get(x) || {}).eltern; }
      const v = konto.pruefen(auth, drin || /^\/special\/approot/.test(p), /\/workbook\//.test(p)); if(v && (v[0] === 401 || /WAC/.test(JSON.stringify(v[1])))) return json(route, v[0], v[1]); }
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
    if(m === 'GET' && /^\/workbook\//.test(a.rest)) return json(route, 200, { value: [{ name: 'L+P' }] });
    if(m === 'GET' && a.rest === '/content' && it.inhalt != null) return route.fulfill({ status: 200, contentType: 'text/plain', body: it.inhalt });
    return json(route, 404, { error: { code: 'itemNotFound' } });
  }
  async function login(route){
    const q = route.request(), u = new URL(q.url());
    if(/\/authorize$/.test(u.pathname)){
      scopes.push('authorize: ' + u.searchParams.get('scope')); konto.authorize(u.searchParams.get('scope'));
      const zurueck = u.searchParams.get('redirect_uri').replace('https://seblussi.github.io/rechnung-mobil/', route.basis);
      return route.fulfill({ status: 302, headers: { location: zurueck + '?code=CODE123&state=' + encodeURIComponent(u.searchParams.get('state')) } });
    }
    if(/\/token$/.test(u.pathname)){
      const b = new URLSearchParams(q.postData() || ''); scopes.push(b.get('grant_type') + ': ' + b.get('scope'));
      const idt = 'x.' + Buffer.from(JSON.stringify({ name: 'Test Arzt', preferred_username: 'test@beispiel.de' })).toString('base64url') + '.y';
      const t = konto.token(b); if(t.status) return json(route, t.status, t);
      return json(route, 200, Object.assign(t, { id_token: idt }));
    }
    return json(route, 404, {});
  }
  return { el, graph, login, log, scopes, konto, wo: ()=>{ const f = el.get('F1'); return f.eltern === 'ROOT' ? 'Hauptordner' : f.eltern === approot ? 'App-Ordner' : f.eltern; } };
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
  pr('Hauptordner, Zugriff aufs ganze OneDrive', od.wo() === 'Hauptordner' && await A.evaluate(()=> !msAppOrdner() && /\/root:/.test(msGraphPfadUrl('KVBW Onedrive/x'))));
  await A.evaluate(async ()=>{ await ansichtEinstellungen(); await new Promise((r)=> setTimeout(r, 800)); });
  pr('Einstellungen: kein Angebot „In den App-Ordner verschieben“ mehr, kein Test-Schalter', await A.evaluate(()=> !document.getElementById('appOrdnerHin') && !document.getElementById('chkMsEigen') && /verschlüsselt im Datentresor/.test(document.body.textContent)));
  const lesen = (p, was)=> p.evaluate(async (was)=>{ const t = await msGraphTokenHolen(); if(!t) return 'kein Token';
    const r = await fetch(msGraphPfadUrl(was === 'excel' ? 'KVBW Onedrive/einstellungen.ini' : 'KVBW Onedrive/einstellungen.ini') + (was === 'excel' ? '/workbook/worksheets' : '/content'), { headers: { Authorization: 'Bearer ' + t } });
    return r.status + ' ' + (await r.text()).slice(0, 140); }, was);
  pr('Hauptordner: Datei und Excel-Schnittstelle erreichbar', /^200 \[ARZT\]/.test(await lesen(A, 'datei')) && /^200 /.test(await lesen(A, 'excel')));

  // ---- Stand wie beim Test am 17.11.2026: Ordner wurde mit v471–v476 in den App-Ordner verschoben (alter Ablauf) ----
  await A.evaluate(async ()=>{ localStorage.setItem('ms_ordner_aktion', 'hin'); sessionStorage.setItem('ms_scope_umzug', '1'); await Speicher.warten(); MsEigen.anmelden(); });
  await A.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(A); await angemeldet(A); await A.waitForTimeout(2500);
  await A.evaluate(()=>{ const o = document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe button'); if(o) o.click(); });
  pr('(Ausgangslage) Ordner im App-Ordner', od.wo() === 'App-Ordner' && await A.evaluate(()=> msAppOrdner()), od.wo());
  pr('im App-Ordner: Datei lesbar, Excel-Schnittstelle verweigert (403 WAC) – darum kein App-Ordner in der Privatversion', /^200 /.test(await lesen(A, 'datei')) && /^403 .*WAC/.test(await lesen(A, 'excel')), { datei: await lesen(A, 'datei'), excel: await lesen(A, 'excel') });

  // ---- Gerät B: anderes Gerät, Anmeldung fürs ganze OneDrive (Microsoft-Bibliothek) -> stellt sich auf den App-Ordner um ----
  const B = await neuesGeraet(browser, basis, od, true);
  await oeffnen(B, basis, { einrichten: true });
  await angemeldet(B); await B.waitForFunction(()=> msAppOrdner(), null, { timeout: 20000 }).catch(()=>{});
  const vorher = await lesen(B, 'datei');
  await B.waitForFunction(()=> /neue Microsoft-Anmeldung/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || ''), null, { timeout: 15000 }).catch(()=>{});
  const ueberB = await B.evaluate(()=> (document.querySelector('.beta-overlay.aktiv') || {}).textContent || '');
  pr('B: Anmeldung reicht nicht für den App-Ordner -> neue Anmeldung angeboten statt überall 401', vorher === 'kein Token' && /neue Microsoft-Anmeldung/.test(ueberB), { vorher, ueberB: ueberB.slice(0, 120), anmeldung: od.konto.protokoll.slice(-2) });
  od.scopes.length = 0;
  await B.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await B.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(B); await angemeldet(B); await B.waitForTimeout(2000);
  pr('B: neu angemeldet (nur App-Ordner), Datei lesbar', od.scopes.some((x)=> /^authorize: .*Files\.ReadWrite\.AppFolder/.test(x)) && /^200 \[ARZT\]/.test(await lesen(B, 'datei')), { scopes: od.scopes, datei: await lesen(B, 'datei') });
  const zurueckB = await B.evaluate(()=> /Ordner zurückverschieben/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || ''));
  pr('B: beim Start Angebot „Ordner zurückverschieben“', zurueckB);
  await B.evaluate(()=>{ const k = [...document.querySelectorAll('.beta-overlay.aktiv .beta-overlay-knoepfe button')].find((b)=> /Später/.test(b.textContent)); if(k) k.click(); });

  // ---- Gerät A: beim Start Angebot zum Zurückverschieben ----
  await A.reload(); await ladenUndEntsperren(A); await angemeldet(A);
  await A.waitForFunction(()=> /Ordner zurückverschieben/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || ''), null, { timeout: 15000 }).catch(()=>{});
  if(process.env.BILDER) await A.screenshot({ path: process.env.BILDER + '/4_app_ordner_zurueck.png' });
  pr('A: beim Start Angebot „Ordner zurückverschieben“ mit Begründung (Excel)', await A.evaluate(()=> /Excel-Schnittstelle/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || '')));
  od.scopes.length = 0;
  await A.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await A.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(A); await angemeldet(A); await A.waitForTimeout(2500);
  pr('A: Ordner wieder im Hauptordner (Kennung unverändert), App nutzt ihn dort', od.wo() === 'Hauptordner' && od.el.get('F2').eltern === 'F1' && await A.evaluate(()=> !msAppOrdner()), od.wo());
  await A.evaluate(()=>{ const o = document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe button'); if(o) o.click(); });
  pr('A: Datei und Excel-Schnittstelle wieder erreichbar', /^200 \[ARZT\]/.test(await lesen(A, 'datei')) && /^200 /.test(await lesen(A, 'excel')), { datei: await lesen(A, 'datei'), excel: await lesen(A, 'excel') });
  pr('A: Zurückverschieben steht im Sicherheitsprotokoll', await A.evaluate(async ()=> (await Tresor.protokollLesen()).some((e)=> /zurückverschoben/.test(e.text))));
  pr('A: keine Skriptfehler', A.fehler.length === 0, A.fehler.slice(0, 3));
  await A.context().close();

  // ---- Gerät B (Anmeldung nur für den App-Ordner): erkennt das Zurückverschieben, meldet sich neu an ----
  await B.reload(); await ladenUndEntsperren(B);
  await B.waitForFunction(()=> !msAppOrdner(), null, { timeout: 20000 }).catch(()=>{});
  await B.waitForFunction(()=> /Microsoft-Anmeldung erneuern/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || ''), null, { timeout: 15000 }).catch(()=>{});
  pr('B: erkennt den zurückverschobenen Ordner, bietet neue Anmeldung an', await B.evaluate(()=> !msAppOrdner() && /Microsoft-Anmeldung erneuern/.test((document.querySelector('.beta-overlay.aktiv') || {}).textContent || '')));
  await B.evaluate(()=> document.querySelector('.beta-overlay.aktiv .beta-overlay-knoepfe .btn-primaer').click());
  await B.waitForURL(/code=CODE123/, { timeout: 30000 });
  await ladenUndEntsperren(B); await angemeldet(B); await B.waitForTimeout(2000);
  pr('B: danach Datei und Excel-Schnittstelle erreichbar', /^200 \[ARZT\]/.test(await lesen(B, 'datei')) && /^200 /.test(await lesen(B, 'excel')), { datei: await lesen(B, 'datei'), excel: await lesen(B, 'excel') });
  pr('B: keine Skriptfehler', B.fehler.length === 0, B.fehler.slice(0, 3));
  await B.context().close();
};
