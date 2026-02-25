import { Command } from 'commander';

export const completionCommand = new Command('completion')
  .description('Generate shell autocompletion scripts')
  .addCommand(
    new Command('zsh')
      .description('Generate zsh completion script')
      .action(() => {
        const script = `#compdef elo

_elo() {
  local line
  local -a commands
  commands=(
    'server:Manage Elo server environment'
    'auth:Authentication utilities'
    'mcp:Manage Model Context Protocol (MCP) integrations'
    'completion:Generate shell autocompletion scripts'
    'chat:Start an interactive chat session'
  )

  _arguments -C \\
    "1: :->cmds" \\
    "*::arg:->args"

  case $state in
    cmds)
      _describe -t commands 'elo command' commands
      ;;
    args)
      case $words[1] in
        server)
          local -a server_commands
          server_commands=(
            'start:Launch Elo environment (Docker or Dev)'
            'stop:Stop Elo environment (Docker)'
          )
          _describe -t server_commands 'server command' server_commands
          ;;
        auth)
          local -a auth_commands
          auth_commands=(
            'generate:Generate a secure, random authentication token'
          )
          _describe -t auth_commands 'auth command' auth_commands
          ;;
        mcp)
          local -a mcp_commands
          mcp_commands=(
            'add:Install a new MCP'
          )
          _describe -t mcp_commands 'mcp command' mcp_commands
          ;;
      esac
      ;;
  esac
}

_elo "$@"
`;
        process.stdout.write(script);
      }),
  );
