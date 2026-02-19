# Elocuency Framework v3 - Introduction

Elocuency is a framework for developing personal learning and productivity applications with the ambition of becoming a personal operating system: Life OS.

To structure it organically, each functionality for groups of use cases are packaged into apps within their corresponding folder. The framework provides tools and libraries for the coordinated development of these applications.

To make it easy to start using, many initial functionalities are packaged as Obsidian plugins. However, the framework does not depend on Obsidian. Obsidian is the first approach for users.

Although the idea has been maturing for many years, testing different approaches and technologies, now with AI, it is truly possible to carry it out.

The rest of the information can be found in the docs folder. Each app project has its own docs folder.

# Installation

To install the framework and its applications, follow these steps:

1. Install node

2. Install pnpm:

   > npm install -g pnpm

3. Install the monorepo:

   > pnpm install

4. Install the applications. Download from git:

   > pnpm run install-available-apps

   To install only one app:

   > pnpm run install-app elo-obsidian-core-plugin
   > pnpm run install-app elo-obsidian-google-contacts-plugin

5. Run in dev mode:

   > pnpm run dev

   To run only one app in dev mode:

   > pnpm --filter elo-obsidian-core-plugin run dev

# Obsidian Plugins Development

To work with the Obsidian plugins included in the framework (e.g., `elo-obsidian-core-plugin`), you need to configure your environment to enable automatic distribution to your Obsidian vaults.

## Configuration

Create a file named `elo-config.json` in the `workspace/` directory. This file should contain an array of absolute paths to your Obsidian vaults.

**Example `workspace/elo-config.json`:**

```json
{
	"mdVaults": [
		"/Users/yourname/Documents/Obsidian/MyVault",
		"/Users/yourname/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal"
	]
}
```

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

# AI Server (Python)

The framework includes a Python-based server for AI interactions, located in `apps/elo-server`.

For detailed installation and usage instructions, please refer to the [Server Documentation](apps/elo-server/README.md).

### Quick Start

1.  Navigate to `apps/elo-server`.
2.  Install dependencies: `pip install -r requirements.txt`.
3.  Configure `.env` (see `.env.example`).
4.  Run: `python src/main.py`.

### Ports

- Elo Server: http://localhost:8001
- Elo web chat: http://localhost:8001/agent/playground/
- n8n: See /workbench/n8n/public-url.txt
