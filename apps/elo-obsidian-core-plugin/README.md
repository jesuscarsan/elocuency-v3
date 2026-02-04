# Unresolved Link Note Generator

Obsidian plugin that scans your vault for unresolved wiki links and creates stub notes for each one.

## Development

```bash
npm install
npm run build
```

The `dev` script runs esbuild in watch mode for a faster feedback loop.

### Linting and formatting

- VS Code users: install the official Prettier and ESLint extensions. The workspace enables format-on-save, running Prettier first and `source.fixAll.eslint` afterwards for TypeScript and JavaScript files.
- Run `npm run lint` for static analysis and `npm run format` to rewrite files with Prettier outside the editor.

## Usage

1. Copy `manifest.json`, `build/main.js`, `data.json` and `styles.css` (if present) into your Obsidian vault's `.obsidian/plugins/elo-unresolved-note-generator` directory.
2. Enable the plugin inside Obsidian's community plugins settings.
3. Run the **Create notes for unresolved links** command from the command palette whenever you want to generate missing notes.

The settings tab lets you pick where new notes should be created and define the template text that seeds each file.

### Optional enrichments

- Provide your Gemini API key if you want the plugin to fill empty notes with AI-generated descriptions.
- Provide a Google Maps Geography API key to populate `municipio`, `provincia`, `region` y `pais` when you apply a template labelled "Lugar". If Google Maps cannot determine a component, the frontmatter still includes the key with an empty value so you can complete it later.

The compiled bundle now lives under `build/`. If you symlink this repository into your vault for development, point Obsidian to the folder that includes `manifest.json` and the `build` directory so it can load `build/main.js`.
