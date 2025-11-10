# Unresolved Link Note Generator

Obsidian plugin that scans your vault for unresolved wiki links and creates stub notes for each one.

## Development

```bash
npm install
npm run build
```

The `dev` script runs esbuild in watch mode for a faster feedback loop.

## Usage

1. Copy `manifest.json`, `build/main.js`, and `styles.css` (if present) into your Obsidian vault's `.obsidian/plugins/elo-unresolved-note-generator` directory.
2. Enable the plugin inside Obsidian's community plugins settings.
3. Run the **Create notes for unresolved links** command from the command palette whenever you want to generate missing notes.

The settings tab lets you pick where new notes should be created and define the template text that seeds each file.

The compiled bundle now lives under `build/`. If you symlink this repository into your vault for development, point Obsidian to the folder that includes `manifest.json` and the `build` directory so it can load `build/main.js`.
