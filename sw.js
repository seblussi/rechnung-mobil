// Service Worker: Offline-Betrieb und Updates (Sicherheitsbericht L11).
//
// Grundsatz: Die App läuft immer aus EINEM vollständigen, zusammengehörigen Stand.
//  - Installieren: Alle Dateien der festen Liste (DATEIEN) werden frisch vom Server geladen und gegen ihre
//    SHA-256-Prüfsumme geprüft. Fehlt eine Datei oder passt eine Prüfsumme nicht (abgebrochene Verbindung, Server
//    liefert gerade noch alte Dateien), schlägt die Installation fehl: Der bisherige Stand bleibt unverändert aktiv,
//    der Browser versucht es beim nächsten Start erneut. Es gibt keine halben oder gemischten Stände mehr.
//  - Umschalten: Eine fertig geladene neue Version wartet. Die Seite zeigt „Update verfügbar“ und schaltet auf Klick
//    um (bzw. von selbst direkt nach dem Start, solange noch nichts bedient wurde).
//  - Ausliefern: Dateien der Liste kommen immer aus dem Cache dieser Version (auch online).
//  - Microsoft-Anmeldung/Graph und Kartendienste laufen nie über den Cache; nur GET-Anfragen werden behandelt.
//
// Bei JEDER Veröffentlichung: CACHE_NAME erhöhen und danach „node werkzeuge/sw_dateien.js“ ausführen (trägt die
// Prüfsummen ein; tests/statisch.js prüft das). Neue Dateien der App hier in DATEIEN aufnehmen.
const CACHE_NAME = 'rechnungserfassung-v490';
const CACHE_PRAEFIX = CACHE_NAME.replace(/\d+$/, '');   // alle Versionen dieser App: gleicher Anfang, andere Nummer
const DATEIEN = {
// >>> DATEIEN (Prüfsummen erzeugt von werkzeuge/sw_dateien.js – nicht von Hand ändern)
  './Rechnungserfassung_Mobil.html': 'MNH8Jj+IUWdWsRk2n0LArlWVOKQQMTfjU2S4vvhkqcE=',
  './manifest.json': 'oGmycJijIIy67JQt2/9DPvS7LFo04ldRKRTIcpUcfxY=',
  './': 'HAHncj5UelMdOHtP3EGp0CI7BT/TzLQ7grnGteDXT60=',
  './lib/msal/msal-browser.min.js': 'oW1XExMUwEJRJjFmLVpFT6UqcZoxojm+4rsSOZfth4E=',
  './lib/jszip.min.js': 'rMfkFFWoB2W1/Zx+4bgHim0WC7vKRVrq6FTeZclH1Z4=',
  './lib/pdfjs/pdf.min.mjs': 'n6sMkQvxSEg1xcKuto9+s9/Of560NaAEUmxa+G1wiQw=',
  './lib/pdfjs/pdf.worker.min.mjs': 'vA0biOoLZhlrHTalisJDxtkq3+clYk4qn904G9+O9DQ=',
  './lib/maplibre/maplibre-gl.js': '6Hf+Iv36xknN9MrCfWbky0hyxZYK3Nkimp65k8Itr7g=',
  './lib/maplibre/maplibre-gl.css': 'V2sIX92Uh6ZaGSFTKMHghsB85b9toJtmazgG09AI2uk=',
  './lib/qrcode/qrcode.js': 'eeyG+ChWAFsciHkFz8z8++w4Icphx/1alS+qX3ePeRw=',
  './lib/banken.js': 'aelbdgzHW95ninFz0qckXpUyKKierKworLTb6UMXQLU=',
  './icd_katalog.js': 'FsOUaVmlU67By2PwKv8inbjI169q0piRZEjdjfvqTxU=',
  './nfp_karte_kvbw.jpg': '0BEX1W+mT93S49MA8AsXmlXEi3khZUDMMCBob2halSw=',
  './goae_katalog.js': 'PBRzBt+w0+yrlw41MiREsySChdWuAt4joNqNbOSrp74=',
  './icon-192-maskable.png': '+V9SQekfCk4zFYjCa9UscFKadjLnoCOc4rDNgCA2LH4=',
  './icon-512-maskable.png': 'MzpydXDHTa3C59Ql+Z6ttsgOC2j/pI0zPtmd8Y9TPVM=',
  './apple-touch-icon.png': 'AK/AjVLtHMaWtfMANF5svZpWdvInryUXFEEC3BffUW0=',
  './lib/pdf-lib.min.js': 'D5pcrQeUHwgmWGyU4InYm5GMRuXBfPLVo8b2ZuO8aU8=',
  './lib/xlsx/xlsx.full.min.js': 'zAFRMKqFIefwiPiImOupSczcv7ON8L0Sm0S3Jzw6b0E=',
  './lokal/docxpdf.js': '4UQ77dDAw1GjB6DwMBp9uwnlX6x0PGGQOUZKrA7i7MA=',
  './lokal/krypto.js': 'j9HHt3IQYGDy7ei52Ax9+RJzaHtKmki2jraAHWnS1XA=',
  './lokal/lokalgraph.js': 'm1JWexsTvx9bUnWGRvROSUvoS+C9Z7WHZFHLlu3vJTA=',
  './lokal/mappe.js': 'egrkS5t7q7gobcjPyN6WvgCtYtvIcAAtLyF+FenRYHk=',
  './lokal/tresor_start.js': 'FCYsN8VrrjxVMHI3TyA4emAzECZcrKIbtW0B7d5psWg=',
  './lokal/sperrliste.js': '4Ml51NOEu8uk1tqq9/FM0B4a8bBO1z3hLr7FgtWHFFY=',
  './lib/argon2.umd.min.js': 'sPJ7Mmh0Fi/T+GVaGZT4WIHEMq/YfF23Flyb93WmykE=',
  './lokal/tresor.js': 'sg4uMcJjdB1DO7t3c04z05dqt+uD8vJAZerPWiqZwWw=',
// <<< DATEIEN
};
const NIE_CACHEN = ['nominatim.openstreetmap.org', '/karten-bw/', 'routing.openstreetmap.de', 'overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee', 'tile.openstreetmap.org', 'tiles.openfreemap.org', 'project-osrm.org', 'graph.microsoft.com', 'login.microsoftonline.com', 'login.live.com'];

