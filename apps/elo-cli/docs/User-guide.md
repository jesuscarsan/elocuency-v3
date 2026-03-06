# Elo CLI Commands Reference

The `elo` command-line utility provides tools for managing the Elo environment, interacting with the AI, and configuring your development workflow.

## General Usage

```bash
elo <command> [subcommand] [options]
```

To see help for any command:

```bash
elo --help
elo <command> --help
```

---

## Server Commands

Manage the Elo server environment (Docker or Development).

### `elo server start`

Launch the Elo environment.

- **Options**:
  - `-d, --dev`: Launch in development mode instead of Docker production mode.
- **Example**: `elo server start` (Starts Docker) or `elo server start --dev`

### `elo server stop`

Stop the Elo Docker environment.

- **Example**: `elo server stop`

### `elo server restart`

Restart the Elo Docker environment.

- **Example**: `elo server restart`

### `elo server generate-token`

Generate a secure, random authentication token for the Elo Server.

- **Usage**: Follow the on-screen instructions to update your `setup/.env` and Obsidian settings.

---

## Chat Command

### `elo chat`

Start an interactive chat session with the Elo AI.

- **Options**:
  - `-u, --user-id <id>`: Specify a custom user ID for the session (useful for maintaining thread continuity).
- **Commands inside chat**:
  - `exit` or `quit`: Stop the session.
  - `cls`: Clear the screen.

---

## MCP Commands

Manage Model Context Protocol (MCP) integrations.

### `elo mcp add <name>`

Install a new MCP integration.

- **Arguments**:
  - `<name>`: The name of the MCP to install.

---

## Development Commands

### `elo dev watch <app>`

Watch and auto-rebuild an application within the monorepo.

- **Arguments**:
  - `<app>`: The name of the application (e.g., `elo-server`, `elo-cli`).

---

## Shell Autocompletion

### `elo completion zsh`

Generate a shell autocompletion script for Zsh.

**To enable permanently**:
Add the following line to your `~/.zshrc`:

```zsh
source <(elo completion zsh)
```

Then restart your terminal or run `source ~/.zshrc`.
