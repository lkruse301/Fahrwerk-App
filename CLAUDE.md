# Fahrwerk App – Hinweise für Claude Code

Offline-fähige Web-App (PWA) für das iPhone zum Speichern von Fahrwerkseinstellungen (Gabel/Dämpfer) pro Bike und Tag, mit Excel-Backup und -Wiederherstellung.

**Die vollständigen Anforderungen stehen in `SPEZIFIKATION.md`. Vor jeder Änderung lesen. Nichts bauen, was dort nicht steht.**

## Tech-Stack
- Reines HTML, CSS und JavaScript (ES-Module), **kein Framework, kein Build-Schritt**
- Speicherung: IndexedDB über ein kleines eigenes Modul (`js/db.js`); beim Start `navigator.storage.persist()` anfragen
- Excel: SheetJS (`xlsx.full.min.js`) **lokal** unter `vendor/` ablegen, nicht per CDN laden (sonst nicht offline)
- Offline: Service Worker (`sw.js`) mit Cache-first für alle App-Dateien; Cache-Version bei jeder Änderung hochzählen
- `manifest.webmanifest` mit `display: standalone`, App-Icons (180 px Apple-Touch-Icon, 192 px, 512 px)
- Hosting: GitHub Pages (HTTPS)

## Geplante Struktur
```
index.html
manifest.webmanifest
sw.js
css/styles.css
js/app.js        # UI und Ereignisse
js/db.js         # IndexedDB: Bikes und Setups
js/setup.js      # Tageslogik (neuer Tageseintrag / Aktualisieren)
js/excel.js      # Export und Import (.xlsx)
vendor/xlsx.full.min.js
icons/
Backups/         # Ablageort für Excel-Backups (nicht Teil der App)
```

## Regeln
- Oberfläche komplett auf Deutsch
- Touch-Ziele mindestens 56 × 56 px, Dark Mode, hoher Kontrast
- Zur Laufzeit keine Netzwerkanfragen
- Datum immer als lokales Datum (`JJJJ-MM-TT`), nicht UTC
- Klicks werden ab geschlossen (0) nach offen gezählt; kein Wert unter 0
- Tageslogik in `js/setup.js` als reine Funktionen schreiben, damit sie testbar ist
- Vor dem Abschluss prüfen: Playwright mit iPhone-Viewport (Bedienung, Tageslogik, Export → Import ergibt denselben Datenstand)

## Vorgehen
1. Grundgerüst und Datenmodell (`db.js`, `setup.js`)
2. Oberfläche mit +/−-Zeilen und Bike-Auswahl
3. Excel-Export und -Import
4. PWA (Manifest, Service Worker, Icons), Offline-Test
5. Deployment auf GitHub Pages und kurze Installationsanleitung fürs iPhone in `README.md`