async function ladeGeprueft(cache, pfad, soll){
  const anfrage = new Request(pfad, { cache: 'no-store' });
  const antwort = await fetch(anfrage);
  if(!antwort || !antwort.ok) throw new Error(pfad + ': HTTP ' + (antwort ? antwort.status : 'keine Antwort'));
  const kopie = antwort.clone();
  const summe = await crypto.subtle.digest('SHA-256', await antwort.arrayBuffer());
  let b = ''; new Uint8Array(summe).forEach((x)=>{ b += String.fromCharCode(x); });
  if(btoa(b) !== soll) throw new Error(pfad + ': Prüfsumme passt nicht');
  await cache.put(new Request(pfad), kopie);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try{
      // nacheinander in kleinen Gruppen (schont schwache Verbindungen); der erste Fehler bricht alles ab
      const liste = Object.entries(DATEIEN);
      for(let i = 0; i < liste.length; i += 4) await Promise.all(liste.slice(i, i + 4).map(([pfad, soll]) => ladeGeprueft(cache, pfad, soll)));
    }catch(e){
      await caches.delete(CACHE_NAME);   // nichts Halbes liegen lassen
      throw e;
    }
    // Allererste Installation: sofort übernehmen. Sonst wartet die neue Version, bis die Seite umschaltet.
    if(!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if(event.data === 'update-uebernehmen') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // nur die eigenen, älteren Versions-Caches löschen -- NICHT die Caches der App selbst (Offline-Karte, AED, Karte)
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAME && n.startsWith(CACHE_PRAEFIX)).map((n) => caches.delete(n)))).then(() => self.clients.claim())
  );
});

const FEST = new Set(Object.keys(DATEIEN).map((pfad) => new URL(pfad, self.location.href).href));

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  const url = anfrage.url;
  if(anfrage.method !== 'GET') return;
  if(NIE_CACHEN.some((host) => url.includes(host))) return;
  const ohne = url.split('#')[0].split('?')[0];
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const treffer = await cache.match(FEST.has(ohne) ? ohne : anfrage);
    if(treffer) return treffer;
    // nicht Teil der festen Liste (z. B. Vorlagen, Demo-Daten): aus dem Netz holen und für den Offline-Betrieb ablegen
    const antwort = await fetch(anfrage);
    if(antwort && (antwort.ok || antwort.type === 'opaque')){
      const kopie = antwort.clone();
      cache.put(anfrage, kopie).catch(() => {});
    }
    return antwort;
  })());
});
