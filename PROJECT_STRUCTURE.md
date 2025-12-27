# Estructura del Proyecto y Normas de Arquitectura Hexagonal y Domain Driven Design

Este documento define la estructura de directorios y las reglas de arquitectura que **DEBEN** seguirse para mantener la calidad, escalabilidad y mantenibilidad del código sin hacer sobreingeniería.

## Principio Fundamental

La dependencia fluye **hacia adentro**. El código del Dominio no conoce nada de la Aplicación ni de la Infraestructura. La Aplicación no conoce detalles de la Infraestructura.

## Capas

### 1. Domain (`src/Domain`)
*El núcleo del negocio. Código puro de TypeScript. Sin dependencias externas.*

*   **Contenido**: Entidades, Value Objects, Reglas de Negocio y **Puertos** (Interfaces).
*   **Reglas**:
    *   ⛔️ NO importar nada de `Application` ni `Infrastructure`.
    *   ⛔️ NO usar librerías externas ni frameworks (ej. Obsidian API).
    *   ✅ Definir interfaces (`Ports`) para cualquier interacción con el mundo exterior (Base de datos, APIs, UI).

**Estructura**:
*   `src/Domain/Models/`: Entidades y tipos de datos puros.
*   `src/Domain/Ports/`: Interfaces que deben ser implementadas por la capa de Infraestructura (ej. `LlmPort`, `AudioPlayerPort`).

---

### 2. Application (`src/Application`)
*Orquestación y Casos de Uso. Coordina el flujo de datos entre la UI/Infraestructura y el Dominio.*

*   **Contenido**: Servicios de Aplicación, Casos de Uso (Use Cases).
*   **Reglas**:
    *   ✅ Puede importar de `Domain`.
    *   ⛔️ NO importar implementaciones concretas de `Infrastructure`.
    *   ✅ Usar los `Ports` definidos en Dominio para interactuar con servicios externos.

**Estructura**:
*   `src/Application/UseCases/`: Lógica específica de una acción del usuario (ej. `StartLiveSession`, `ProcessUserMessage`).
*   `src/Application/Services/`: Servicios que agrupan lógica de varios casos de uso si es necesario.

---

### 3. Infrastructure (`src/Infrastructure`)
*El mundo real. Implementaciones concretas, Frameworks y Herramientas.*

*   **Contenido**: UI (Vistas de Obsidian), Adaptadores de APIs (Gemini, OpenAI), Acceso a Archivos, Configuración.
*   **Reglas**:
    *   ✅ Puede importar de `Domain` y `Application`.
    *   ✅ Es el **único** lugar donde se permite usar la API de Obsidian (`obsidian`).
    *   ✅ Aquí se inyectan las dependencias (Dependency Injection).

**Estructura**:
*   `src/Infrastructure/Adapters/`: Implementación de los Puertos (ej. `GoogleGeminiLiveAdapter` implementa `LlmPort`).
*   `src/Infrastructure/Obsidian/`: Código acoplado a Obsidian.
    *   `Views/`: Componentes visuales y React Views.
    *   `Commands/`: Comandos del plugin.
    *   `MarkdownPostProcessors/`: Renderizadores de markdown.

## Guía Rápida de Ubicación

| Tipo de Fichero | Ubicación | Ejemplo |
| :--- | :--- | :--- |
| **Interfaz** de servicio externo | `src/Domain/Ports` | `LlmPort.ts` |
| **Lógica** de negocio pura | `src/Domain/Models` | `Session.ts` |
| **Acción** del usuario (Lógica) | `src/Application/UseCases` | `StartSessionUseCase.ts` |
| **Llamada a API** (Gemini, etc.) | `src/Infrastructure/Adapters` | `GoogleGeminiLiveAdapter.ts` |
| **Vista** / UI (React, HTML) | `src/Infrastructure/Obsidian/Views` | `LiveSessionView.ts` |
| **Comando** de Obsidian | `src/Infrastructure/Obsidian/Commands` | `OpenSessionCommand.ts` |

## Flujo de Trabajo para Nuevas Funcionalidades

1.  **Definir el Puerto (Domain)**: ¿Qué necesito del exterior? (ej. `InventoryRepository`).
2.  **Implementar el Caso de Uso (Application)**: ¿Qué hace el usuario? (ej. `AddItemToInventory`).
3.  **Implementar el Adaptador (Infrastructure)**: ¿Cómo se guarda realmente? (ej. `ObsidianFileRepository`).
4.  **Conectar en la Vista/Comando (Infrastructure)**: Inyectar el adaptador en el caso de uso y ejecutarlo.

## Testing

*   **Principio**: Colocación (Co-location). Los tests viven junto al código que prueban.
*   **Convención de Nombres**: `[NombreFichero].test.ts`.
*   **Ubicación**:
    *   Si pruebas `src/Domain/MyEntity.ts`, el test va en `src/Domain/MyEntity.test.ts`.
    *   Si pruebas `src/Application/UseCases/MyUseCase.ts`, el test va en `src/Application/UseCases/MyUseCase.test.ts`.
*   **Mocks**:
    *   Mocks globales (ej. Obsidian) van en `src/__mocks__`.
    *   Mocks locales pueden ir en una carpeta `__tests__` o `__mocks__` al lado del código si es muy específico, pero preferimos mocks en línea o helpers compartidos en `src/Infrastructure/Testing`.

## Normas de Importación y Barrel Files

Para mantener el proyecto limpio y facilitar la refactorización:

1.  **Barrel Files (`index.ts`)**:
    *   **SOLO** permitidos en los directorios raíz de las capas principales:
        *   `src/Domain/index.ts`
        *   `src/Application/index.ts`
        *   `src/Infrastructure/index.ts`
    *   ⛔️ **PROHIBIDO** crear archivos `index.ts` en subdirectorios (ej. `src/Domain/Models/index.ts`). Esto evita dependencias circulares y problemas de ‘tree-shaking’.

2.  **Imports con Alias (`@`)**:
    *   ✅ Usar siempre el alias `@` para imports absolutos en lugar de rutas relativas largas.
    *   Ejemplo: `import { ... } from '@/Domain/Models/...'` en lugar de `import { ... } from '../../Domain/Models/...'`.
