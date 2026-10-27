# Fahrwerk App – Spezifikation (Version 1)

Stand: 23.10.2026

## 1. Ziel
Eine Web-App (PWA), die **offline auf dem iPhone** läuft und die Fahrwerkseinstellungen meiner Downhill-Bikes speichert. Pro Bike und Tag wird ein Setup abgelegt. Alle Daten lassen sich als **Excel-Datei sichern und daraus wiederherstellen**.

## 2. Ausdrücklich NICHT Teil von Version 1
- Keine Empfehlungen und keine Abstimmungshilfe
- Keine Strecken, kein Wetter, keine Notizen, keine Bewertungen, keine Fotos
- Kein Login, kein Server, keine Cloud-Synchronisation
- Keine Reifendrücke, kein Sag, keine Service-Intervalle
- Keine weiteren Funktionen außer den hier beschriebenen

## 3. Plattform
- PWA, die über Safari geöffnet und mit „Zum Home-Bildschirm“ installiert wird
- Muss nach der ersten Installation **vollständig offline** funktionieren (Service Worker cacht alle Dateien)
- Daten liegen lokal auf dem Gerät (IndexedDB)
- Ausgelegt für das iPhone im Hochformat

## 4. Datenmodell

### Bike
| Feld | Typ | Hinweis |
|---|---|---|
| id | Text (UUID) | intern |
| name | Text | z. B. „Downhill“, Pflichtfeld |

### Setup (ein Eintrag pro Bike und Tag)
| Feld | Einheit | Schritt | Hinweis |
|---|---|---|---|
| bikeId | – | – | Verweis auf das Bike |
| datum | JJJJ-MM-TT | – | lokales Datum des iPhones |
| gabel_luftdruck | psi | 1 | nur Gabel |
| gabel_tokens | Stück | 1 | nur Gabel |
| gabel_hsc | Klicks | 1 | High Speed Compression |
| gabel_lsc | Klicks | 1 | Low Speed Compression |
| gabel_hsr | Klicks | 1 | High Speed Rebound |
| gabel_lsr | Klicks | 1 | Low Speed Rebound |
| daempfer_federrate | lbs | 25 | nur Dämpfer (Stahlfeder) |
| daempfer_hsc | Klicks | 1 | |
| daempfer_lsc | Klicks | 1 | |
| daempfer_hsr | Klicks | 1 | |
| daempfer_lsr | Klicks | 1 | |

**Klick-Konvention:** Klicks werden immer **von geschlossen (ganz zugedreht = 0) nach offen** gezählt. Diesen Hinweis klein in der Oberfläche anzeigen („Klicks ab geschlossen“).

**Grenzen:** Kein Wert kann unter 0 fallen. Obergrenzen gibt es in Version 1 nicht.

## 5. Tageslogik (Kernlogik)
1. Beim Öffnen zeigt die App das **neueste Setup** des ausgewählten Bikes.
2. Sobald ein Wert mit + oder − verstellt wird:
   - Gibt es für **heute** noch keinen Eintrag für dieses Bike, wird ein **neuer Tageseintrag** angelegt. Er übernimmt alle Werte des letzten Eintrags, dann wird die Änderung angewendet.
   - Gibt es für heute schon einen Eintrag, wird dieser aktualisiert.
3. Gespeichert wird **sofort** bei jedem Tipp, es gibt keinen Speichern-Button.
4. Ältere Tage werden über die Hauptansicht nie verändert. Sie bleiben im **Verlauf** erhalten und lassen sich dort gezielt nachträglich bearbeiten (siehe Abschnitt 6).
5. Ein neues Bike startet mit allen Werten auf 0.

## 6. Bedienung und Oberfläche

```
┌───────────────────────────────┐
│ [ Downhill ▾ ] [Verlauf] [⋯]  │  ← Bike wechseln / Verlauf / Bike-Menü
│ Setup vom 23.10.2026          │
│ Klicks ab geschlossen         │
├───────────────────────────────┤
│ GABEL                         │
│ [ − ]   Luftdruck  85 psi  [+]│
│ [ − ]   Tokens      2      [+]│
│ [ − ]   HSC         4      [+]│
│ [ − ]   LSC         8      [+]│
│ [ − ]   HSR         6      [+]│
│ [ − ]   LSR        10      [+]│
├───────────────────────────────┤
│ DÄMPFER                       │
│ [ − ]   Federrate 450 lbs  [+]│
│ [ − ]   HSC         3      [+]│
│ [ − ]   LSC         7      [+]│
│ [ − ]   HSR         5      [+]│
│ [ − ]   LSR         9      [+]│
├───────────────────────────────┤
│ [ Backup als Excel ]          │
│ [ Aus Excel wiederherstellen ]│
└───────────────────────────────┘
```

- Jede Einstellung ist eine Zeile: **− Button | Name der Einstellung + aktueller Wert | + Button**
- Buttons groß (mindestens 56 × 56 px), damit sie draußen gut zu treffen sind
- **Langes Drücken** auf + oder − wiederholt den Schritt fortlaufend (nötig für Luftdruck und Federrate)
- Kurze Haptik/visuelle Rückmeldung pro Tipp; geänderte Werte des heutigen Tages dezent markieren
- Dark Mode, hoher Kontrast, gut lesbar in der Sonne
- Sprache der Oberfläche: Deutsch

