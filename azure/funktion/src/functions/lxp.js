// Azure-Anbindung der Weiterleitung (Version 7). Die Logik steht in ../kern.js.
'use strict';
const { app } = require('@azure/functions');
const https = require('https');
const { erstelleKern } = require('../kern');

// LetterXpress-Guthaben des Betreiberkontos (nur fuer die Statistik): GET mit JSON-Inhalt
function lxpGuthaben(inhalt) {
  return new Promise((ok, fehler) => {
    const body = JSON.stringify(inhalt);
    const req = https.request('https://api.letterxpress.de/v3/balance', {
      method: 'GET', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000
    }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (d) => { t += d; });
      res.on('end', () => { try { const j = JSON.parse(t); ok(j && j.data ? j.data : j); } catch (e) { fehler(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('Zeitueberschreitung')));
    req.on('error', fehler);
    req.end(body);
  });
}

const kern = erstelleKern({
  env: process.env,
  speicher: () => process.env.KONTO_SPEICHER ? require('../speicher').tabelle(process.env.KONTO_SPEICHER, 'buchungen') : null,
  lxpGuthaben
});

app.http('lxp', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'v3/{*pfad}', handler: kern.lxp });
app.http('konto', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'konto/{aktion}', handler: kern.konto });
app.http('stripe', { methods: ['POST'], authLevel: 'anonymous', route: 'stripe/webhook', handler: kern.stripeWebhook });

// taeglich 03:30 UTC: Sicherung der Buchungen (nur wenn das Guthabenkonto eingerichtet ist)
app.timer('sicherung', {
  schedule: '0 30 3 * * *',
  handler: async (_t, context) => {
    if (!process.env.KONTO_SPEICHER) return;
    try {
      const sp = require('../speicher');
      const alle = await sp.tabelle(process.env.KONTO_SPEICHER, 'buchungen').alle();
      await sp.sichern(process.env.KONTO_SPEICHER, alle.map(({ etag, timestamp, ...e }) => e), Date.now());
    } catch (e) { context.log('Sicherung fehlgeschlagen'); }
  }
});
