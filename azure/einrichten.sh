#!/usr/bin/env bash
# =====================================================================
# LetterXpress-Weiterleitung fuer die Rechnungs-App in Azure einrichten
# =====================================================================
# Aufruf in der Azure Cloud Shell (Bash):
#   curl -fsSL https://seblussi.github.io/rechnung-mobil/azure/einrichten.sh | bash
#
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
HERKUNFT="https://seblussi.github.io"

echo
echo "== LetterXpress-Weiterleitung einrichten (Azure, Frankfurt) =="
echo

if ! az account show >/dev/null 2>&1; then
  echo "Nicht bei Azure angemeldet. Bitte in der Azure Cloud Shell ausfuehren (https://shell.azure.com)."
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
cat > "$TMP/package.json" <<'EOF'
{
  "name": "lxp-weiterleitung",
  "version": "2.0.0",
  "main": "src/functions/*.js",
  "dependencies": { "@azure/functions": "^4.5.0" }
}
EOF
cat > "$TMP/host.json" <<'EOF'
{
  "version": "2.0",
  "logging": { "logLevel": { "default": "Warning" } },
  "extensionBundle": { "id": "Microsoft.Azure.Functions.ExtensionBundle", "version": "[4.*, 5.0.0)" }
}
EOF
cat > "$TMP/src/functions/lxp.js" <<'EOF'
// LetterXpress-Weiterleitung fuer die Rechnungs-App (Azure Function), Version 2
// LetterXpress erlaubt keine direkten Aufrufe aus dem Browser (CORS). Diese
// Funktion reicht die Anfrage der App unveraendert an https://api.letterxpress.de
// weiter. Sie speichert NICHTS, protokolliert keine Inhalte und enthaelt KEINE
// Zugangsdaten: Benutzername und API-Key schickt die App bei jedem Aufruf mit.
// Nur Anfragen von der App-Adresse, nur Pfade /v3/<name>[/<nummer>].
// "_methode" (PUT/DELETE) im Inhalt -> Anfrage mit dieser Methode (Brief
// verschieben/stornieren). "/v3/_version" meldet die Version.
// Optional: App-Einstellung ERLAUBTE_LXP_NUTZER (Komma-getrennt) -> nur diese
// LetterXpress-Benutzer werden weitergeleitet.
const { app } = require('@azure/functions');

const ZIEL = 'https://api.letterxpress.de';
const ERLAUBTE_HERKUNFT = ['https://seblussi.github.io'];
const VERSION = 2;
const METHODEN = ['POST', 'PUT', 'DELETE'];

function corsKopf(herkunft) {
  return {
    'Access-Control-Allow-Origin': ERLAUBTE_HERKUNFT.includes(herkunft) ? herkunft : ERLAUBTE_HERKUNFT[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(status, cors, daten) {
  return { status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(daten) };
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
    if (pfad === '_version') return json(200, cors, { weiterleitung: VERSION, methoden: METHODEN });

    let text = await request.text();
    let methode = 'POST';
    let daten = null;
    try { daten = JSON.parse(text); } catch (e) { daten = null; }
    if (daten && typeof daten === 'object') {
      if (daten._methode) {
        methode = String(daten._methode).toUpperCase();
        delete daten._methode;
        text = JSON.stringify(daten);
      }
      const erlaubt = String(process.env.ERLAUBTE_LXP_NUTZER || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (erlaubt.length) {
        const nutzer = String((daten.auth && daten.auth.username) || '').trim().toLowerCase();
        if (!erlaubt.includes(nutzer)) return json(403, cors, { status: 403, message: 'Dieser LetterXpress-Benutzer ist für die Weiterleitung nicht freigegeben.' });
      }
    }
    if (!METHODEN.includes(methode)) return json(400, cors, { status: 400, message: 'Methode nicht erlaubt' });
    if (methode !== 'POST' && !/\/[0-9]+$/.test(pfad)) return json(400, cors, { status: 400, message: 'Auftragsnummer fehlt' });

    try {
      const antwort = await fetch(ZIEL + '/v3/' + pfad, {
        method: methode,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: text
      });
      return {
        status: antwort.status,
        headers: { ...cors, 'Content-Type': antwort.headers.get('content-type') || 'application/json' },
        body: await antwort.text()
      };
    } catch (e) {
      context.log('LetterXpress nicht erreichbar'); // bewusst ohne Inhalte
      return json(502, cors, { fehler: 'LetterXpress nicht erreichbar: ' + e.message });
    }
  }
});
EOF
( cd "$TMP" && if command -v zip >/dev/null; then zip -qr paket.zip package.json host.json src; else python3 -c "import zipfile,os; z=zipfile.ZipFile('paket.zip','w'); [z.write(f) for f in ['package.json','host.json','src/functions/lxp.js']]; z.close()"; fi )
az functionapp deployment source config-zip -g "$RG" -n "$APP" --src "$TMP/paket.zip" --build-remote true -o none
az functionapp cors add -g "$RG" -n "$APP" --allowed-origins "$HERKUNFT" -o none 2>/dev/null || true
rm -rf "$TMP"

HOST="$(az functionapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
URL="https://${HOST}/api"

echo "6/6 Selbsttest ..."
OK=""
for i in $(seq 1 20); do
  ANTWORT="$(curl -s -m 30 -X POST -H "Origin: $HERKUNFT" -H 'Content-Type: application/json' -d '{}' "$URL/v3/_version" || true)"
  if echo "$ANTWORT" | grep -q '"weiterleitung":2'; then OK=1; break; fi
  sleep 10
done

echo
echo "=================================================================="
if [ -n "$OK" ]; then
  echo " FERTIG - die Weiterleitung laeuft."
else
  echo " Eingerichtet, aber der Selbsttest hat noch nicht geantwortet."
  echo " (Manchmal braucht Azure ein paar Minuten - in der App einfach"
  echo "  spaeter nochmal auf 'Pruefen' tippen.)"
fi
echo
echo " Diese Adresse in der App eintragen:"
echo
echo "   $URL"
echo "=================================================================="
}
haupt "$@"
