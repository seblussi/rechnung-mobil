// Automatische Erneuerung der Microsoft-Anmeldung (Wunsch 20.11.2026), eigene Anmeldung im Datentresor.
// Microsoft gibt Browser-Apps nur 24 h gültige Langzeitschlüssel. Ist die letzte Anmeldung 12 h oder mehr her, leitet
// die App beim Start VOR der Sperrseite still zu Microsoft um (prompt=none) und verarbeitet den Code nach dem Entsperren.
// Microsoft ist nachgebildet: Erfolg, Ablehnung (login_required), nicht erreichbar.
const { geraet, tresorEinrichten, entsperren } = require('./hilfe');
const SEITE = 'Rechnungserfassung_Mobil.html';

module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { echt: true });
  const c = p.context();
  const ms = { modus: 'ok', erreichbar: true, authorize: [], token: [], n: 0 };
  await c.route(/graph\.microsoft\.com/, (r)=> r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"itemNotFound"}}' }));
  await c.route(/login\.microsoftonline\.com/, async (r)=>{
    const u = new URL(r.request().url());
    const json = (st, o)=> r.fulfill({ status: st, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if(/openid-configuration$/.test(u.pathname)) return ms.erreichbar ? json(200, { issuer: 'x' }) : r.abort();
    if(/\/authorize$/.test(u.pathname)){
      ms.authorize.push(u);
      const zurueck = u.searchParams.get('redirect_uri').replace('https://seblussi.github.io/rechnung-mobil/', basis);
      const st = '&state=' + encodeURIComponent(u.searchParams.get('state'));
      const ziel = ms.modus === 'ok' ? zurueck + '?code=CODE-' + ms.authorize.length + st : zurueck + '?error=login_required&error_description=AADSTS50058' + st;
      return r.fulfill({ status: 302, headers: { location: ziel } });
    }
    if(/\/token$/.test(u.pathname)){
      const b = new URLSearchParams(r.request().postData() || ''); ms.token.push(b.get('grant_type')); ms.n++;
      const idt = 'x.' + Buffer.from(JSON.stringify({ name: 'Test Arzt', preferred_username: 'test@beispiel.de' })).toString('base64url') + '.y';
      return json(200, { access_token: 'AT-' + ms.n, refresh_token: 'RT-NEU-' + ms.n, id_token: idt, scope: 'Files.ReadWrite User.Read offline_access', expires_in: 3600 });
    }
    return json(404, {});
  });
  const laeuft = async ()=>{ await p.waitForFunction(()=> typeof msGraphStatus !== 'undefined' && msGraphStatus !== 'unbekannt' && typeof MsEigen !== 'undefined', null, { timeout: 60000 }); await p.waitForTimeout(800); };
  const merker = ()=> p.evaluate(()=> JSON.parse(localStorage.getItem('ms_erneuerung') || 'null'));
  const zustand = ()=> p.evaluate(()=> ({ rt: MsEigen.rtLesen(), status: msGraphStatus, url: location.search, text: document.body.innerText }));
  const setzeMerker = (o)=> p.evaluate((o)=> localStorage.setItem('ms_erneuerung', JSON.stringify(o)), o);
  const STD = 3600000;
  // neu laden; bei Umleitung zuerst Microsoft, dann zurück zur Sperrseite
  const neuLaden = async ()=>{ await p.goto(basis + SEITE); await entsperren(p); await laeuft(); };

  await p.goto(basis + SEITE); await tresorEinrichten(p); await laeuft();
  // angemeldet wie vor dieser Version: Langzeitschlüssel da, Zeitpunkt unbekannt
  await p.evaluate(async ()=>{ MsEigen.rtSchreiben('RT-ALT'); LS.set('ms_eigen_konto', { name: 'Test Arzt', username: 'test@beispiel.de' }); localStorage.removeItem('ms_erneuerung'); await Tresor.kvWarten(); });
  await neuLaden();
  let m = await merker();
  pr('Anmeldung ohne bekannten Zeitpunkt: beim Start keine Umleitung, aber zum Erneuern vorgemerkt', ms.authorize.length === 0 && m && m.am === 1 && m.art === 'eigen', { m, authorize: ms.authorize.length });

  // nächster Start: still zu Microsoft (prompt=none), danach EINMAL entsperren, neuer Schlüssel
  await neuLaden();
  m = await merker(); let z = await zustand();
  const a1 = ms.authorize[0];
  pr('Start: stille Umleitung vor der Sperrseite (prompt=none, PKCE, kein Kontoauswahl-Fenster)', !!a1 && a1.searchParams.get('prompt') === 'none' && a1.searchParams.get('code_challenge_method') === 'S256' && ms.authorize.length === 1, a1 && a1.search);
  const prot = await p.evaluate(async ()=> (await Tresor.protokollLesen()).map((e)=> e.text).join(' | '));
  pr('Rückkehr: Code eingelöst, neuer Langzeitschlüssel, Zeitpunkt gemerkt, im Sicherheitsprotokoll',
    ms.token.includes('authorization_code') && /^RT-NEU-/.test(z.rt) && m && Date.now() - m.am < 60000 && /automatisch erneuert/.test(prot) && z.status === 'angemeldet', { token: ms.token, rt: z.rt, m, prot: prot.slice(-200) });
  pr('Rückkehr: Code aus der Adresse entfernt, keine Fehlermeldung', !z.url && !/Microsoft-Anmeldung:/.test(z.text), z.url);

  // gleich nochmal starten: Anmeldung frisch -> keine Umleitung
  await neuLaden();
  pr('Frische Anmeldung (< 12 h): keine Umleitung', ms.authorize.length === 1, ms.authorize.length);

  // Microsoft hat keine Sitzung mehr: Fehler login_required -> leise, alter Schlüssel bleibt, 20 h Pause
  const codesVorher = ms.token.filter((g)=> g === 'authorization_code').length;
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'eigen' }); ms.modus = 'fehl';
  await neuLaden();
  m = await merker(); z = await zustand();
  pr('Stille Erneuerung abgelehnt: kein Fehlerfenster, bisheriger Schlüssel gilt weiter, angemeldet', ms.authorize.length === 2 && ms.token.filter((g)=> g === 'authorization_code').length === codesVorher && !!z.rt && z.status === 'angemeldet' && !/Microsoft-Anmeldung:/.test(z.text) && !z.url && m && m.fehl > 0, { n: ms.authorize.length, rt: z.rt, m });
  await neuLaden();
  pr('Nach Ablehnung: beim nächsten Start kein neuer Versuch (Pause)', ms.authorize.length === 2, ms.authorize.length);

  // Microsoft nicht erreichbar: keine Umleitung (die App bliebe sonst auf einer Fehlerseite hängen)
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'eigen' }); ms.modus = 'ok'; ms.erreichbar = false;
  await neuLaden();
  pr('Microsoft nicht erreichbar: keine Umleitung, Sperrseite wie gewohnt', ms.authorize.length === 2, ms.authorize.length);

  // abgebrochene Umleitung (Versuch vor < 10 min, keine Rückkehr): kein zweiter Versuch, keine Schleife
  ms.erreichbar = true;
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'eigen', versuch: Date.now() - 60000 });
  await neuLaden();
  pr('Kurz zuvor schon versucht: keine Schleife', ms.authorize.length === 2, ms.authorize.length);

  // Notausgang ?msal=alt (Bibliothek in dieser Sitzung): keine stille Umleitung der eigenen Anmeldung
  await setzeMerker({ am: Date.now() - 13 * STD, art: 'eigen' });
  await p.evaluate(()=> sessionStorage.setItem('msal_notfall', '1'));
  await neuLaden();
  pr('Notausgang aktiv: keine stille Umleitung', ms.authorize.length === 2, ms.authorize.length);
  await p.evaluate(()=> sessionStorage.removeItem('msal_notfall'));

  // Abmelden: nicht mehr erneuern
  await p.evaluate(()=> MsEigen.abmelden());
  pr('Abmelden: Merker gelöscht (keine Erneuerung mehr)', (await merker()) === null);
  // keine Konto- oder Schlüsseldaten im Klartext
  const klar = await p.evaluate(()=> localStorage.getItem('ms_erneuerung') + ' ' + Object.keys(localStorage).map((k)=> localStorage.getItem(k)).join(' '));
  pr('Kein Langzeitschlüssel und kein Konto im Klartext', !/RT-|test@beispiel/.test(klar));
  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await c.close();
};
