# Finance OS – Website

Die Website von Finance OS (HTML / CSS / JavaScript), veröffentlicht mit **GitHub Pages** unter
**https://finance-os.dev**. Das Backend (Login, Speichern, E-Mails) liegt im Repository
[finance-tracker-backend](https://github.com/Zh-Kristian/finance-tracker-backend).

## Ordnerstruktur

Auf deinem Computer liegt dieses Repository als `finance-os/frontend/`, daneben `finance-os/backend/`
(Backend) und `finance-os/secrets/` (Passwörter, kein Repository).

```
frontend/   (Repository Zh-Kristian.github.io)
├── index.html              Startseite für neue Besucher
├── login.html              Login, Registrieren, Passwort vergessen/ändern, E-Mail ändern
├── app.html                Finance OS (Dashboard, Monat, Einträge, Daueraufträge, Einstellungen)
├── datenschutz.html        Datenschutzerklärung
├── impressum.html          Impressum (wer die Seite betreibt)
├── nutzungsbedingungen.html  Nutzungsbedingungen (werden bei der Registrierung akzeptiert)
├── kontakt.html            Kontaktformular
├── 404.html                Seite „Gibt es nicht“ (GitHub Pages zeigt sie bei jeder unbekannten Adresse)
├── manifest.webmanifest    App auf dem Home-Bildschirm (Name, Icons, Farben)
├── version.json            Aktuelle Versionsnummer der Website (für den Hinweis „Neu laden“)
├── robots.txt              Für Suchmaschinen: was gelesen werden darf, wo die Sitemap liegt
├── sitemap.xml             Liste der öffentlichen Seiten für Google (Search Console)
├── CNAME                   Eigene Domain finance-os.dev (von GitHub Pages angelegt, nicht löschen)
├── css/
│   ├── shared/             für alle Seiten
│   │   ├── base.css        Farben, Schrift, Buttons, Felder, Sidebar
│   │   ├── error.css       Fehlerseiten: 404 und „Etwas ist schiefgelaufen“ in der App
│   │   └── themes.css      Darstellung: Akzentfarben (Standard Lila), dunkler Modus, grosse Schrift
│   ├── app/                nur app.html
│   │   ├── dashboard.css   Seite Dashboard
│   │   ├── month.css       Seite Monat
│   │   ├── month-picker.css Popup „Lohnmonat wählen“ (Monat ändern)
│   │   ├── settings.css    Seite Einstellungen
│   │   ├── future.css      Seite Sparzukunft
│   │   ├── setup.css       Einrichtung für neue Konten (Fragen beim ersten Login)
│   │   ├── tour.css        Geführte Tour durch die App
│   │   └── responsive.css  Handy/Tablet in der App (wird zuletzt geladen)
│   └── pages/              öffentliche Seiten
│       ├── landing.css     Startseite
│       ├── login.css       Login, Datenschutz, Impressum, Nutzungsbedingungen, Kontakt
│       └── contact.css     Kontaktformular
├── js/
│   ├── shared/             für alle Seiten
│   │   ├── api.js          Verbindung zum Backend (Adresse, Login-Schlüssel)
│   │   ├── i18n.js         Sprachen DE/EN/FR/IT: übersetzt die Seiten
│   │   ├── translations.js Alle Übersetzungen – neue Texte hier ergänzen
│   │   ├── update.js       Hinweis „Neue Version – Neu laden“, wenn version.json sich ändert
│   │   ├── site.js         Startseite/Login/Datenschutz/Kontakt: Hell/Dunkel, Burger-Menü,
│   │   │                   merkt Herkunft und Scroll-Position jeder Seite
│   │   └── back.js         „← Zurück“ an die gleiche Stelle
│   ├── app/                Finance OS selbst – app.html lädt die Teile in dieser Reihenfolge:
│   │   ├── tour.js         Geführte Tour (startet nach der Einrichtung)
│   │   ├── setup.js        Einrichtung für neue Konten: Lehre, Lohn, Tracken ab, 13. Monatslohn, Pauschalen, Abos
│   │   ├── state.js        Konstanten, Daten, Darstellung, Speichern, Hilfsfunktionen, Dialoge
│   │   ├── calc.js         Lohnmonate und Berechnungen: Lohn, 13. Monatslohn, Daueraufträge, Konten, Tracken ab
│   │   ├── render.js       Anzeige: Dashboard, Statistik, Monatsseite, Listen der Einträge/Daueraufträge
│   │   ├── render-settings.js  Anzeige der Einstellungen: Lohn, Pauschalen, Konten, Listen, Handy-Tabellen
│   │   ├── future.js       Seite Sparzukunft: so viel sparst du pro Lehrjahr und bis zum Ende der Lehre
│   │   ├── layout.js       Dashboard anordnen: verschieben, Breite ändern, ausblenden
│   │   ├── navigation.js   Seiten, Menü, Pop-ups, Hell/Dunkel, Einrichtung/Tour starten, Monat wählen
│   │   ├── forms.js        Speichern/Löschen von Einträgen und Daueraufträgen, Einstellungen, Konto
│   │   ├── payday.js       Am Lohntag: Übriges sparen oder in den nächsten Monat mitnehmen
│   │   └── main.js         Klicks, Eingaben, Tasten und Start (immer zuletzt)
│   └── pages/              öffentliche Seiten
│       ├── landing.js      Animationen der Startseite
│       ├── login.js        Login-Seite inkl. Passwort-Regeln
│       └── contact.js      Kontaktformular prüfen und senden
├── fonts/                  Schrift Inter (lokal, keine Google-Server)
├── img/
│   ├── icons/              Symbol im Browser-Tab (favicon.svg), App-Icons (icon-*.png, apple-touch-icon.png)
│   └── screenshots/        Bilder der App auf der Startseite (hell/dunkel, Computer/Handy)
├── e2e/                    End-to-End-Tests (werden nicht veröffentlicht)
│   ├── fixtures.js         Gemeinsame Hilfen: Registrieren, Login, E-Mails lesen …
│   ├── serve.js            Kleiner Webserver für die Tests (Port 5510)
│   ├── landing.spec.js     Startseite, Sprachen, Hell/Dunkel
│   ├── auth.spec.js        Registrieren, Bestätigen, Login, Passwort-Regeln, Passwort vergessen
│   ├── setup.spec.js       Einrichtung für neue Konten
│   ├── tour.spec.js        Geführte Tour
│   ├── app.spec.js         Einträge, Sparen, Daueraufträge, Monat wechseln
│   ├── settings.spec.js    Pauschalen, Konten, Kategorien, Darstellung
│   ├── account.spec.js     Benutzername, Passwort, E-Mail ändern, Daten herunterladen, Konto löschen
│   ├── contact.spec.js     Kontaktformular
│   ├── navigation.spec.js  „Zurück“ an die gleiche Stelle
│   ├── i18n.spec.js        Alles auf Englisch, Französisch und Italienisch
│   ├── files.spec.js       Keine Fehler und keine fehlenden Dateien auf allen Seiten
│   ├── errors.spec.js      404-Seite und Fehlerseite in der App
│   ├── payday.spec.js      Frage am Lohntag (sparen oder mitnehmen)
│   └── mobile.spec.js      Handy-Ansicht
├── playwright.config.js    Einstellungen der Tests
├── package.json            Test-Werkzeug Playwright
└── _config.yml             Sagt GitHub Pages, welche Dateien nicht veröffentlicht werden
```

## Lokal ausprobieren

1. Backend in IntelliJ starten (Repository *finance-tracker-backend*, läuft auf `http://localhost:8080`).
2. Diesen Ordner in VS Code öffnen → `index.html` mit **Live Server** öffnen (`http://127.0.0.1:5500`).

Die Website merkt selbst, ob sie lokal läuft (dann Backend `localhost:8080`) oder online
(dann Backend bei Render). Die Adressen stehen oben in `js/shared/api.js`.

## Veröffentlichen

Änderungen committen und auf `main` pushen – GitHub Pages ist nach 1–2 Minuten aktualisiert.
Läuft das Backend bei Render unter einer anderen Adresse als `https://finance-tracker-backend-5rru.onrender.com`,
diese an zwei Stellen anpassen: `PUBLIC_API_URL` in `js/shared/api.js` und `connect-src` im
`<meta http-equiv="Content-Security-Policy">` oben in jeder HTML-Datei.

## Sprachen

Deutsch ist die Grundsprache. Jeder deutsche Text hat in `js/shared/translations.js` eine Zeile
`"Deutscher Text": ["English", "Français", "Italiano"]`. Neue Texte dort ergänzen.
Standard-Kategorien, Konten und Pauschalen wechseln die Sprache mit; selbst eingetippte Namen
bleiben, wie sie sind. Die E-Mails des Backends kommen in der Sprache der Website.

## Einrichtung für neue Konten

Beim ersten Login erscheint ein Fenster mit Fragen (`js/app/setup.js`); die App dahinter ist verschwommen
und nicht bedienbar. Pflicht: Lehrbeginn, Dauer der Lehre, Lohntag, „Ab wann willst du deine Finanzen
tracken?“, 13. Monatslohn, Lohn pro Lehrjahr und Pauschalen. Überspringbar: Abos/feste Zahlungen. Die Antworten werden direkt in die Einstellungen
und als Daueraufträge gespeichert (`applySetup` in `js/app/navigation.js`) und können dort jederzeit geändert werden.
Konten, die schon einen Lohn eingetragen haben, sehen die Einrichtung nicht.

## Tracken ab

Wer Finance OS erst später in der Lehre benutzt, wählt einen Lohnmonat „Tracken ab“ (Einrichtung oder
*Einstellungen → Lehre und Lohn*). Monate davor zählen nirgends mit: kein Lohn, kein Sparen, keine
Daueraufträge, nichts in Konten und Statistik. Im „Monat ändern“ sind sie gestrichelt, in „Gespart pro
Lehrjahr“ steht „Nicht erfasst“. Lehrjahr, Lohnhöhe und 13. Monatslohn hängen weiter am Lehrbeginn.
Gespeichert als `trackFrom` („JJJJ-MM“, leer = ab Lehrbeginn).

## Geführte Tour

Startet nach der Einrichtung automatisch und kann unter *Einstellungen → Darstellung → Tour starten*
wiederholt werden. Die Schritte stehen oben in `js/app/tour.js` (Ziel-Element, Titel, Text).

## End-to-End-Tests

Ein echter Browser klickt sich durch die ganze Website: Registrieren, E-Mail bestätigen,
Einträge, Einstellungen, Tour, Kontaktformular, alle Sprachen, Handy-Ansicht.
Die Tests nutzen ein **eigenes Test-Backend** (Port 8081, Datenbank nur im Speicher,
E-Mails landen in einem Test-Postfach) – deine echten Daten werden nie verändert.

Einmalig (Node.js muss installiert sein):

```bash
npm install
npx playwright install chromium
```

Tests starten:

```bash
npm run test:e2e
```

Das Test-Backend startet automatisch über Maven, wenn das Backend-Repository unter
`C:\Projects\projects\backen-finance` liegt (sonst `BACKEND_DIR` setzen). Ohne Maven: in IntelliJ im
Backend-Projekt `src/test/java/.../e2e/E2eServer.java` öffnen → Rechtsklick → *Run 'E2eServer.main()'*,
dann `npm run test:e2e`.

- `npm run test:e2e:ui` – Tests im Fenster ansehen und einzeln starten
- `npm run test:e2e:report` – Bericht der letzten Ausführung (mit Screenshots bei Fehlern)

## Neue Version veröffentlichen

Alle CSS- und JS-Dateien werden mit einer Versionsnummer eingebunden, z. B. `css/shared/base.css?v=2026100854`,
und dieselbe Nummer steht in `version.json`. Bei jeder Änderung an der Website die Nummer überall erhöhen:
in IntelliJ **Strg+Shift+R** (Ersetzen in Dateien) → `2026100854` durch die neue Nummer ersetzen
(z. B. Datum + laufende Nummer: `2026100854`), dann pushen.

- Handys laden dadurch sicher die neuen Dateien statt der alten aus dem Zwischenspeicher.
- Wer die Seite oder die App auf dem Home-Bildschirm gerade offen hat, bekommt innerhalb von
  ein paar Minuten ein Fenster in der Mitte „Neue Version verfügbar“; der Rest ist verschwommen,
  weiter geht es nur mit „Neu laden“ (`js/shared/update.js`).

## App auf dem Home-Bildschirm

`manifest.webmanifest` und die Icons in `img/icons/` machen Finance OS installierbar:
iPhone (Safari) → Teilen → „Zum Home-Bildschirm“; Android (Chrome) → ⋮ → „App installieren“.
Die App öffnet dann ohne Browser-Leiste direkt `app.html`.
