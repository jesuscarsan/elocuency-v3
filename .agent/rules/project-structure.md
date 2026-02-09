# Project Structure & Architecture Rules

This project follows **Hexagonal Architecture (Ports & Adapters)** and **Domain-Driven Design (DDD)**.
These rules apply to all applications within the `apps/` directory.

## Core Principles
1.  **Dependency Rule**: Dependencies point **inwards**.
    *   `Infrastructure` -> `Application` -> `Domain`
    *   `Domain` depends on NOTHING.
2.  **Abstractions**: High-level modules should not depend on low-level modules. Both should depend on abstractions (Ports).

## Layer Definitions

### 1. Domain (`src/Domain`)
*   **Content**: Business Logic, Entities, Value Objects, and **Ports** (Interfaces).
*   **Strict Rules**:
    *   ⛔️ **NEVER** import from `Application` or `Infrastructure`.
    *   ⛔️ **NEVER** import external frameworks (e.g., `obsidian` API, React).
    *   ✅ **DEFINE** interfaces (Ports) here for any external interaction (database, API, UI).

### 2. Application (`src/Application`)
*   **Content**: Use Cases, Application Services.
*   **Strict Rules**:
    *   ✅ **IMPORT** from `Domain`.
    *   ⛔️ **NEVER** import concrete implementations from `Infrastructure`.
    *   ✅ **USE** Domain Ports to interact with the outside world.

### 3. Infrastructure (`src/Infrastructure`)
*   **Content**: Framework implementations, API Clients, UI (Obsidian Views/Commands), File System access.
*   **Strict Rules**:
    *   ✅ **IMPORT** from `Domain` and `Application`.
    *   ✅ **IMPLEMENT** Domain Ports here (Adapters).
    *   ✅ **EXCLUSIVE**: This is the ONLY layer allowed to use the `obsidian` API or UI libraries.

## Workflow & Location Guide

When adding new features, identify the component type and place it correctly:

| Component Type | Directory | Naming Pattern |
| :--- | :--- | :--- |
| **Interface/Port** | `src/Domain/Ports` | `[Name]Port.ts` |
| **Entity/Model** | `src/Domain/Models` | `[Name].ts` |
| **Business Logic** | `src/Application/UseCases` | `[Verb][Noun]UseCase.ts` |
| **API/DB Adapter** | `src/Infrastructure/Adapters` | `[Specific][Interface]Adapter.ts` |
| **Obsidian UI** | `src/Infrastructure/Obsidian/Views` | `[Name]View.ts` |
| **Obsidian Cmd** | `src/Infrastructure/Obsidian/Commands` | `[Name]Command.ts` |

## Coding Standards

### Imports
*   **Aliases**: ALWAYS use `@/` for absolute imports.
    *   ✅ `import { User } from '@/Domain/Models/User'`
    *   ⛔️ `import { User } from '../../Domain/Models/User'`
*   **Barrel Files**: `index.ts` are ONLY allowed at the root of `Domain`, `Application`, and `Infrastructure`. They are forbidden in subdirectories.

### Testing
*   **Co-location**: Tests MUST be placed next to the file they test.
*   **Naming**: `[Filename].test.ts`.

### Specific Utilities
*   **Notifications**: Use the internal utility `showMessage` instead of `new Notice` to ensure consistency.
