// Offline-Cache mit "network-first" fuer die App-Datei(en) selbst -- die
// Rechnungserfassung wird waehrend der Entwicklung noch oefter geaendert,
// deshalb soll bei vorhandener Verbindung IMMER zuerst die aktuelle Version
// vom Server geholt werden; nur ohne Netz greift der Cache als Fallback.
// Grosse, selten wechselnde Dateien (ICD-Katalog) bleiben cache-first, damit
// die Suche auch offline sofort da ist.
//
// WICHTIG: bei jeder inhaltlichen Aenderung an dieser Datei (oder wenn die
// App auf dem Handy nach einem Update "haengen" bleibt) die CACHE_NAME-
// Versionsnummer erhoehen -- nur so erkennt der Browser ueberhaupt, dass
// sich der Service Worker geaendert hat und tauscht ihn aus.
//
// KORREKTUR v115: Die alte Pruefung "url.endsWith('')" (aus './' wurde ''
// gemacht) war fuer JEDE Adresse wahr. Dadurch lief alles network-first --
// auch der grosse ICD-Katalog (bei jedem Start neu geladen) und die
// Microsoft-Graph-Abrufe (Sync-Datei, Rechnungsuebersicht mit Patientendaten),
// deren Antworten dann dauerhaft im Cache des Handys lagen. Jetzt:
//   - Microsoft-Anmeldung/Graph, OSM-Dienste: nie aus dem/in den Cache
//   - nur GET-Anfragen werden ueberhaupt behandelt
//   - App-Seite/Manifest/Startadresse: network-first
//   - alles andere (ICD-Katalog, Icons, MSAL-Bibliothek): cache-first
// v116: Hauptversion (vorher Beta) -- zusaetzlich GOÄ-Katalog; Dateien einzeln
// cachen, damit eine fehlende Datei nicht die ganze Installation verhindert
// v117: Tabellenhoehe aus der Word-Vorlage (PT-Vorlage angeglichen)
// v118: lokale Faelle merken sich den Abgleich (kein "Abgleich laeuft" mehr)
// v119: 56 mit eigener Uhr, Profile individuell, Fassungen, Termin = stornieren + neu
// v120: 56 wieder mit den gewohnten Uhrzeitfeldern, Anzahl je volle halbe Stunde
// v121: GOÄ-Häufigkeitsregeln (Behandlungsfall, mehrfach am Tag, Höchstanzahl)
// v122: Behandlungsfall-Pruefung wieder entfernt (im Notdienst nicht relevant)
// v123: Profil-Reihenfolge, Begruendungs-Dropdown, Fassungen als Unterzeilen, Luftlinie mit Standort
// v124: Fahrtenbuch-Statistik + Grundpauschale, Luftlinie Von/Bis, Debugging entfernt
const CACHE_NAME = 'rechnungserfassung-v218';
const NETZWERK_ZUERST = ['./Rechnungserfassung_Mobil.html', './manifest.json', './'];
const CACHE_ZUERST = ['./icd_katalog.js', './nfp_karte_kvbw.jpg', './goae_katalog.js', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png', './apple-touch-icon.png'];
const NIE_CACHEN = ['nominatim.openstreetmap.org', 'tile.openstreetmap.org', 'project-osrm.org', 'graph.microsoft.com', 'login.microsoftonline.com', 'login.live.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all([...NETZWERK_ZUERST, ...CACHE_ZUERST].map((pfad) => cache.add(pfad).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Vollstaendige Adressen der network-first-Dateien (relativ zum Ort des
// Service Workers aufgeloest), z.B. https://.../Rechnungserfassung_Mobil.html
const NETZWERK_ZUERST_URLS = NETZWERK_ZUERST.map((pfad) => new URL(pfad, self.location.href).href);

function istNetzwerkZuerst(url) {
  const ohneQuery = url.split('#')[0].split('?')[0];
  return NETZWERK_ZUERST_URLS.includes(ohneQuery);
}

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  const url = anfrage.url;

  // Nur GET-Anfragen; Anmeldung/Graph/OSM nie ueber den Cache
  if (anfrage.method !== 'GET') return;
  if (NIE_CACHEN.some((host) => url.includes(host))) return;

  if (istNetzwerkZuerst(url)) {
    event.respondWith(
      fetch(anfrage)
        .then((antwort) => {
          if (antwort && antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(anfrage, kopie)).catch(() => {});
          }
          return antwort;
        })
        .catch(() => caches.match(anfrage, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(anfrage).then((cached) => {
      if (cached) return cached;
      return fetch(anfrage).then((antwort) => {
        // Einmal online geladene Zusatzdateien (z.B. MSAL-Bibliothek vom CDN)
        // fuer den Offline-Betrieb ablegen
        if (antwort && (antwort.ok || antwort.type === 'opaque')) {
          const kopie = antwort.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(anfrage, kopie)).catch(() => {});
        }
        return antwort;
      });
    })
  );
});
