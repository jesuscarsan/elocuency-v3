# Arquitecture

This is a modular monorepo multitechnologies available (now Typescript, Swift, and Python but can be extended). We have code shared in libs and apps that use them.

The monorepo use pnpm for simplicity. In the past, I used NX but it was overkill for this project, with the IA is not necessary its features.

## Apps

Apps are the main entry points for the user. They are the ones that provide the user interface and the functionality. Each app build its own artifact and can be distributed independently but can depend on other libs from the monorepo.
But the apps should be growing in number whithout depending on each other if not required.

## Libs

Libs are the ones that provide the code shared between the apps.

## Core

Elocuency core provide utilities for development and distribution apps around this framework.

# General Apps features

- Core, apps and libs use SOLID principles, and Hexagonal Architecture.
- Allow to configure.
- Allow multilanguage.
- No dependencies between apps if not required.
- Developers can add new apps easily.
