## Build and Distribute

Each plugin is located in the `apps/` directory.

### Development (Watch Mode)

To start development with hot-reloading (if configured) or auto-build on change:

1. Navigate to the plugin directory:
   ```bash
   cd apps/elo-obsidian-core-plugin
   ```
2. Run the development script:
   ```bash
   pnpm run dev
   ```
   This will:
   - Bump the patch version of the plugin.
   - Start `esbuild` in watch mode.
   - Automatically copy the compiled `main.js`, `manifest.json`, and `styles.css` to the `.obsidian/plugins/<plugin-id>` directory in all configured vaults.

### Production Build

To build the plugin for distribution (minified):

1. Navigate to the plugin directory.
2. Run the build command:
   ```bash
   pnpm run build
   ```
   The compiled files will be available in the plugin directory (usually `dist/` or root depending on config).

## Architecture

The build process uses a shared configuration located in `libs/obsidian-plugin`. This library handles the common build logic and the distribution to vaults defined in `workspace/elo-config.json`.
