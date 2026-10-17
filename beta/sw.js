// Die Beta ist jetzt die Hauptversion. Dieser Service Worker raeumt nur noch
// auf: Beta-Cache loeschen und sich selbst abmelden (danach gilt der Service
// Worker der Hauptversion).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.indexOf('rechnungserfassung-beta') === 0).map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((fenster) => fenster.forEach((f) => f.navigate('../Rechnungserfassung_Mobil.html').catch(() => {})))
  );
});
