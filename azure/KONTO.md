# Guthabenkonto (Weiterleitung Version 7)

Briefe der Nutzer laufen über **dein** LetterXpress-Konto. Bezahlt wird mit Guthaben, das die Nutzer über
Stripe aufladen (Karte, SEPA-Lastschrift, PayPal, Apple Pay, Google Pay). Die Nutzer bleiben anonym.

## Was gespeichert wird

Gespeichert wird nur in deinem Azure-Speicherkonto (Frankfurt), Tabelle `buchungen`. Je Konto gibt es nur
Buchungen: Art, Betrag, Zeit, Seitenzahl und Auftragsnummer.

- Das Konto ist der SHA-256-Hash eines Zufallsschlüssels aus der App.
- Es gibt keine Namen, keine E-Mail-Adressen, keine IP-Adressen und keine Briefinhalte.
- Jede Nacht wird eine Sicherung im Container `sicherung` abgelegt. Sie wird 90 Tage aufbewahrt.

## Einrichten

1. Lege bei [stripe.com](https://stripe.com) ein Konto an. Zum Ausprobieren reicht der **Testmodus**: ohne
   Firma, ohne echtes Geld.
2. Im Stripe-Dashboard schaltest du unter *Einstellungen › Zahlungsmethoden* die gewünschten Zahlarten ein,
   z. B. **PayPal** und SEPA-Lastschrift.
3. Den Secret Key findest du unter *Entwickler › API-Schlüssel* (`sk_test_…`).
4. Öffne die Azure Cloud Shell und rufe das Skript mit dem Zusatz `konto` auf:

       bash einrichten.sh <Adresse der App> konto

   Die Aufrufzeile mit Prüfsumme zeigt die App. Das Skript fragt verdeckt nach diesen Angaben:
   - LetterXpress-Benutzer und API-Key
   - Stripe-Key
   - Preise
   - Aufladebeträge
   - Firmendaten für die Belege

   Den Stripe-Webhook legt das Skript selbst an.
5. Am Ende zeigt das Skript den **Statistik-Schlüssel**. Bewahre ihn gut auf.

Später echt abrechnen: Führe das Skript erneut mit `konto` aus und gib dabei den `sk_live_…`-Key ein. Der
Webhook wird dann neu angelegt.

## Einstellungen

Du findest sie im Azure-Portal unter *Funktions-App › Umgebungsvariablen*.

| Name | Bedeutung |
|---|---|
| `LXP_BENUTZER`, `LXP_APIKEY` | dein LetterXpress-Zugang |
| `LXP_MODUS` | `live` (echte Briefe) oder `test` (alles nur Test) |
| `STRIPE_GEHEIM`, `STRIPE_WEBHOOK_GEHEIM` | Stripe-Key und Webhook-Geheimnis |
| `PREIS_BRIEF_CENT`, `PREIS_SEITE_CENT` | Preis je Brief (inkl. 1 Seite) und je weitere Seite, in Cent |
| `AUFLADE_BETRAEGE` | wählbare Beträge in Cent, z. B. `1000,2000,5000` (höchstens 25000) |
| `FIRMA_NAME`, `FIRMA_ANSCHRIFT`, `FIRMA_STEUERNUMMER` | für die Belege; ohne Name und Anschrift gibt es keine Belege |
| `UST_SATZ`, `KLEINUNTERNEHMER` | Steuersatz bzw. `ja` für § 19 UStG |
| `KONTO_SPEICHER` | vom Skript gesetzt |
| `STATISTIK_SCHLUESSEL` | vom Skript gesetzt |

## Anonyme Statistik

Den Stand rufst du so ab (z. B. in der Cloud Shell):

    curl -s -X POST -H "Origin: <Adresse der App>" -H "Content-Type: application/json" \
         -d '{"schluessel":"<Statistik-Schlüssel>"}' https://<deine-funktion>.azurewebsites.net/api/konto/statistik

Die Antwort enthält:

- Anzahl der Konten
- offenes Guthaben aller Nutzer (das ist deine Verbindlichkeit)
- Guthaben bei LetterXpress
- je Monat: Aufladungen, Briefe, Seiten, Briefumsatz und aktive Konten

Test-Buchungen sind dabei nicht mitgezählt.

## Offen, bevor echtes Geld fließt

- Lass von der Steuerberatung prüfen, wann die Umsatzsteuer anfällt: beim Aufladen oder erst beim Brief.
  Danach richten sich die Belege. Derzeit gibt es einen Beleg je Aufladung, mit enthaltener Umsatzsteuer.
- Lege die Regeln zu Erstattung und Verfall von Guthaben in den AGB fest.
- Stelle das Azure-Abonnement auf nutzungsbasierte Bezahlung um und übertrage es später auf die Firma.
