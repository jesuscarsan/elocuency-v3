# elo-cli

Elo Monorepo CLI utility for managing the project.

## Commands

- `elo server start`: Launch the Elo environment.
- `elo server stop`: Stop the Elo environment.
- `elo auth generate`: Generate a secure authentication token.
- `elo mcp add <name>`: Install a new MCP integration.
- `elo completion zsh`: Generate shell autocompletion script.
- `elo chat`: Start an interactive chat session.

## Shell Autocompletion

To enable autocompletion for `elo` in `zsh`, add the following to your `~/.zshrc`:

```zsh
source <(elo completion zsh)
```

Then restart your terminal or run `source ~/.zshrc`.