### Verlauf (Verzeichnis)
- Uhr-Symbol oben neben der Bike-Auswahl öffnet den **Verlauf** des gewählten Bikes
- Liste aller gespeicherten Tage, **neuestes zuerst**. Pro Tag: Wochentag und Datum, Kennzeichnung „Aktuell“ (neuester Eintrag) und „Heute“, Anzahl der gegenüber dem Vortag geänderten Werte („Erstes Setup“ beim ersten Eintrag), Kurzinfo Luftdruck, Tokens, Federrate
- Tippen auf einen Tag öffnet dessen Setup mit denselben +/−-Zeilen wie die Hauptansicht
- **Nachträgliches Bearbeiten:** Änderungen dort wirken nur auf genau diesen Tag. Es entsteht kein neuer Eintrag und kein anderer Tag wird verändert. Gegenüber dem vorherigen Tag geänderte Werte sind markiert.
- **Tag löschen:** In der Tagesansicht unten „Diesen Tag löschen“. Nur mit Bestätigung; entfernt genau diesen Tageseintrag, andere Tage bleiben unverändert. Danach zurück zum Verlauf. Wird der neueste Tag gelöscht, zeigt die Hauptansicht das nächstältere Setup.
- Gespeichert wird sofort; „‹ Zurück“ führt vom Tag zum Verlauf und vom Verlauf zur Hauptansicht
- Die Hauptansicht zeigt weiterhin immer das neueste Setup. Wird der neueste Tag im Verlauf bearbeitet, zeigt die Hauptansicht danach diese Werte.
- Der Verlauf läuft nur in der App; das Excel-Backup wird weiterhin nur bei Bedarf über den Button erstellt

### Bike-Verwaltung
- Auswahlliste oben: zwischen Bikes wechseln
- In der Liste: „+ Neues Bike“ (Name eingeben)
- Bike umbenennen und löschen (Löschen nur mit Bestätigung, entfernt auch alle Setups des Bikes)
- Das zuletzt gewählte Bike wird beim nächsten Öffnen wieder angezeigt

## 7. Excel-Backup und Wiederherstellung

### Export („Backup als Excel“)
- Erzeugt eine `.xlsx`-Datei mit dem Namen `Fahrwerk-Backup_JJJJ-MM-TT.xlsx`
- **Blatt „Setups“:** eine Zeile pro Bike und Tag, sortiert nach Bike und Datum.
  Spalten: `Datum | Bike | Gabel Luftdruck (psi) | Gabel Tokens | Gabel HSC | Gabel LSC | Gabel HSR | Gabel LSR | Dämpfer Federrate (lbs) | Dämpfer HSC | Dämpfer LSC | Dämpfer HSR | Dämpfer LSR`
- **Blatt „Bikes“:** `ID | Name`
- Ablage: über das iOS-Teilen-Menü (`navigator.share` mit Datei) → „In Dateien sichern“ → **iCloud Drive › KI Projekte › Fahrwerk App › Backups**. Eine Web-App kann den Zielordner nicht selbst festlegen, iOS merkt sich aber meist den zuletzt gewählten Ordner. Falls Teilen nicht verfügbar ist: normaler Download als Fallback.

### Import („Aus Excel wiederherstellen“)
- Dateiauswahl (`.xlsx`) aus der Dateien-App
- Prüft, ob beide Blätter und alle Spalten vorhanden sind. Bei Fehlern: verständliche Meldung, nichts wird verändert.
- Vor dem Import Bestätigung: „Alle aktuellen Daten werden durch das Backup ersetzt.“
- Danach sind Bikes und alle Tagessetups exakt wie in der Datei

## 8. Akzeptanzkriterien
- [ ] App lässt sich auf dem iPhone zum Home-Bildschirm hinzufügen und startet im Flugmodus
- [ ] Bikes anlegen, wechseln, umbenennen, löschen funktioniert
- [ ] Jeder Wert lässt sich mit +/− verstellen und wird zwischen den Buttons angezeigt
- [ ] Erste Änderung an einem neuen Tag erzeugt einen neuen Tageseintrag mit den Vorwerten; weitere Änderungen am selben Tag aktualisieren diesen Eintrag
- [ ] Werte fallen nie unter 0; Luftdruck in 1-psi-, Federrate in 25-lbs-Schritten
- [ ] Der Verlauf listet alle Tage des gewählten Bikes, neuestes zuerst
- [ ] Ein älterer Tag lässt sich im Verlauf bearbeiten, ohne dass ein neuer Eintrag entsteht oder andere Tage sich ändern
- [ ] Die Hauptansicht zeigt immer das neueste Setup
- [ ] Daten bleiben nach dem Schließen der App erhalten
- [ ] Excel-Export enthält alle Tage aller Bikes und lässt sich in Excel/Numbers öffnen
- [ ] Ein exportiertes Backup lässt sich wieder importieren und ergibt denselben Datenstand

## 9. Annahmen (bei Bedarf ändern)
- Einheiten: Luftdruck in **psi**, Federrate in **lbs**
- Schrittweiten: 1 psi, 25 lbs, 1 Token, 1 Klick
- Keine Obergrenzen für Klicks
- Hosting über **GitHub Pages** (HTTPS ist für die Offline-Funktion nötig); dafür braucht es einen GitHub-Account
