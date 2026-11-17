# Tests

Zwei Stufen, beide laufen bei jedem Push automatisch bei GitHub (Reiter „Actions“, Prüflauf):

1. **Statische Prüfungen** – `node tests/statisch.js` (nur Node, keine Zusatzpakete):
   Syntax aller Skripte, Sicherheitsrichtlinie (CSP) passend zu den Skripten, keine fremden Skriptquellen,
   keine Ereignis-Attribute im HTML, Prüfsummen der Bibliotheken in `lib/`, Dateiliste des Service Workers.
2. **Tests im Browser** – `node tests/lauf.js` (Chromium über Playwright): Die App wird wirklich geöffnet,
   mit echter Verschlüsselung und echter Browser-Datenbank. Kein Test geht ins Internet; OneDrive ist nachgebildet.

Einmalig auf dem eigenen Rechner:

    npm install --no-save playwright@1.63.0
    npx playwright install chromium

Aufrufe:

    node tests/lauf.js                 alle Tests
    node tests/lauf.js abgleich        nur Dateien, deren Name „abgleich“ enthält
    AUSFUEHRLICH=1 node tests/lauf.js  Einzelheiten auch bei bestandenen Prüfungen

Jede Datei `NN_name.test.js` ist ein Test; `nutzlast.js` enthält die präparierten Inhalte (harmlos: sie setzen
höchstens eine Markierung), `hilfe.js` gemeinsame Helfer. Ein neuer Test ist eine neue Datei nach demselben Muster.

Wichtig: Ein fehlgeschlagener Prüflauf hält eine Veröffentlichung nicht auf – er meldet sie nur (E-Mail von GitHub).
