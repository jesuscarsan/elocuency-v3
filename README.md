# Elocuency

Elocuency is a personal agent framework.
For more info see the docs folder.

# Installation

> ./install.sh

# Configuration

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

# AI Server (Python)

The framework includes a Python-based server for AI interactions, located in `apps/elo-server`.

For detailed installation and usage instructions, please refer to the [Server Documentation](apps/elo-server/README.md).

# Ports

- Elo Server: http://localhost:8001
- Elo web chat: http://localhost:8001/agent/playground/
- n8n: See /elo-workbench/n8n/public-url.txt
