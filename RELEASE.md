# Release-Ablauf

## Einmalig Einrichten

1. `.env` im Projektstamm anlegen. Diese Datei wird nicht committet.
2. Discord Webhook anlegen: Discord Server -> Kanal-Einstellungen -> Integrationen -> Webhooks.
3. itch.io Projekt anlegen: `https://valerie-4659.itch.io/crossposthelper`.
4. GitHub Remote setzen: `https://github.com/valerie-4659/crosspost-helper`.
5. Lokal `butler` installieren und einloggen.

## `.env`

Siehe `.env.example`.

Pflicht:

- `DISCORD_WEBHOOK_URL`
- `ITCH_USERNAME`
- `ITCH_GAME_SLUG`

GitHub Actions braucht keine itch.io Secrets. itch.io Publish laeuft lokal mit deinem installierten und eingeloggten `butler`.

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

Der Release wird lokal gestartet:

```bash
npm run release
```

Das Script:

- prueft, dass der Git-Worktree sauber ist
- schlaegt einen Patch-Version-Bump vor
- sammelt Commits seit dem letzten Tag als Release-Bullets
- aktualisiert `package.json`
- aktualisiert `package-lock.json`
- aktualisiert `src-tauri/tauri.conf.json`
- erweitert `CHANGELOG.md`
- erweitert den In-App-Changelog in `src/data/changelog.ts`
- fuehrt `npm run build` aus
- erstellt Release-Commit und Git-Tag

Danach pusht du:

```bash
git push origin main --tags
```

Der Tag startet `.github/workflows/release.yml`.

Der GitHub Workflow:

| Schritt | Was passiert | Eingriff noetig |
|---|---|---|
| 1 | macOS Build unsigned auf `macos-latest` | Automatisch |
| 2 | Windows Build unsigned auf `windows-latest` | Automatisch |
| 3 | Linux Build auf `ubuntu-22.04` | Automatisch |
| 4 | Artefakte als GitHub Actions Artifacts hochladen | Automatisch |
| 5 | Artefakte an GitHub Release haengen | Automatisch |
| 6 | Pruefen, dass alle drei Plattformen Artefakte erzeugt haben | Automatisch |

Danach lokal itch.io veroeffentlichen:

```bash
npm run release:download -- v0.1.1
npm run release:itch -- v0.1.1
npm run release:notify-discord
```

`release:download` laedt die GitHub Release Assets nach `dist/release/<tag>/`.

`release:itch` nutzt deinen lokalen `butler` Login und pusht:

- `dist/release/<tag>/macos` -> `valerie-4659/crossposthelper:macos`
- `dist/release/<tag>/windows` -> `valerie-4659/crossposthelper:windows`
- `dist/release/<tag>/linux` -> `valerie-4659/crossposthelper:linux`

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

## Lokaler Test-Build

macOS `.app` lokal bauen:

```bash
npm run tauri:build:app
```

macOS `.app` lokal zippen:

```bash
npm run release:package-local
```

Cross-Platform Release-Artefakte fuer macOS, Windows und Linux werden nicht lokal auf einem Mac gebaut, sondern durch GitHub Actions auf den jeweiligen Betriebssystem-Runnern. Dadurch wird abgesichert, dass die App auf allen drei Zielsystemen kompiliert und paketiert.
