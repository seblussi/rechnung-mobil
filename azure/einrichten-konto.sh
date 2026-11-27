#!/usr/bin/env bash
# =====================================================================
# LetterXpress-Weiterleitung fuer die Rechnungs-App in Azure einrichten
# =====================================================================
# Aufruf in der Azure Cloud Shell (Bash) -- die App zeigt die passende Zeile an:
#   curl -fsSL <App-Adresse>/azure/einrichten.sh | bash -s -- <Herkunft der App>
#
# Mit zweitem Argument "konto" zusaetzlich das Guthabenkonto (Briefe ueber das LetterXpress-Konto des
# Betreibers, Aufladen per Stripe; Zugangsdaten werden verdeckt abgefragt):
#   bash einrichten.sh <Herkunft der App> konto
# Legt im EIGENEN Azure-Konto an (Rechenzentrum Frankfurt, germanywestcentral):
#   - Ressourcengruppe  "rechnung-weiterleitung"
#   - Speicherkonto     (wird von Azure Functions benoetigt, enthaelt keine Briefe)
#   - Funktions-App     (Flex-Verbrauchsplan, Node, ohne Application Insights)
# und spielt die kleine Weiterleitung ein. Sie reicht Anfragen der App nur an
# https://api.letterxpress.de durch, speichert nichts, protokolliert keine
# Inhalte und enthaelt keine Zugangsdaten. Erneutes Ausfuehren aktualisiert
# die bestehende Funktions-App (nichts wird doppelt angelegt).
# =====================================================================
set -euo pipefail
# Alles in einer Funktion: bash liest bei "curl | bash" so erst das ganze Skript ein.
haupt() {

RG="rechnung-weiterleitung"
ORT="germanywestcentral"
HERKUNFT="${1:-https://seblussi.github.io}"; case "$HERKUNFT" in https://*) ;; *) HERKUNFT="https://seblussi.github.io";; esac

echo
echo "== LetterXpress-Weiterleitung einrichten (Azure, Frankfurt) =="
echo

if ! az account show >/dev/null 2>&1; then
  echo "Kein Azure-Abonnement gefunden."
  echo "Ein normales Microsoft-Konto reicht nicht: zuerst ein kostenloses Azure-Konto anlegen"
  echo "  https://azure.microsoft.com/de-de/pricing/purchase-options/azure-account"
  echo "(mit demselben Microsoft-Konto anmelden, Kreditkarte nur zur Pruefung)."
  echo "Danach die Cloud Shell neu laden (https://shell.azure.com) und diese Zeile erneut ausfuehren."
  exit 1
fi
echo "Abonnement: $(az account show --query name -o tsv)"

echo "1/6 Dienste im Abonnement freischalten (beim ersten Mal 1-2 Minuten) ..."
for ns in Microsoft.Web Microsoft.Storage; do
  az provider register --namespace "$ns" --wait >/dev/null
done

echo "2/6 Ressourcengruppe $RG ..."
az group create -n "$RG" -l "$ORT" -o none

APP="$(az functionapp list -g "$RG" --query "[0].name" -o tsv 2>/dev/null || true)"
if [ -z "$APP" ]; then
  ZUFALL="$(head -c 64 /dev/urandom | tr -dc 'a-z0-9' | head -c 8)"
  SA="lxpw${ZUFALL}"
  APP="lxp-weiterleitung-${ZUFALL}"
  echo "3/6 Speicherkonto $SA ..."
  az storage account create -n "$SA" -g "$RG" -l "$ORT" --sku Standard_LRS \
     --min-tls-version TLS1_2 --allow-blob-public-access false -o none
  echo "4/6 Funktions-App $APP (Flex-Verbrauch, Node 22) ..."
  az functionapp create -g "$RG" -n "$APP" --storage-account "$SA" \
     --flexconsumption-location "$ORT" --runtime node --runtime-version 22 \
     --disable-app-insights true -o none
else
  echo "3/6 Vorhandene Funktions-App gefunden: $APP (wird aktualisiert)"
  echo "4/6 -"
fi

echo "5/6 Code einspielen ..."
TMP="$(mktemp -d)"
mkdir -p "$TMP/src/functions"
# --- Funktionscode: erzeugt aus azure/funktion/ von werkzeuge/azure_skript.js (hier nicht von Hand aendern) ---
mkdir -p "$TMP/src/functions" "$TMP/src"
cat > "$TMP/host.json" <<'EOF_DATEI'
{
  "version": "2.0",
  "logging": { "logLevel": { "default": "Warning" } },
  "extensionBundle": { "id": "Microsoft.Azure.Functions.ExtensionBundle", "version": "[4.*, 5.0.0)" }
}
EOF_DATEI
cat > "$TMP/package.json" <<'EOF_DATEI'
{
  "name": "lxp-weiterleitung",
  "version": "7.0.0",
  "main": "src/functions/*.js",
  "dependencies": { "@azure/functions": "^4.5.0", "@azure/data-tables": "^13.3.0", "@azure/storage-blob": "^12.26.0" }
}
EOF_DATEI
cat > "$TMP/src/functions/lxp.js" <<'EOF_DATEI'
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
  zugriffe: () => process.env.KONTO_SPEICHER ? require('../speicher').tabelle(process.env.KONTO_SPEICHER, 'zugriffe') : null,
  lxpGuthaben
});

app.http('lxp', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'v3/{*pfad}', handler: kern.lxp });
app.http('konto', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'konto/{aktion}', handler: kern.konto });
app.http('stripe', { methods: ['POST'], authLevel: 'anonymous', route: 'stripe/webhook', handler: kern.stripeWebhook });

// taeglich 03:30 UTC: Zugriffsprotokoll aelter als 7 Tage loeschen, Sicherung der Buchungen
app.timer('sicherung', {
  schedule: '0 30 3 * * *',
  handler: async (_t, context) => {
    if (!process.env.KONTO_SPEICHER) return;
    try { await kern.zugriffeAufraeumen(); } catch (e) { context.log('Zugriffe: Aufraeumen fehlgeschlagen'); }
    try {
      const sp = require('../speicher');
      const alle = await sp.tabelle(process.env.KONTO_SPEICHER, 'buchungen').alle();
      await sp.sichern(process.env.KONTO_SPEICHER, alle.map(({ etag, timestamp, ...e }) => e), Date.now());
    } catch (e) { context.log('Sicherung fehlgeschlagen'); }
  }
});
EOF_DATEI
cat > "$TMP/src/kern.js" <<'EOF_DATEI'
// Kern der Weiterleitung fuer die Rechnungs-App (Azure Function), Version 7
// Ohne Azure-Abhaengigkeiten, damit er lokal getestet werden kann (tests/azure_kern.js).
//
// 1) LetterXpress-Weiterleitung (wie Version 6): LetterXpress erlaubt keine direkten Aufrufe aus dem
//    Browser (CORS). Die Anfrage der App wird an https://api.letterxpress.de durchgereicht. Nur Anfragen
//    von der App-Adresse (ERLAUBTE_HERKUNFT), nur Pfade /v3/<name>[/<nummer>], "_methode" (PUT/DELETE)
//    im Inhalt -> Anfrage mit dieser Methode. "/v3/_version" meldet die Version, "/v3/_code" prueft nur
//    den Zugangscode. Pflicht: App-Einstellung ZUGANGSCODES (Komma-getrennt, "_zugang" im Inhalt).
//    Optional ERLAUBTE_LXP_NUTZER (Komma-getrennt): nur diese LetterXpress-Benutzer.
//
// 2) Guthabenkonto (neu in Version 7, nur wenn eingerichtet): Briefe laufen ueber das LetterXpress-Konto
//    des Betreibers (LXP_BENUTZER / LXP_APIKEY in den App-Einstellungen, nie in der App). Nutzer bleiben
//    anonym: die App erzeugt einen zufaelligen Schluessel ("_konto"), gespeichert wird nur dessen
//    SHA-256-Hash. Keine Namen, keine E-Mail, keine IP-Adressen. Gespeichert werden je Konto nur
//    Buchungen (Betrag, Zeit, Seitenzahl, Auftragsnummer) in Azure Table Storage (Tabelle "buchungen").
//    Das Guthaben ist die Summe der Buchungen. Aufladen ueber Stripe Checkout (Karte, SEPA, PayPal ...);
//    gutgeschrieben wird erst, wenn Stripe die Zahlung per signiertem Webhook bestaetigt (einmalig je
//    Zahlung). Vor dem Versand wird der Preis vorgemerkt; reicht das Guthaben nicht -> 402, nichts
//    wird verschickt. Lehnt LetterXpress ab, wird die Vormerkung wieder geloescht. Storno -> Gutschrift.
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');

