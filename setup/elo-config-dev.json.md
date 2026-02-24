# Elo Configuration Documentation (`elo-config-dev.json`)

This document describes the structure and available settings for the `elo-config-dev.json` file, which centralizes the configuration for the Elocuency development environment.

## Configuration Structure

The file uses JSON format and contains the following top-level keys:

### `availableApps`

- **Type**: `string[]`
- **Description**: A list of applications within the Elocuency ecosystem that are currently available or integrated.
- **Values**: `elo-mac-bridge`, `elo-obsidian-core-plugin`, `elo-server`.

### `sourceUrl`

- **Type**: `string`
- **Description**: The base URL for the project's source code repository.
