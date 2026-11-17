// Nachbildung der Microsoft-Anmeldung bei privaten Konten, soweit es für die App wichtig ist:
// Ein Langzeitschlüssel (Refresh Token) gilt nur für die Rechte, die bei SEINER Anmeldung beantragt wurden.
// Fordert die App beim Erneuern ein Recht an, das damals nicht dabei war, fehlt es im neuen Zugriffsschlüssel
// (Antwortfeld "scope") und OneDrive antwortet mit 401 – so am 17.11.2026 mit dem Testkonto beobachtet
// (weiteres Gerät, Ordner schon im App-Ordner: alle Prüfungen der Einrichtung „HTTP 401“).
const VOLL = 'Files.ReadWrite', APP = 'Files.ReadWrite.AppFolder';
// Anmeldungen aus der Zeit vor den Tests (Microsoft-Bibliothek): ganzes OneDrive
const STANDARD = ['openid', 'profile', 'offline_access', VOLL, 'User.Read'];
// Wie Microsoft genau reagiert, wenn beim Erneuern ein Recht ausserhalb der Anmeldung verlangt wird, ist nicht
// dokumentiert. Beide denkbaren Arten werden geprüft (Umgebungsvariable MS_MODUS):
//   'kuerzen'  (Standard): Schlüssel ohne das Recht, Antwortfeld "scope" ohne es -> OneDrive 401
//   'ablehnen': Fehler invalid_grant (die App bekam dann gar keinen Schlüssel und schickte „Bearer null“ -> 401)
function msKonto(){
  const modus = process.env.MS_MODUS || 'kuerzen';
  const rechte = new Map(); let nr = 0, letzte = null; const protokoll = [];
  const teile = (s)=> String(s || '').split(/\s+/).filter(Boolean);
  function authorize(scope){ letzte = teile(scope); protokoll.push('authorize: ' + scope); }
  // b: URLSearchParams des Token-Aufrufs -> Antwort (ohne id_token)
  function token(b){
    const gefragt = teile(b.get('scope'));
    const grund = b.get('grant_type') === 'authorization_code' ? (letzte || gefragt) : (rechte.get(b.get('refresh_token')) || STANDARD);
    const erteilt = gefragt.filter((s)=> grund.includes(s));
    protokoll.push(b.get('grant_type') + ': ' + b.get('scope') + ' -> ' + (modus === 'ablehnen' && erteilt.length < gefragt.length ? 'ABGELEHNT' : erteilt.join(' ')));
    if(modus === 'ablehnen' && erteilt.length < gefragt.length) return { status: 400, error: 'invalid_grant', error_description: 'AADSTS70000: The provided value for scope is not valid.' };
    const rt = 'RT-GEHEIM-' + (++nr); rechte.set(rt, grund);   // neuer Langzeitschlüssel behält die Rechte der Anmeldung
    return { access_token: 'AT ' + erteilt.join(' '), refresh_token: rt, scope: erteilt.filter((s)=> s !== 'openid' && s !== 'profile').join(' '), expires_in: 3600 };
  }
  // Zugriff auf OneDrive prüfen -> null (erlaubt) oder [status, body]
  // istExcel: Aufruf der Excel-Schnittstelle (…/workbook/…). Sie verlangt laut Microsoft Files.ReadWrite; mit dem
  // App-Ordner-Recht kommt "403 Could not obtain a WAC access token" (beobachtet 17.11.2026 mit dem Testkonto).
  function pruefen(auth, imAppOrdner, istExcel){
    const t = String(auth || '').replace(/^Bearer /, '');
    if(!t || t === 'null' || t === 'undefined') return [401, { error: { code: 'InvalidAuthenticationToken', message: 'Access token is empty.' } }];
    if(!/^AT /.test(t)) return null;   // von Tests selbst gesetzte Schlüssel
    const s = teile(t.slice(3));
    if(s.includes(VOLL)) return null;
    if(s.includes(APP)){
      if(!imAppOrdner) return [403, { error: { code: 'accessDenied', message: 'nur App-Ordner' } }];
      return istExcel ? [403, { error: { code: 'AccessDenied', message: 'Could not obtain a WAC access token.' } }] : null;
    }
    return [401, { error: { code: 'unauthenticated', message: "Must be authenticated to use '/drive' syntax" } }];
  }
  return { authorize, token, pruefen, protokoll, rechte };
}
module.exports = { msKonto, VOLL, APP };
