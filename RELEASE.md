# Release-Ablauf

## Einmalig Einrichten

1. `.env` im Projektstamm anlegen. Diese Datei wird nicht committet.
2. Discord Webhook anlegen: Discord Server -> Kanal-Einstellungen -> Integrationen -> Webhooks.
3. itch.io Projekt anlegen: `https://valerie-4659.itch.io/crossposthelper`.
4. GitHub Remote setzen: `https://github.com/valerie-4659/crosspost-helper`.
5. `butler` installieren und einloggen.

## `.env`

Siehe `.env.example`.

Pflicht:

- `DISCORD_WEBHOOK_URL`
- `ITCH_USERNAME`
- `ITCH_GAME_SLUG`

## Signierung

Die Releases sind aktuell bewusst unsigned:

- macOS: keine Developer-ID-Signatur und keine Apple-Notarisierung.
- Windows: kein Code-Signing-Zertifikat.
- Linux: keine zentrale Signatur, normale Tauri/Linux-Artefakte.

Das bedeutet:

- macOS Gatekeeper kann beim ersten Start warnen. Nutzer muessen die App ggf. ueber Rechtsklick -> Oeffnen starten oder in Systemeinstellungen -> Datenschutz & Sicherheit freigeben.
- Windows SmartScreen kann beim ersten Start warnen. Nutzer muessen die Ausfuehrung ggf. manuell bestaetigen.
- Release-Notes und itch.io Beschreibung muessen klar darauf hinweisen, dass die Builds unsigned sind.

Die Release-Automation darf ohne vorhandene Zertifikate keine Signierungs- oder Notarisierungsschritte erwarten.

## Jeder Release

Ziel fuer die spaetere Automation:

| Schritt | Was passiert | Eingriff noetig |
|---|---|---|
| 1 | Version abfragen, Patch-Bump vorschlagen | Neue Version eingeben oder Enter |
| 2 | Commits seit letztem Release sammeln, Discord-Bullets generieren | Bullets editieren |
| 3 | `package.json` und Tauri-Version aktualisieren | Automatisch |
| 4 | `CHANGELOG.md` oben erweitern | Automatisch |
| 5 | In-App-Changelog der About-Seite erweitern | Automatisch |
| 6 | Git add, commit, tag und push nach GitHub | Automatisch |
| 7 | macOS Build unsigned | Automatisch |
| 8 | Windows Build unsigned | Automatisch |
| 9 | Linux Build | Automatisch |
| 10 | Builds per `butler` nach itch.io pushen | Automatisch |
| 11 | Discord Webhook senden | Automatisch |

## Projektwerte

- GitHub: `https://github.com/valerie-4659/crosspost-helper`
- itch.io: `https://valerie-4659.itch.io/crossposthelper`
- Tauri identifier: `com.crossposthelper.desktop`
- Product name: `Crosspost Helper`
- Banner: `crossposthelperbanner.png`
- Icon: `crossposthelpericon.png`

## Hinweise

Das vorhandene Projekt nutzt Tauri, nicht Electron. Release-Skripte muessen daher Tauri-Artefakte verwenden:

- macOS: `.app` oder `.dmg`
- Windows: `.msi` oder `.exe`, abhaengig von Tauri-Bundle-Konfiguration
- Linux: `.AppImage`, `.deb` oder `.rpm`, abhaengig von Tauri-Bundle-Konfiguration

Fuer macOS kann lokal zum Testen ein unsigniertes `.app`-Bundle gebaut werden:

```bash
npm run tauri:build:app
```

Ein `.dmg` ist optional. Wenn DMG-Packaging lokal Probleme macht, reicht fuer interne Tests und itch.io zuerst das `.app`-Bundle als ZIP.
