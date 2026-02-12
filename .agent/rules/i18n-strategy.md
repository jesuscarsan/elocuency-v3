---
description: Enforce internationalization (i18n) strategy for all elo-obsidian projects.
globs: apps/elo-obsidian-*/**/*
---

# Internationalization (i18n) Strategy

All projects matching the pattern `elo-obsidian-*` MUST implement internationalization using the shared `TranslationService` from `@elo/obsidian-plugin`.

## Rules

1.  **Shared Library Usage**:
    - You MUST use the `ObsidianTranslationAdapter` from `@elo/obsidian-plugin` to handle translations.
    - Do NOT implement custom translation logic within the app.

2.  **Mandatory Languages**:
    - All user-facing text (commands, settings, UI elements, notices) MUST be translated into at least **English (`en`)** and **Spanish (`es`)**.
    - You MUST create a `src/I18n/locales` directory containing `en.ts` and `es.ts`.

3.  **Implementation Pattern**:
    - Define translation keys in `en.ts` and `es.ts` as default exports.
    - Initialize the `ObsidianTranslationAdapter` in your plugin's `onload` method or `main.ts`, passing the locales.
    - Expose the translation service (e.g., as `this.translationService`) for use throughout the plugin.

## Example

```typescript
// src/I18n/locales/en.ts
export default {
	'command.example': 'Example Command',
};

// src/main.ts
import { ObsidianTranslationAdapter } from '@elo/obsidian-plugin';
import en from './I18n/locales/en';
import es from './I18n/locales/es';

// ... inside Plugin class
this.translationService = new ObsidianTranslationAdapter({ en, es });
```
