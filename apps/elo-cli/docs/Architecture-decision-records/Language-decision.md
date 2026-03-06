# Language Selection for elo-cli Development

## Context

We need a command-line utility (`elo-cli`) to manage the Elocuency environment, intercept user inputs, and coordinate the monorepo workspace. Given that the core intelligence (`elo-server`) is written in Python, but the rest of the monorepo heavily utilizes web technologies (Obsidian plugins, web extensions) and is managed via `pnpm`, a language choice must be made for this CLI tool.

We need to decide whether to implement the CLI using Python, a traditional shell scripting language (Bash), or TypeScript (Node.js).

## Decision

We will use **TypeScript (Node.js)** as the primary language for the `elo-cli` application.

## Justification

### 1. Monorepo Ecosystem and Tooling (pnpm)

The Elocuency project is structured as a `pnpm` workspace. Using Node.js for the CLI allows seamless integration with the existing monorepo configuration, package management, and build tools (like `tsup` or `esbuild`).

### 2. Code Reusability

By choosing TypeScript, the CLI can directly import and utilize shared libraries from `libs/core-typescript`. This includes:

- **Zod Schemas**: Reusing data validation logic and API contracts.
- **Types and Interfaces**: Sharing domain models to ensure the CLI remains perfectly synchronized with the other TypeScript applications (e.g., the Obsidian plugins).

### 3. Mature CLI Ecosystem in Node.js

The Node.js ecosystem offers robust, industry-standard, and mature libraries for building command-line interfaces. This factor was critical in our decision. Developing a polished CLI from scratch is time-consuming, but utilizing mature packages such as:

- **`commander`**: For robust argument parsing, command routing, and automated help generation.
- **`chalk`** / **`picocolors`**: For advanced terminal styling and visual feedback.
- **`inquirer`** / **`prompts`**: For interactive user sessions.
  These tools enable rapid development of a high-quality Developer Experience (DX) that would be much harder and slower to replicate cleanly in simple Python or Bash scripts.

### 4. Thin Client Architecture

As established in previous architectural decisions, `elo-cli` acts as a "Thin Client" to `elo-server`. It does not require complex data science libraries, AI orchestration, or heavy data processing capabilities (which are Python's strengths). Its primary responsibilities are HTTP communication, terminal UI formatting, and Docker/host orchestration, for which Node.js is exceptionally well-suited.

## Consequences

### Positive (Pros)

- **Consistency**: Aligns with the language used for the majority of the UI and extension components (plugins, frontend).
- **Maintainability**: Strong typing provided by TypeScript reduces runtime errors and improves developer discoverability.
- **Velocity**: Developers can leverage shared internal libraries, avoiding duplication of domain types and validation logic.

### Negative (Cons)

- **Polyglot Monorepo Overhead**: Requires developers to context-switch between Python (`elo-server`) and TypeScript (`elo-cli`, plugins, libs) when working on full-stack features.
- **Node.js Dependency**: The host machine must have Node.js installed to run the CLI natively, although this is already a fundamental requirement for the entire `pnpm` monorepo.

## Alternatives Considered

- **Python**: Rejected. While it would unify the core backend and CLI languages, Python is isolated from the `pnpm` workspace compilation tooling. It would prevent sharing TypeScript types/schemas with the Obsidian plugins and add friction to the workspace management flow.
- **Bash/Shell Scripting**: Rejected. Shell scripts lack strong typing, are difficult to test, and become unmaintainable as the complexity of the CLI grows (e.g., interactive chats, HTTP API consumption, and complex JSON parsing).
