// =====================================================================
// LetterXpress-Weiterleitung fuer die Rechnungs-App (Azure Function)
// =====================================================================
// LetterXpress erlaubt keine direkten Aufrufe aus dem Browser (CORS). Diese
// Funktion nimmt die Anfrage der App entgegen und reicht sie unveraendert an
// https://api.letterxpress.de weiter. Sie speichert NICHTS, protokolliert
// keine Inhalte und enthaelt KEINE Zugangsdaten: Benutzername und API-Key
// schickt die App wie bisher die HTA bei jedem Aufruf selbst mit.
//
// Schutz: Es werden nur Anfragen von der eigenen App-Adresse angenommen und
// nur an LetterXpress-Pfade der Form /v3/... weitergeleitet.
//
// Adresse fuer die App:  https://<Standarddomaene der Funktions-App>/api
// (die App haengt selbst "/v3/printjobs" an)

const { app } = require('@azure/functions');

const ZIEL = 'https://api.letterxpress.de';
const ERLAUBTE_HERKUNFT = ['https://seblussi.github.io'];

function corsKopf(herkunft) {
  return {
    'Access-Control-Allow-Origin': ERLAUBTE_HERKUNFT.includes(herkunft) ? herkunft : ERLAUBTE_HERKUNFT[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

app.http('lxp', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'v3/{*pfad}',
  handler: async (request, context) => {
    const herkunft = request.headers.get('origin') || '';
    const cors = corsKopf(herkunft);

    if (request.method === 'OPTIONS') return { status: 204, headers: cors };
    if (!ERLAUBTE_HERKUNFT.includes(herkunft)) return { status: 403, headers: cors, body: 'Nicht erlaubt' };

    const pfad = String((request.params && request.params.pfad) || '');
    if (!/^[a-z_]+(\/[0-9]+)?$/.test(pfad)) return { status: 404, headers: cors, body: 'Unbekannter Pfad' };

    try {
      const antwort = await fetch(ZIEL + '/v3/' + pfad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: await request.text()
      });
      return {
        status: antwort.status,
        headers: { ...cors, 'Content-Type': antwort.headers.get('content-type') || 'application/json' },
        body: await antwort.text()
      };
    } catch (e) {
      context.log('LetterXpress nicht erreichbar'); // bewusst ohne Inhalte
      return {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fehler: 'LetterXpress nicht erreichbar: ' + e.message })
      };
    }
  }
});
