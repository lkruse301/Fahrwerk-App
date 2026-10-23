# Fahrwerk

Offline-Web-App fürs iPhone: Fahrwerkseinstellungen (Gabel/Dämpfer) pro Bike und Tag speichern, Backup als Excel.
Anforderungen: siehe `SPEZIFIKATION.md`.

## Bedienung
- **Bike wählen** über die Auswahl oben, „＋ Neues Bike …“ legt ein weiteres an. „⋯“ = umbenennen oder löschen.
- **+ / −** verstellt den Wert. **Gedrückt halten** zählt fortlaufend (praktisch für Luftdruck und Federrate).
- Gespeichert wird sofort. Die erste Änderung an einem Tag legt automatisch ein **neues Tages-Setup** an, das die Werte vom letzten Mal übernimmt. Weitere Änderungen am selben Tag aktualisieren dieses Setup.
- Orange Werte mit Punkt = heute gegenüber dem letzten Setup verändert.
- **Verlauf** (Uhr-Symbol oben): alle gespeicherten Tage des Bikes, neuestes zuerst. Tippe auf einen Tag, um ihn nachträglich zu ändern. Das ändert nur diesen Tag, die Hauptansicht zeigt weiterhin immer das neueste Setup.
- Klicks zählen **ab geschlossen** (0 = ganz zu).

## Backup
- **Backup als Excel** → im Teilen-Menü **„In Dateien sichern“** → iCloud Drive › KI Projekte › Fahrwerk App › **Backups**.
- **Aus Excel wiederherstellen** → Backup-Datei wählen → ersetzt alle Daten in der App.
- Die Daten liegen nur auf dem iPhone. Wird die App vom Home-Bildschirm gelöscht, sind sie weg. Deshalb regelmäßig ein Backup ziehen.

## Einmalig: App ins Netz stellen und aufs iPhone holen
Für die Offline-Funktion muss die App einmal über HTTPS geladen werden. Kostenlos geht das mit GitHub Pages:

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `fahrwerk`.
2. Den Inhalt dieses Ordners hochladen (Claude Code kann das per `git` erledigen). Der Ordner `Backups/` wird durch `.gitignore` **nicht** hochgeladen, deine Daten bleiben privat.
3. Im Repository: **Settings › Pages › Branch: `main`, Ordner `/ (root)`** › Save.
4. Nach ca. 1 Minute ist die App unter `https://<dein-name>.github.io/fahrwerk/` erreichbar.
5. Auf dem iPhone in **Safari** öffnen › Teilen › **„Zum Home-Bildschirm“**.
6. Einmal öffnen, danach läuft sie auch im Flugmodus.

## Änderungen an der App
- In `sw.js` die Versionsnummer `CACHE = 'fahrwerk-vX'` erhöhen, sonst bekommt das iPhone die neue Version nicht.
- Hochladen, App auf dem iPhone zweimal öffnen (beim ersten Mal lädt sie im Hintergrund die neue Version).

## Aufbau
```
index.html              Oberfläche
css/styles.css          Gestaltung
js/app.js               Bedienung, Dialoge, Export/Import-Ablauf
js/setup.js             Felder und Tageslogik (reine Funktionen)
js/db.js                Speicherung (IndexedDB)
js/excel.js             Excel lesen/schreiben
vendor/xlsx.full.min.js SheetJS 0.18.5 (lokal, für offline)
sw.js                   Service Worker (offline)
manifest.webmanifest    App-Infos für den Home-Bildschirm
icons/                  App-Icons
```
