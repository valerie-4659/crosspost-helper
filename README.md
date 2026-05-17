![Crosspost Helper banner](./crossposthelperbanner.png)

# Crosspost Helper

Local-first desktop tool for choosing AI images, tracking manual posts per network, and avoiding duplicate posting.

![Crosspost Helper icon](./crossposthelpericon.png)

## Current Focus

- Index images from local folders.
- Filter images by source, folder, rating, target availability, skipped state, and excluded state.
- Preview images large before posting.
- Mark one or many selected images as posted on one or many targets.
- Exclude images from the active workflow and restore them later.
- Export selected local images into a posting folder.

## Development

```bash
npm install
npm run tauri -- dev
```

Build the macOS app bundle:

```bash
npm run tauri:build:app
```

Start a tagged release:

```bash
npm run release
git push origin main --tags
```

GitHub Actions builds unsigned macOS, Windows, and Linux artifacts from the tag.

After the GitHub release is built, publish with the locally installed itch.io butler:

```bash
npm run release:download -- v0.1.1
npm run release:itch -- v0.1.1
```

## Release Signing

Current builds are unsigned. macOS Gatekeeper and Windows SmartScreen may show warnings on first launch.

## Author

Made by Valerie.
