# elo-cli as a Thin Client for elo-server

## Context

The `elo-cli` application currently serves as the command-line interface for the Elocuency monorepo. As the system evolves, there is a question of whether business logic (such as vault configuration, interactive chat sessions, and AI orchestration) should reside within the CLI itself or if the CLI should merely act as a thin wrapper around APIs provided by `elo-server`.

Placing logic in the CLI makes it tightly coupled to Node.js and the terminal environment. However, the architecture demands that other clients (like the Obsidian plugin, Telegram bot, or `elo-mac-bridge`) also need access to this same logic.

## Decision

We will design `elo-cli` strictly as a **Thin Client**. All core business logic, AI orchestration, and complex data manipulation will be centralized in `elo-server` and exposed via its FastAPI HTTP interface. `elo-cli` will consume these APIs rather than implementing the logic itself.

## Justification

### 1. Single Source of Truth for Domain Logic

Following Hexagonal Architecture principles, `elo-server` represents the Domain and Application layers. By moving logic to the server, we ensure that the "brain" of the assistant is programmed only once.

### 2. Universal API Access

Forcing the CLI to consume an API guarantees that an endpoint is created for every meaningful action. Once an endpoint exists for the CLI (e.g., `/api/v1/vault/sync`), it is immediately available for the Obsidian plugin, Telegram bot, or any future client without duplicated effort.

### 3. Separation of Concerns

- **`elo-server` (Domain/Application):** Knows _what_ to do (process natural language, manage the knowledge base).
- **`elo-cli` (Infrastructure/Presentation):** Knows _how_ to present it to the user in a terminal (formatting JSON responses into readable tables, showing loading spinners) and _how_ to translate user input into API requests.

### 4. Essential Ecosystem Role

Despite being a thin client, `elo-cli` cannot be removed. It serves two irreplaceable roles:

- **Developer Experience (DX):** Provides a user-friendly interface (`elo chat`, `elo vault sync`) compared to raw `curl` commands, complete with autocompletion and help menus.
- **Host Orchestration:** Handles infrastructure tasks that the Dockerized server cannot perform on itself (e.g., `elo server start`, `elo server stop`, `elo dev watch`).

## Consequences

### Positive (Pros)

- **Reduced Code Duplication:** Logic is written once in Python (`elo-server`) and reused across all TypeScript/Swift clients.
- **API-First Design:** Enforces the creation of a robust API contract.
- **Maintainable CLI:** The CLI remains lightweight, focusing purely on user experience (parsing flags, formatting output) and host-level orchestration.

### Negative (Cons)

- **Network Overhead:** Actions that could be resolved locally now require an HTTP round-trip to the local server container.
- **Server Dependency:** Interactive commands in `elo-cli` will fail if `elo-server` is not running (though infrastructure commands like `elo server start` will still work).