const VERSION = 7;
const ZIEL = 'https://api.letterxpress.de';
const STRIPE = 'https://api.stripe.com';
const PAYPAL = { sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' };
const METHODEN = ['POST', 'PUT', 'DELETE'];
const MAX_AUFLADEN_CENT = 25000;          // Kleinbetragsrechnung (§ 33 UStDV): hoechstens 250 EUR je Beleg
const MAX_PDF_BASE64 = 20 * 1024 * 1024;  // ~15 MB PDF

function gleich(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function liste(s) { return String(s || '').split(',').map((x) => x.trim()).filter(Boolean); }
function ganz(s, std) { const n = parseInt(s, 10); return Number.isFinite(n) && n >= 0 ? n : std; }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// Seitenzahl eines PDF: Seitenobjekte zaehlen, auch in komprimierten Objektstroemen (pdf-lib speichert so).
function pdfSeiten(buf) {
  const s = buf.toString('latin1');
  const zaehle = (t) => (t.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  let n = zaehle(s);
  const re = /\/Type\s*\/ObjStm/g;
  let m;
  while ((m = re.exec(s))) {
    const st = s.indexOf('stream', m.index);
    if (st < 0) break;
    let a = st + 6;
    if (s[a] === '\r') a++;
    if (s[a] === '\n') a++;
    const e = s.indexOf('endstream', a);
    if (e < 0) break;
    try { n += zaehle(zlib.inflateSync(buf.subarray(a, e)).toString('latin1')); } catch (_) { /* nicht entpackbar */ }
    re.lastIndex = e;
  }
  return n;
}

// Stripe: Formular-Kodierung (verschachtelt) und Signaturpruefung des Webhooks
function formular(obj, vor, aus) {
  aus = aus || [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const key = vor ? vor + '[' + k + ']' : k;
    if (typeof v === 'object') formular(v, key, aus);
    else aus.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return aus.join('&');
}
function stripeSignaturOk(roh, kopf, geheim, jetztSek) {
  if (!kopf || !geheim) return false;
  let t = 0; const v1 = [];
  for (const teil of String(kopf).split(',')) {
    const i = teil.indexOf('='); if (i < 0) continue;
    const k = teil.slice(0, i).trim(), v = teil.slice(i + 1).trim();
    if (k === 't') t = parseInt(v, 10); else if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length || Math.abs(jetztSek - t) > 300) return false;
  const erw = crypto.createHmac('sha256', geheim).update(t + '.' + roh, 'utf8').digest('hex');
  return v1.some((s) => gleich(s, erw));
}

function lxpAuftragsnummer(j) {
  const d = j && j.data;
  if (!d) return '';
  const id = d.id || d.printjob_id || d.jid || (d.printjob && d.printjob.id) || (Array.isArray(d) && d[0] && d[0].id);
  return id ? String(id) : '';
}
function lxpOk(status, j) { return status >= 200 && status < 300 && !(j && j.status && +j.status >= 400); }

function erstelleKern(deps) {
  const env = deps.env || process.env;
  const holeFetch = () => deps.fetch || globalThis.fetch;
  const jetzt = deps.jetzt || (() => Date.now());
  const schlafen = deps.schlafen || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let speicherObj = null;
  const speicher = () => (speicherObj = speicherObj || (typeof deps.speicher === 'function' ? deps.speicher() : deps.speicher));

  const herkunftListe = () => liste(env.ERLAUBTE_HERKUNFT || 'https://seblussi.github.io');
  const codes = () => liste(env.ZUGANGSCODES);
  const preise = () => ({ brief: ganz(env.PREIS_BRIEF_CENT, 150), seite: ganz(env.PREIS_SEITE_CENT, 10), inklusiveSeiten: 1 });
  const betraege = () => liste(env.AUFLADE_BETRAEGE || '1000,2000,5000').map((x) => ganz(x, 0)).filter((x) => x >= 100 && x <= MAX_AUFLADEN_CENT);
  const stripeAn = () => !!(env.STRIPE_GEHEIM && env.STRIPE_WEBHOOK_GEHEIM);
  const paypalAn = () => !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_GEHEIM);
  const paypalBasis = () => (env.PAYPAL_MODUS === 'live' ? PAYPAL.live : PAYPAL.sandbox);
  const zahlarten = () => [].concat(paypalAn() ? ['paypal'] : [], stripeAn() ? ['stripe'] : []);
  const testmodus = () => (stripeAn() && /^sk_test_/.test(String(env.STRIPE_GEHEIM))) || (paypalAn() && env.PAYPAL_MODUS !== 'live');
  const kontoBereit = () => !!(env.LXP_BENUTZER && env.LXP_APIKEY && (stripeAn() || paypalAn()) && env.KONTO_SPEICHER);
  const firma = () => ({
    name: env.FIRMA_NAME || '', anschrift: env.FIRMA_ANSCHRIFT || '', steuernummer: env.FIRMA_STEUERNUMMER || '',
    ustSatz: ganz(env.UST_SATZ, 19), kleinunternehmer: /^(1|ja|true)$/i.test(String(env.KLEINUNTERNEHMER || ''))
  });

  // ---------- Schutz gegen Durchprobieren von Codes (nur im Arbeitsspeicher) ----------
  // je Absender (IP nur als gekuerzter Hash) jede weitere falsche Eingabe langsamer (0,5 s ... 15 s);
  // nach 10 Fehlversuchen in einer Stunde 1 Stunde Sperre; sehr viele insgesamt -> alle bremsen.
  const FEHL = new Map();
  const FEHL_FENSTER = 60 * 60 * 1000, FEHL_MAX = 10, SPERRE_MS = 60 * 60 * 1000;
  let fehlGesamt = [];
  function absender(request) {
    // X-Client-IP setzt Azure selbst; X-Forwarded-For nur als Rueckfall (erster Wert kommt vom Aufrufer).
    const ip = String(request.headers.get('x-client-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim().replace(/:\d+$/, '') || 'unbekannt';
    return sha('lxp|' + ip).slice(0, 16);
  }
  function aufraeumen(t) {
    for (const [k, v] of FEHL) if (t - v.seit > FEHL_FENSTER && (!v.sperreBis || v.sperreBis < t)) FEHL.delete(k);
    fehlGesamt = fehlGesamt.filter((x) => t - x < FEHL_FENSTER);
  }
  function gesperrt(id, t) {
    const v = FEHL.get(id);
    return v && v.sperreBis && v.sperreBis > t ? Math.ceil((v.sperreBis - t) / 60000) : 0;
  }
  async function fehlversuch(id, t, log) {
    let v = FEHL.get(id);
    if (!v || t - v.seit > FEHL_FENSTER) { v = { n: 0, seit: t, sperreBis: 0 }; FEHL.set(id, v); }
    v.n++; fehlGesamt.push(t);
    if (v.n >= FEHL_MAX) { v.sperreBis = t + SPERRE_MS; log('Zugangscode: Absender nach ' + v.n + ' Fehlversuchen fuer 1 Stunde gesperrt'); }
    let warte = Math.min(500 * Math.pow(2, v.n - 1), 15000);
    if (fehlGesamt.length > 100) { warte = Math.max(warte, 10000); if (fehlGesamt.length % 50 === 1) log('Zugangscode: auffaellig viele Fehlversuche insgesamt (' + fehlGesamt.length + '/h)'); }
    await schlafen(warte);
  }

  function corsKopf(herkunft) {
    const h = herkunftListe();
    return {
      'Access-Control-Allow-Origin': h.includes(herkunft) ? herkunft : h[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
  }
  function json(status, cors, daten, extra) {
    return { status, headers: { ...cors, 'Content-Type': 'application/json', ...(extra || {}) }, body: JSON.stringify(daten) };
  }
  const logVon = (context) => (m) => { try { (context && context.log ? context.log : console.log)(m); } catch (_) {} };

  // Gemeinsamer Anfang fuer App-Anfragen: Herkunft, Inhalt lesen, Zugangscode pruefen.
  // Gibt { antwort } (fertig, z. B. Fehler) oder { cors, daten, text } zurueck.
  async function eingang(request, context, geheimFeld, geheimListe) {
    const herkunft = request.headers.get('origin') || '';
    const cors = corsKopf(herkunft);
    if (request.method === 'OPTIONS') return { antwort: { status: 204, headers: cors } };
    if (!herkunftListe().includes(herkunft)) return { antwort: { status: 403, headers: cors, body: 'Nicht erlaubt' } };
    const text = await request.text();
    let daten = null;
    try { daten = JSON.parse(text); } catch (e) { daten = null; }
    const gueltig = geheimListe;
    if (!gueltig.length) return { antwort: json(503, cors, { status: 503, message: 'Die Weiterleitung hat keinen Zugangscode – bitte das Einrichtungsskript erneut ausführen.' }) };
    const t = jetzt(), id = absender(request);
    aufraeumen(t);
    const min = gesperrt(id, t);
    if (min) return { antwort: json(429, cors, { status: 429, message: 'Zu viele Fehlversuche. Bitte in ' + min + ' Minuten erneut versuchen.', minuten: min }, { 'Retry-After': String(min * 60) }) };
    const c = String((daten && typeof daten === 'object' && daten[geheimFeld]) || '');
    // Selbsttest der App schickt absichtlich einen falschen Code mit diesem Praefix: nicht als Fehlversuch zaehlen.
    if (c.startsWith('pruefung-falsch-') && !gueltig.some((x) => gleich(x, c))) return { antwort: json(403, cors, { status: 403, message: 'Zugangscode fehlt oder ist falsch.' }) };
    if (!c || !gueltig.some((x) => gleich(x, c))) { await fehlversuch(id, t, logVon(context)); return { antwort: json(403, cors, { status: 403, message: 'Zugangscode fehlt oder ist falsch.' }) }; }
    FEHL.delete(id);
    delete daten[geheimFeld];
    return { cors, daten, text: JSON.stringify(daten) };
  }

  // ---------- Konto ----------
  function kontoId(token) {
    const t = String(token || '');
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(t)) return '';
    return sha('konto|' + t);
  }
  async function buchungen(kid) {
    const alle = await speicher().partition(kid);
    return alle.map((e) => ({
      id: e.rowKey, art: e.art, betrag: +e.betrag || 0, zeit: e.zeit, seiten: +e.seiten || 0,
      ref: e.ref || '', status: e.status || 'ok', test: !!e.test
    })).sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
  }
  const saldo = (liste_) => liste_.reduce((s, b) => s + b.betrag, 0);
  function briefPreis(seiten, test) {
    if (test) return 0;
    const p = preise();
    return p.brief + Math.max(0, seiten - p.inklusiveSeiten) * p.seite;
  }
  function lxpAuth(test) {
    return { username: env.LXP_BENUTZER, apikey: env.LXP_APIKEY, mode: test || env.LXP_MODUS === 'test' ? 'test' : 'live' };
  }
  async function lxpWeiter(pfad, methode, daten) {
    const antwort = await holeFetch()(ZIEL + '/v3/' + pfad, {
      method: methode, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(daten)
    });
    const txt = await antwort.text();
    let j = null; try { j = JSON.parse(txt); } catch (_) {}
    return { status: antwort.status, txt, j, typ: antwort.headers.get('content-type') || 'application/json' };
  }
  function mitKonto(r, cors, zusatz) {
    if (r.j && typeof r.j === 'object') return json(r.status, cors, { ...r.j, konto: zusatz });
    return { status: r.status, headers: { ...cors, 'Content-Type': r.typ }, body: r.txt };
  }

  // Brief ueber das Betreiberkonto (Inhalt mit "_konto" statt "auth")
  async function kontoBrief(pfad, methode, daten, cors, log) {
    if (!kontoBereit()) return json(503, cors, { status: 503, message: 'Das Guthabenkonto ist an dieser Weiterleitung nicht eingerichtet.' });
    const kid = kontoId(daten._konto);
    if (!kid) return json(400, cors, { status: 400, message: 'Kontoschlüssel ungültig.' });
    const test = daten._modus === 'test';
    if (pfad === 'printjobs' && methode === 'POST') {
      const l = daten.letter;
      if (!l || typeof l.base64_file !== 'string' || !l.base64_file) return json(400, cors, { status: 400, message: 'Brief fehlt.' });
      if (l.base64_file.length > MAX_PDF_BASE64) return json(413, cors, { status: 413, message: 'Brief zu groß.' });
      const seiten = Math.max(1, pdfSeiten(Buffer.from(l.base64_file, 'base64')));
      const preis = briefPreis(seiten, test);
      const letter = {
        base64_file: l.base64_file, base64_file_checksum: l.base64_file_checksum, filename_original: String(l.filename_original || 'brief.pdf').slice(0, 120),
        specification: { color: '1', mode: 'simplex', shipping: 'national' }
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(l.dispatch_date || ''))) letter.dispatch_date = l.dispatch_date;
      // Preis vormerken, dann Guthaben pruefen (zwei gleichzeitige Briefe koennen so nie ueberziehen)
      const rk = 'b-' + new Date(jetzt()).toISOString().replace(/[^0-9]/g, '') + '-' + crypto.randomBytes(4).toString('hex');
      const vormerkung = { partitionKey: kid, rowKey: rk, art: 'brief', betrag: -preis, zeit: new Date(jetzt()).toISOString(), seiten, ref: '', status: 'vorgemerkt', test };
      await speicher().anlegen(vormerkung);
      const stand = saldo(await buchungen(kid));
      if (preis > 0 && stand < 0) {
        await speicher().loeschen(kid, rk);
        return json(402, cors, { status: 402, message: 'Das Guthaben reicht nicht für diesen Brief.', guthaben: stand + preis, preis, seiten });
      }
      let r;
      try { r = await lxpWeiter('printjobs', 'POST', { auth: lxpAuth(test), letter }); }
      catch (e) { await speicher().loeschen(kid, rk); log('LetterXpress nicht erreichbar'); return json(502, cors, { fehler: 'LetterXpress nicht erreichbar: ' + e.message }); }
      if (!lxpOk(r.status, r.j)) { await speicher().loeschen(kid, rk); return mitKonto(r, cors, { preis: 0, guthaben: stand + preis }); }
      await speicher().aendern({ partitionKey: kid, rowKey: rk, status: 'ok', ref: lxpAuftragsnummer(r.j) });
      return mitKonto(r, cors, { preis, seiten, guthaben: stand });
    }
    const m = /^printjobs\/([0-9]+)$/.exec(pfad);
    if (m && (methode === 'PUT' || methode === 'DELETE')) {
      const liste_ = await buchungen(kid);
      const b = liste_.find((x) => x.art === 'brief' && x.ref === m[1] && x.status === 'ok');
      if (!b) return json(403, cors, { status: 403, message: 'Dieser Auftrag gehört nicht zu diesem Konto.' });
      const inhalt = { auth: lxpAuth(b.test) };
      if (methode === 'PUT' && daten.letter && /^\d{4}-\d{2}-\d{2}$/.test(String(daten.letter.dispatch_date || ''))) inhalt.letter = { dispatch_date: daten.letter.dispatch_date };
      let r;
      try { r = await lxpWeiter(pfad, methode, inhalt); }
      catch (e) { log('LetterXpress nicht erreichbar'); return json(502, cors, { fehler: 'LetterXpress nicht erreichbar: ' + e.message }); }
      if (methode === 'DELETE' && lxpOk(r.status, r.j)) {
        await speicher().anlegen({ partitionKey: kid, rowKey: 's-' + m[1], art: 'storno', betrag: -b.betrag, zeit: new Date(jetzt()).toISOString(), seiten: 0, ref: m[1], status: 'ok', test: b.test });
        return mitKonto(r, cors, { gutschrift: -b.betrag, guthaben: saldo(await buchungen(kid)) });
      }
      return mitKonto(r, cors, { guthaben: saldo(liste_) });
    }
    return json(404, cors, { status: 404, message: 'Unbekannter Pfad' });
  }

  // ---------- /v3/... ----------
  async function lxp(request, context) {
    const log = logVon(context);
    const pfad = String((request.params && request.params.pfad) || '');
    if (request.method !== 'OPTIONS') {
      const herkunft = request.headers.get('origin') || '';
      if (herkunftListe().includes(herkunft) && !/^[a-z_]+(\/[0-9]+)?$/.test(pfad)) return { status: 404, headers: corsKopf(herkunft), body: 'Unbekannter Pfad' };
      if (herkunftListe().includes(herkunft) && pfad === '_version') {
        return json(200, corsKopf(herkunft), { weiterleitung: VERSION, methoden: METHODEN, zugangscode: codes().length > 0, konto: kontoBereit() });
      }
    }
    const e = await eingang(request, context, '_zugang', codes());
    if (e.antwort) return e.antwort;
    const { cors } = e;
    let { daten, text } = e;
    if (pfad === '_code') return json(200, cors, { ok: true });
    let methode = 'POST';
    if (daten && typeof daten === 'object') {
      if (daten._methode) { methode = String(daten._methode).toUpperCase(); delete daten._methode; text = JSON.stringify(daten); }
      if (!METHODEN.includes(methode)) return json(400, cors, { status: 400, message: 'Methode nicht erlaubt' });
      if (methode !== 'POST' && !/\/[0-9]+$/.test(pfad)) return json(400, cors, { status: 400, message: 'Auftragsnummer fehlt' });
      if ('_konto' in daten) {
        try { return await kontoBrief(pfad, methode, daten, cors, log); }
        catch (err) { log('Konto: Fehler beim Speicher'); return json(500, cors, { status: 500, message: 'Konto vorübergehend nicht erreichbar. Es wurde nichts verschickt oder abgebucht.' }); }
      }
      const erlaubt = liste(env.ERLAUBTE_LXP_NUTZER).map((s) => s.toLowerCase());
      if (erlaubt.length) {
        const nutzer = String((daten.auth && daten.auth.username) || '').trim().toLowerCase();
        if (!erlaubt.includes(nutzer)) return json(403, cors, { status: 403, message: 'Dieser LetterXpress-Benutzer ist für die Weiterleitung nicht freigegeben.' });
      }
    }
    try {
      const antwort = await holeFetch()(ZIEL + '/v3/' + pfad, {
        method: methode, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: text
      });
      return { status: antwort.status, headers: { ...cors, 'Content-Type': antwort.headers.get('content-type') || 'application/json' }, body: await antwort.text() };
    } catch (err) {
      log('LetterXpress nicht erreichbar'); // bewusst ohne Inhalte
      return json(502, cors, { fehler: 'LetterXpress nicht erreichbar: ' + err.message });
    }
  }

  // ---------- /konto/<aktion> ----------
  async function konto(request, context) {
    const log = logVon(context);
    const aktion = String((request.params && request.params.aktion) || '');
    const statistik = aktion === 'statistik';
    const e = await eingang(request, context, statistik ? 'schluessel' : '_zugang', statistik ? liste(env.STATISTIK_SCHLUESSEL) : codes());
    if (e.antwort) return e.antwort;
    const { cors, daten } = e;
    if (!kontoBereit()) return json(503, cors, { status: 503, message: 'Das Guthabenkonto ist an dieser Weiterleitung nicht eingerichtet.' });
    try {
      if (statistik) return json(200, cors, await statistikBerechnen(log));
      const kid = kontoId(daten && daten.token);
      if (!kid) return json(400, cors, { status: 400, message: 'Kontoschlüssel ungültig.' });
      if (aktion === 'stand') {
        const b = await buchungen(kid);
        return json(200, cors, {
          guthaben: saldo(b), buchungen: b.slice(0, 300).map(({ ref, ...x }) => ({ ...x, auftrag: ref && x.art !== 'aufladung' ? ref : '' })),
          preise: preise(), betraege: betraege(), firma: firma(), testmodus: testmodus(), zahlarten: zahlarten()
        });
      }
      if (aktion === 'aufladen') {
        const betrag = ganz(daten.betrag, 0);
        if (!betraege().includes(betrag)) return json(400, cors, { status: 400, message: 'Betrag nicht erlaubt.' });
        const zurueck = String(daten.zurueck || '').split('#')[0];
        if (!herkunftListe().some((h) => zurueck === h || zurueck.startsWith(h + '/'))) return json(400, cors, { status: 400, message: 'Rücksprungadresse nicht erlaubt.' });
        const art = daten.zahlart === 'paypal' ? 'paypal' : 'stripe';
        if (!zahlarten().includes(art)) return json(400, cors, { status: 400, message: 'Diese Zahlart ist nicht eingerichtet.' });
        if (art === 'paypal') {
          // PayPal direkt: Bestellung anlegen; abgebucht wird erst beim Abschluss nach der Rueckkehr (paypal-abschluss)
          const basis = zurueck.split('?')[0];
          const p = await paypalAnfrage('/v2/checkout/orders', 'POST', {
            intent: 'CAPTURE',
            purchase_units: [{ custom_id: kid, description: 'Guthaben Briefversand', amount: { currency_code: 'EUR', value: (betrag / 100).toFixed(2) } }],
            payment_source: { paypal: { experience_context: {
              return_url: basis + '?konto=paypal', cancel_url: basis + '#konto-abgebrochen',
              locale: 'de-DE', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', brand_name: (firma().name || 'Briefversand').slice(0, 127)
            } } }
          }, 'neu-' + kid.slice(0, 16) + '-' + jetzt());
          const link = p.j && Array.isArray(p.j.links) && p.j.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
          if (!p.ok || !link) { log('PayPal: Bestellung nicht angelegt (' + p.status + ')'); return json(502, cors, { status: 502, message: 'PayPal gerade nicht erreichbar.' }); }
          return json(200, cors, { url: link.href, bestellung: p.j.id });
        }
        const r = await holeFetch()(STRIPE + '/v1/checkout/sessions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.STRIPE_GEHEIM, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
          body: formular({
            mode: 'payment', locale: 'de', client_reference_id: kid,
            success_url: zurueck + '#konto-bezahlt', cancel_url: zurueck + '#konto-abgebrochen',
            line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: betrag, product_data: { name: 'Guthaben Briefversand' } } }],
            metadata: { konto: kid, betrag: betrag },
            payment_intent_data: { metadata: { konto: kid } }
          })
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || !j.url) { log('Stripe: Checkout nicht angelegt (' + r.status + ')'); return json(502, cors, { status: 502, message: 'Zahlungsseite gerade nicht erreichbar.' }); }
        return json(200, cors, { url: j.url });
      }
      if (aktion === 'paypal-abschluss') {
        if (!paypalAn()) return json(400, cors, { status: 400, message: 'PayPal ist nicht eingerichtet.' });
        const id = String(daten.bestellung || '');
        if (!/^[A-Z0-9]{8,40}$/.test(id)) return json(400, cors, { status: 400, message: 'Bestellnummer ungültig.' });
        const rk = 'p-' + id;
        const schon = (await speicher().partition(kid)).find((e) => e.rowKey === rk);
        if (schon) return json(200, cors, { ok: true, betrag: +schon.betrag, schon: true });
        const o = await paypalAnfrage('/v2/checkout/orders/' + id, 'GET');
        const pu = o.j && o.j.purchase_units && o.j.purchase_units[0];
        if (!o.ok || !pu || pu.custom_id !== kid) return json(403, cors, { status: 403, message: 'Diese Zahlung gehört nicht zu diesem Konto.' });
        let fertig = o.j.status === 'COMPLETED' ? o.j : null;
        if (!fertig) {
          if (o.j.status !== 'APPROVED') return json(409, cors, { status: 409, message: 'Die Zahlung wurde bei PayPal nicht bestätigt. Es wurde nichts abgebucht.' });
          const c = await paypalAnfrage('/v2/checkout/orders/' + id + '/capture', 'POST', {}, 'erfassen-' + id);
          if (!c.ok || !c.j || c.j.status !== 'COMPLETED') { log('PayPal: Abschluss fehlgeschlagen (' + c.status + ')'); return json(502, cors, { status: 502, message: 'PayPal hat die Zahlung nicht abgeschlossen. Es wurde nichts abgebucht.' }); }
          fertig = c.j;
        }
        const cap = (((fertig.purchase_units || [])[0] || {}).payments || {}).captures;
        const erfasst = Array.isArray(cap) && cap.find((x) => x.status === 'COMPLETED');
        const wert = erfasst ? erfasst.amount : pu.amount;
        const betrag = Math.round(parseFloat(wert && wert.value) * 100);
        if (!(betrag > 0) || (wert && wert.currency_code !== 'EUR')) return json(502, cors, { status: 502, message: 'PayPal-Antwort unvollständig.' });
        await speicher().anlegen({ partitionKey: kid, rowKey: rk, art: 'aufladung', betrag, zeit: new Date(jetzt()).toISOString(), seiten: 0, ref: id, status: 'ok', test: env.PAYPAL_MODUS !== 'live' });
        return json(200, cors, { ok: true, betrag });
      }
      return json(404, cors, { status: 404, message: 'Unbekannte Aktion' });
    } catch (err) {
      log('Konto: Fehler beim Speicher');
      return json(500, cors, { status: 500, message: 'Konto vorübergehend nicht erreichbar.' });
    }
  }

  // ---------- PayPal (REST v2, Zugang ueber Client-ID und Secret) ----------
  let ppToken = null;
  async function paypalAnfrage(pfad, methode, inhalt, anfrageId) {
    if (!ppToken || ppToken.bis < jetzt()) {
      const t = await holeFetch()(paypalBasis() + '/v1/oauth2/token', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_GEHEIM).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
      });
      const tj = await t.json().catch(() => null);
      if (!t.ok || !tj || !tj.access_token) return { ok: false, status: t.status, j: tj };
      ppToken = { wert: tj.access_token, bis: jetzt() + Math.max(60, (tj.expires_in || 300) - 60) * 1000 };
    }
    const kopf = { 'Authorization': 'Bearer ' + ppToken.wert, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    if (anfrageId) kopf['PayPal-Request-Id'] = anfrageId;   // Wiederholung -> keine doppelte Bestellung/Abbuchung
    const r = await holeFetch()(paypalBasis() + pfad, { method: methode, headers: kopf, body: inhalt === undefined ? undefined : JSON.stringify(inhalt) });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, j };
  }

  // ---------- /stripe/webhook ----------
  async function stripeWebhook(request, context) {
    const log = logVon(context);
    const roh = await request.text();
    if (!stripeSignaturOk(roh, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_GEHEIM, Math.floor(jetzt() / 1000))) {
      return { status: 400, body: 'Signatur ungueltig' };
    }
    let ev = null; try { ev = JSON.parse(roh); } catch (_) {}
    const s = ev && ev.data && ev.data.object;
    const bezahlt = ev && s && ((ev.type === 'checkout.session.completed' && s.payment_status === 'paid') || ev.type === 'checkout.session.async_payment_succeeded');
    if (!bezahlt) return { status: 200, body: 'ignoriert' };
    const kid = String((s.metadata && s.metadata.konto) || s.client_reference_id || '');
    const betrag = ganz(s.amount_total, 0);
    if (!/^[0-9a-f]{64}$/.test(kid) || !betrag || !s.id) { log('Stripe: Zahlung ohne Konto'); return { status: 200, body: 'ohne Konto' }; }
    try {
      // rowKey = Stripe-Sitzung -> jede Zahlung wird hoechstens einmal gutgeschrieben (Webhooks kommen ggf. mehrfach)
      await speicher().anlegen({ partitionKey: kid, rowKey: 'a-' + s.id, art: 'aufladung', betrag, zeit: new Date(jetzt()).toISOString(), seiten: 0, ref: s.id, status: 'ok', test: !s.livemode });
      return { status: 200, body: 'ok' };
    } catch (err) {
      log('Stripe: Gutschrift fehlgeschlagen');
      return { status: 500, body: 'spaeter erneut' };   // Stripe wiederholt
    }
  }

  // ---------- anonyme Statistik fuer den Betreiber ----------
  async function statistikBerechnen(log) {
    const alle = await speicher().alle();
    const monate = {}, konten = {};
    let vorgemerkt = 0;
    for (const e of alle) {
      const b = +e.betrag || 0, pk = e.partitionKey;
      // Pseudonym: gekuerzter Konto-Hash -- ohne den Schluessel des Nutzers keinem Menschen zuzuordnen
      const k = konten[pk] = konten[pk] || { pseudonym: pk.slice(0, 12), guthaben: 0, eingezahlt: 0, aufladungen: 0, briefe: 0, seiten: 0, briefumsatz: 0, stornos: 0, testbriefe: 0, seit: e.zeit, zuletzt: e.zeit, briefeJeMonat: {} };
      k.guthaben += b;
      if (String(e.zeit) < String(k.seit)) k.seit = e.zeit;
      if (String(e.zeit) > String(k.zuletzt)) k.zuletzt = e.zeit;
      if (e.status === 'vorgemerkt') vorgemerkt++;
      const mo = String(e.zeit || '').slice(0, 7) || '?';
      if (e.test) { if (e.art === 'brief') k.testbriefe++; continue; }
      const m = monate[mo] = monate[mo] || { monat: mo, aufladungen: 0, eingezahlt: 0, briefe: 0, seiten: 0, briefumsatz: 0, stornos: 0, konten: new Set() };
      m.konten.add(pk);
      if (e.art === 'aufladung') { m.aufladungen++; m.eingezahlt += b; k.aufladungen++; k.eingezahlt += b; }
      else if (e.art === 'brief') { m.briefe++; m.seiten += +e.seiten || 0; m.briefumsatz += -b; k.briefe++; k.seiten += +e.seiten || 0; k.briefumsatz += -b; k.briefeJeMonat[mo] = (k.briefeJeMonat[mo] || 0) + 1; }
      else if (e.art === 'storno') { m.stornos++; m.briefumsatz -= b; k.stornos++; k.briefumsatz -= b; k.briefeJeMonat[mo] = (k.briefeJeMonat[mo] || 0) - 1; }
    }
    let lxpGuthaben = null;
    try {
      if (deps.lxpGuthaben) lxpGuthaben = await deps.lxpGuthaben({ auth: lxpAuth(false) });
    } catch (_) { log('Statistik: LetterXpress-Guthaben nicht abrufbar'); }
    const liste_ = Object.values(konten).sort((a, b) => String(b.zuletzt).localeCompare(String(a.zuletzt)));
    return {
      stand: new Date(jetzt()).toISOString(),
      konten: liste_.length,
      guthabenSumme: liste_.reduce((x, k) => x + k.guthaben, 0),   // offenes Guthaben aller Nutzer (Verbindlichkeit)
      vorgemerkt, lxpGuthaben,
      monate: Object.values(monate).sort((a, b) => b.monat.localeCompare(a.monat)).map((m) => ({ ...m, konten: m.konten.size })),
      kontenDetail: liste_,
      zugriffe: await zugriffeAuswerten(log)
    };
  }

  // ---------- Zugriffsprotokoll (Sicherheit, z. B. Angriffe von einer IP) ----------
  // Je Stunde und IP-Adresse: Anzahl Anfragen, davon abgelehnt, Bereiche. Bewusst OHNE Konto-Bezug
  // (sonst waere das Pseudonym ueber die IP einer Person zuzuordnen). Aufbewahrung 7 Tage (Sicherung-Timer loescht).
  const INSTANZ = crypto.randomBytes(3).toString('hex');
  const zugr = { stunde: '', ips: new Map(), geschrieben: 0 };
  const stundeVon = (t) => new Date(t).toISOString().slice(0, 13).replace(/[^0-9]/g, '');
  let zugriffeObj;
  const zugriffeTab = () => (zugriffeObj !== undefined ? zugriffeObj : (zugriffeObj = (typeof deps.zugriffe === 'function' ? deps.zugriffe() : deps.zugriffe) || null));
  async function zugriffeSchreiben() {
    const tab = zugriffeTab(); if (!tab || !zugr.ips.size) return;
    const liste_ = [...zugr.ips.entries()];
    zugr.geschrieben = jetzt();
    await Promise.all(liste_.map(([ip, v]) => tab.ersetzen({
      partitionKey: zugr.stunde, rowKey: ip.replace(/[^0-9A-Fa-f.:]/g, '_').slice(0, 60) + '_' + INSTANZ,
      ip, anfragen: v.n, abgelehnt: v.ab, bereiche: [...v.bereiche].join(','), erste: v.erste, letzte: v.letzte
    }).catch(() => {})));
  }
  async function zugriffMerken(request, bereich, status) {
    try {
      const t = jetzt(), st = stundeVon(t);
      if (zugr.stunde && st !== zugr.stunde) { await zugriffeSchreiben(); zugr.ips.clear(); }
      zugr.stunde = st;
      const ip = String(request.headers.get('x-client-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim().replace(/:\d+$/, '') || 'unbekannt';
      const v = zugr.ips.get(ip) || { n: 0, ab: 0, bereiche: new Set(), erste: new Date(t).toISOString(), letzte: '' };
      v.n++; if (status >= 400) v.ab++; v.bereiche.add(bereich); v.letzte = new Date(t).toISOString();
      zugr.ips.set(ip, v);
      if (t - zugr.geschrieben > 60000 || v.n === 1) await zugriffeSchreiben();
    } catch (_) { /* Protokoll darf nie den Dienst stoeren */ }
  }
  async function zugriffeAuswerten(log) {
    const tab = zugriffeTab(); if (!tab) return null;
    try {
      await zugriffeSchreiben();
      const zeilen = await tab.abPartition(stundeVon(jetzt() - 24 * 3600 * 1000));
      const je = {};
      for (const z of zeilen) {
        const x = je[z.ip] = je[z.ip] || { ip: z.ip, anfragen: 0, abgelehnt: 0, bereiche: new Set(), letzte: '' };
        x.anfragen += +z.anfragen || 0; x.abgelehnt += +z.abgelehnt || 0;
        String(z.bereiche || '').split(',').filter(Boolean).forEach((b) => x.bereiche.add(b));
        if (String(z.letzte) > x.letzte) x.letzte = z.letzte;
      }
      const alle = Object.values(je).sort((a, b) => b.anfragen - a.anfragen);
      return { zeitraum: '24 Stunden', ipAdressen: alle.length, anfragen: alle.reduce((x, a) => x + a.anfragen, 0), abgelehnt: alle.reduce((x, a) => x + a.abgelehnt, 0),
        top: alle.slice(0, 25).map((a) => ({ ...a, bereiche: [...a.bereiche].join(', ') })) };
    } catch (_) { log('Statistik: Zugriffe nicht lesbar'); return null; }
  }
  async function zugriffeAufraeumen() {
    const tab = zugriffeTab(); if (tab) await tab.loeschenVor(stundeVon(jetzt() - 7 * 24 * 3600 * 1000));
  }
  const mitProtokoll = (bereich, fn) => async (request, context) => {
    const r = await fn(request, context);
    if (request.method !== 'OPTIONS') await zugriffMerken(request, bereich, r && r.status || 200);
    return r;
  };

  return { lxp: mitProtokoll('briefe', lxp), konto: mitProtokoll('konto', konto), stripeWebhook: mitProtokoll('stripe', stripeWebhook), zugriffeAufraeumen, _intern: { pdfSeiten, stripeSignaturOk, formular, kontoId } };
}

module.exports = { erstelleKern, pdfSeiten, stripeSignaturOk, formular, VERSION };
EOF_DATEI
cat > "$TMP/src/speicher.js" <<'EOF_DATEI'
// Azure Table Storage fuer das Guthabenkonto (Tabelle "buchungen"; PartitionKey = Konto-Hash).
'use strict';
const { TableClient, odata } = require('@azure/data-tables');

function tabelle(verbindung, name) {
  let client = null, bereit = null;
  async function c() {
    if (!verbindung) throw new Error('Kein Speicher eingerichtet (KONTO_SPEICHER)');
    if (!client) client = TableClient.fromConnectionString(verbindung, name);
    if (!bereit) bereit = client.createTable().catch((e) => { if (e && e.statusCode === 409) return; bereit = null; throw e; });
    await bereit;
    return client;
  }
  async function sammeln(it) { const aus = []; for await (const e of it) aus.push(e); return aus; }
  return {
    // true = angelegt, false = gab es schon (so wird z. B. jede Zahlung nur einmal gutgeschrieben)
    async anlegen(e) {
      const t = await c();
      try { await t.createEntity(e); return true; } catch (err) { if (err && err.statusCode === 409) return false; throw err; }
    },
    async partition(pk) { const t = await c(); return sammeln(t.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${pk}` } })); },
    async alle() { const t = await c(); return sammeln(t.listEntities()); },
    async aendern(e) { const t = await c(); await t.updateEntity(e, 'Merge'); },
    async ersetzen(e) { const t = await c(); await t.upsertEntity(e, 'Replace'); },
    async abPartition(pk) { const t = await c(); return sammeln(t.listEntities({ queryOptions: { filter: odata`PartitionKey ge ${pk}` } })); },
    async loeschenVor(pk) {
      const t = await c();
      for (const e of await sammeln(t.listEntities({ queryOptions: { filter: odata`PartitionKey lt ${pk}`, select: ['PartitionKey', 'RowKey'] } }))) {
        try { await t.deleteEntity(e.partitionKey, e.rowKey); } catch (err) { if (!(err && err.statusCode === 404)) throw err; }
      }
    },
    async loeschen(pk, rk) {
      const t = await c();
      try { await t.deleteEntity(pk, rk); } catch (err) { if (!(err && err.statusCode === 404)) throw err; }
    }
  };
}
module.exports = { tabelle };

// Taegliche Sicherung aller Buchungen als JSON in den Blob-Container "sicherung" (90 Tage aufbewahrt).
async function sichern(verbindung, buchungen, jetzt) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const c = BlobServiceClient.fromConnectionString(verbindung).getContainerClient('sicherung');
  await c.createIfNotExists();
  const tag = new Date(jetzt).toISOString().slice(0, 10);
  const inhalt = JSON.stringify({ stand: new Date(jetzt).toISOString(), buchungen });
  await c.getBlockBlobClient('buchungen-' + tag + '.json').upload(inhalt, Buffer.byteLength(inhalt), { blobHTTPHeaders: { blobContentType: 'application/json' } });
  const grenze = 'buchungen-' + new Date(jetzt - 90 * 864e5).toISOString().slice(0, 10);
  for await (const b of c.listBlobsFlat({ prefix: 'buchungen-' })) if (b.name < grenze) await c.deleteBlob(b.name);
}
module.exports.sichern = sichern;
EOF_DATEI
# --- Ende Funktionscode ---
( cd "$TMP" && if command -v zip >/dev/null; then zip -qr paket.zip package.json host.json src; else python3 -c "import zipfile,os; z=zipfile.ZipFile('paket.zip','w'); [z.write(os.path.join(d,f)) for d0 in ['package.json','host.json','src'] for d,_,fs in (os.walk(d0) if os.path.isdir(d0) else [('.',[],[d0])]) for f in fs]; z.close()"; fi )
az functionapp deployment source config-zip -g "$RG" -n "$APP" --src "$TMP/paket.zip" --build-remote true -o none
az functionapp cors add -g "$RG" -n "$APP" --allowed-origins "$HERKUNFT" -o none 2>/dev/null || true
az functionapp config appsettings set -g "$RG" -n "$APP" --settings "ERLAUBTE_HERKUNFT=$HERKUNFT" -o none
# nur verschluesselte Verbindungen (HTTPS), TLS 1.2+
az functionapp update -g "$RG" -n "$APP" --set httpsOnly=true -o none 2>/dev/null || true
az functionapp config set -g "$RG" -n "$APP" --min-tls-version 1.2 -o none 2>/dev/null || true
rm -rf "$TMP"

# Adresse der Funktions-App: bei Flex-Verbrauch steht sie nicht immer in defaultHostName
# (dann leer -> frueher "https:///api"). Mehrere Stellen abfragen, notfalls kurz warten.
HOST=""
for i in $(seq 1 12); do
  for Q in defaultHostName "properties.defaultHostName" "hostNames[0]" "enabledHostNames[0]"; do
    H="$(az functionapp show -g "$RG" -n "$APP" --query "$Q" -o tsv 2>/dev/null | tr -d '\r' || true)"
    case "$H" in *.azurewebsites.net) HOST="$H"; break;; esac
  done
  [ -z "$HOST" ] && HOST="$(az resource show -g "$RG" -n "$APP" --resource-type Microsoft.Web/sites --query properties.defaultHostName -o tsv 2>/dev/null | tr -d '\r' || true)"
  case "$HOST" in *.azurewebsites.net) break;; *) HOST=""; sleep 10;; esac
done
if [ -z "$HOST" ]; then
  echo "Die Adresse der Funktions-App liess sich nicht ermitteln. Im Azure-Portal unter"
  echo "Funktions-App '$APP' > Uebersicht steht die 'Standarddomaene' - diese mit /api am Ende eintragen."
  exit 1
fi
URL="https://${HOST}/api"

# Zugangscode ist Pflicht (Version 6): fehlt er, einen anlegen und am Ende anzeigen. Vorhandene Codes bleiben.
CODES="$(az functionapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='ZUGANGSCODES'].value | [0]" -o tsv 2>/dev/null | tr -d '\r' || true)"
NEUER_CODE=""
if [ -z "$CODES" ]; then
  NEUER_CODE="w$(openssl rand -hex 2)-$(openssl rand -hex 2)-$(openssl rand -hex 2)"
  echo "   Zugangscode anlegen ..."
  az functionapp config appsettings set -g "$RG" -n "$APP" --settings "ZUGANGSCODES=$NEUER_CODE" -o none
fi

# ---------------------------------------------------------------------
# Guthabenkonto (nur mit zweitem Argument "konto", z. B.: bash einrichten.sh <Herkunft> konto)
# Fragt die Zugangsdaten hier in der Cloud Shell ab (verdeckte Eingabe) und legt sie als
# App-Einstellungen ab -- sie stehen nie in der App und nie in diesem Skript.
# Enter ohne Eingabe = vorhandenen Wert behalten.
# ---------------------------------------------------------------------
# Tabellenspeicher fuer Zugriffsprotokoll (7 Tage, Sicherheit) und Guthabenkonto
if [ -z "$(az functionapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='KONTO_SPEICHER'].value | [0]" -o tsv 2>/dev/null | tr -d '\r')" ]; then
  SA_NAME="$(az storage account list -g "$RG" --query "[?starts_with(name,'lxpw')].name | [0]" -o tsv | tr -d '\r')"
  [ -n "$SA_NAME" ] && az functionapp config appsettings set -g "$RG" -n "$APP" --settings "KONTO_SPEICHER=$(az storage account show-connection-string -g "$RG" -n "$SA_NAME" --query connectionString -o tsv | tr -d '\r')" -o none
fi
STAT_NEU=""
if [ "${2:-}" = "konto" ] || [ "${1:-}" = "konto" ] || [ "${KONTO:-}" = "1" ]; then
  echo "   Guthabenkonto einrichten ..."
  einst() { az functionapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='$1'].value | [0]" -o tsv 2>/dev/null | tr -d '\r' || true; }
  setzen() { az functionapp config appsettings set -g "$RG" -n "$APP" --settings "$1=$2" -o none; }
  frage() { # frage NAME "Text" verdeckt(0/1) Standard
    local alt; alt="$(einst "$1")"; local ein=""
    local hinweis=""; [ -n "$alt" ] && hinweis=" [Enter = behalten]"; [ -z "$alt" ] && [ -n "${4:-}" ] && hinweis=" [Enter = ${4}]"
    if [ "$3" = "1" ]; then read -r -s -p "   $2$hinweis: " ein < /dev/tty; echo; else read -r -p "   $2$hinweis: " ein < /dev/tty; fi
    if [ -n "$ein" ]; then setzen "$1" "$ein"; elif [ -z "$alt" ] && [ -n "${4:-}" ]; then setzen "$1" "$4"; fi
  }
  frage LXP_BENUTZER "LetterXpress-Benutzername" 0
  frage LXP_APIKEY "LetterXpress-API-Key" 1
  frage LXP_MODUS "LetterXpress-Modus fuer echte Briefe (live oder test)" 0 live
  echo "   Zahlarten: Stripe (Karte, SEPA, Apple/Google Pay) und/oder PayPal direkt -- nicht gewuenschtes einfach mit Enter ueberspringen."
  frage STRIPE_GEHEIM "Stripe Secret Key (sk_test_... zum Ausprobieren, sk_live_... echt)" 1
  frage PAYPAL_CLIENT_ID "PayPal Client-ID (developer.paypal.com > Apps & Credentials)" 0
  frage PAYPAL_GEHEIM "PayPal Secret" 1
  frage PAYPAL_MODUS "PayPal-Modus (sandbox zum Ausprobieren oder live)" 0 sandbox
  frage PREIS_BRIEF_CENT "Preis je Brief inkl. 1 Seite in Cent" 0 150
  frage PREIS_SEITE_CENT "Preis je weitere Seite in Cent" 0 10
  frage AUFLADE_BETRAEGE "Aufladebetraege in Cent, Komma-getrennt (hoechstens 25000)" 0 "1000,2000,5000"
  frage FIRMA_NAME "Firmenname fuer die Belege" 0
  frage FIRMA_ANSCHRIFT "Firmenanschrift fuer die Belege (eine Zeile)" 0
  frage UST_SATZ "Umsatzsteuersatz in Prozent" 0 19
  # Stripe-Webhook (Zahlungsbestaetigung) automatisch anlegen -- neu, wenn der Schluessel von test auf live wechselt
  SK="$(einst STRIPE_GEHEIM)"; ART="$(echo "$SK" | cut -d_ -f1-2)"
  if [ -n "$SK" ] && { [ -z "$(einst STRIPE_WEBHOOK_GEHEIM)" ] || [ "$(einst STRIPE_WEBHOOK_FUER)" != "$ART" ]; }; then
    WH="$(curl -s https://api.stripe.com/v1/webhook_endpoints -u "$SK:" \
      --data-urlencode "url=https://${HOST}/api/stripe/webhook" \
      -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded" \
      -d "description=Rechnungs-App Guthaben" || true)"
    WHS="$(echo "$WH" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("secret",""))' 2>/dev/null || true)"
    if [ -n "$WHS" ]; then setzen STRIPE_WEBHOOK_GEHEIM "$WHS"; setzen STRIPE_WEBHOOK_FUER "$ART"; echo "   Stripe-Webhook angelegt."
    else echo "   Stripe-Webhook konnte nicht angelegt werden (Schluessel pruefen):"; echo "$WH" | head -c 300; echo; fi
  fi
  if [ -z "$(einst STATISTIK_SCHLUESSEL)" ]; then
    STAT_NEU="s$(openssl rand -hex 12)"; setzen STATISTIK_SCHLUESSEL "$STAT_NEU"
  fi
fi

echo "6/6 Selbsttest ..."
OK=""
for i in $(seq 1 20); do
  ANTWORT="$(curl -s -m 30 -X POST -H "Origin: $HERKUNFT" -H 'Content-Type: application/json' -d '{}' "$URL/v3/_version" || true)"
  if echo "$ANTWORT" | grep -q '"weiterleitung":7'; then OK=1; break; fi
  sleep 10
done

echo
echo "=================================================================="
if [ -n "$OK" ]; then
  echo " FERTIG - die Weiterleitung laeuft."
else
  echo " Eingerichtet, aber der Selbsttest hat noch nicht geantwortet."
  echo " (Manchmal braucht Azure ein paar Minuten - in der App einfach"
  echo "  spaeter nochmal auf 'Pruefen' klicken.)"
fi
echo
# eine Zeile fuer die App: Adresse mit Zugangscode (die App trennt beides selbst)
CODE_ZEILE="${NEUER_CODE:-${CODES%%,*}}"
echo " Diese EINE Zeile in der App eintragen (Adresse mit Zugangscode):"
echo
echo "   $URL#$CODE_ZEILE"
echo
if [ -n "$STAT_NEU" ]; then
  echo " Schluessel fuer die anonyme Statistik (nur fuer dich, gut aufheben):"
  echo "   $STAT_NEU"
  echo
fi
echo " Weitere Codes (z. B. je Geraet): Azure-Portal > Funktions-App '$APP'"
echo " > Umgebungsvariablen > ZUGANGSCODES, durch Komma getrennt."
echo "=================================================================="
}
haupt "$@"
