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
const CACHE_NAME = 'rechnungserfassung-v43';
const NETZWERK_ZUERST = ['./Rechnungserfassung_Mobil.html', './manifest.json', './'];
const CACHE_ZUERST = ['./icd_katalog.js', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...NETZWERK_ZUERST, ...CACHE_ZUERST]))
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

function istNetzwerkZuerst(url) {
  return NETZWERK_ZUERST.some((pfad) => url.endsWith(pfad.replace('./', '')) || url.endsWith('/'));
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // API-Aufrufe (Nominatim/OSRM) niemals aus dem Cache bedienen
  if (url.includes('nominatim.openstreetmap.org') || url.includes('project-osrm.org')) {
    return;
  }

  if (istNetzwerkZuerst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((antwort) => {
          const kopie = antwort.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopie));
          return antwort;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
