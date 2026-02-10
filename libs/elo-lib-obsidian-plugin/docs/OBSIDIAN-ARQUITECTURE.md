# Directrices de Arquitectura Hexagonal para Plugin de Obsidian

Este proyecto sigue una Arquitectura Hexagonal (Puertos y Adaptadores) estricta para asegurar que la lógica de negocio sea agnóstica a la API de Obsidian, facilitando el testing y la mantenibilidad.

## 1. Reglas de Dependencia (Invariantes)

1. **Regla de Oro:** El código dentro de `src/domain` y `src/application` **NUNCA** debe importar `'obsidian'`.
2. **Inversión de Dependencias:** Las capas internas definen interfaces (Puertos); las capas externas (Infraestructura) las implementan.
3. **Aislamiento de API:** Todas las llamadas a APIs externas deben pasar por un adaptador en `infrastructure`. No usar `fetch` directamente en la lógica de negocio; usar los puertos definidos.
4. **UI Pasiva:** La capa de UI (`src/ui`) no debe contener lógica de negocio compleja. Debe delegar en los Casos de Uso (`src/application`).

## 2. Estructura de Directorios y Responsabilidadestext

```
src/
├── domain/                 # HEXÁGONO INTERIOR (Puro TypeScript, Sin Obsidian)
│   ├── models/             # Entidades y Value Objects (Interfaces/Clases puras).
│   ├── ports/              # Interfaces que definen contratos (Repositorios, Servicios Ext).
│   └── errors/             # Errores personalizados del dominio.
│
├── application/            # CASOS DE USO (Orquestación)
│   └── use-cases/          # Clases con un método execute(). Coordinan Dominio y Puertos.
│                           # Ejemplo: SyncNotesUseCase.ts
│
├── infrastructure/         # ADAPTADORES (El código "sucio" va aquí)
│   ├── obsidian/           # Implementaciones concretas usando la API de Obsidian.
│   │   ├── ObsidianNoteRepository.ts  # Implementa NoteRepository usando app.vault
│   │   └── ObsidianSettingTab.ts      # UI de configuración nativa.
│   ├── api/                # Adaptadores para APIs Externas (REST/GraphQL).
│   │   ├── dtos/           # Interfaces que replican el JSON crudo de la API. No usar any
│   │   ├── mappers/        # Convierten entre el DTO y los modelos de dominio 
│   │   └── HttpApiClient.ts           # Implementa ApiPort usando requestUrl de Obsian
│   └── services/           # Otros servicios de infraestructura (ej. Logger, Parser).
│
├── ui/                     # VISTAS (React/Svelte/HTML nativo)
│   ├── components/         # Componentes visuales "tontos".
│   └── views/              # Vistas de Obsidian (ItemView) que montan los componentes.
│
└── main.ts                 # COMPOSITION ROOT (Punto de entrada)
````

## 3. Guía de Implementación para la IA

### A. Creación de una Nueva Feature
Para implementar una funcionalidad nueva (ej. "Descargar Tarea"):

1.  **Definir Dominio:** Crea la interfaz/modelo en `domain/models` (ej. `Task`).
2.  **Definir Puerto:** Crea la interfaz del repositorio en `domain/ports` (ej. `TaskRepository`).
3.  **Crear Caso de Uso:** Implementa la lógica en `application` (ej. `DownloadTask.ts`) inyectando el puerto en el constructor.
4.  **Implementar Infraestructura:** Crea el adaptador en `infrastructure/obsidian` o `infrastructure/api` que cumpla con el puerto. Aquí sí importas `obsidian` o usas `requestUrl`.
5.  **Inyectar en Main:** En `main.ts`, instancia el adaptador y pásalo al caso de uso.

### B. Patrón de Inyección de Dependencias (Pure DI)
No usar frameworks de DI. Realizar inyección manual en `main.ts`:

```typescript
// src/main.ts
async onload() {
    // 1. Instanciar Adaptadores (Infraestructura)
    const noteRepo = new ObsidianNoteRepository(this.app);
    const apiClient = new TodoistApiClient(this.settings.apiKey);

    // 2. Instanciar Casos de Uso (Aplicación) - Inyectando adaptadores
    const syncUseCase = new SyncUseCase(noteRepo, apiClient);

    // 3. Inicializar UI/Comandos - Inyectando casos de uso
    this.addCommand({
        id: 'sync-now',
        name: 'Sync Now',
        callback: () => syncUseCase.execute()
    });
}

```

### C. Manejo de APIs Externas

* Utilizar siempre `requestUrl` (importado de `'obsidian'`) dentro de los adaptadores de infraestructura para evitar problemas de CORS.
* Mapear los DTOs de la API externa a Modelos de Dominio dentro del adaptador (Patrón Anti-Corruption Layer).

### D. Testing

* **Unit Tests:** Deben cubrir `domain` y `application`. Ejecutarse con `vitest` o `jest` sin mocks de Obsidian.
* **Integration Tests:** Solo para `infrastructure`. Requieren mocks de `app`, `vault` o `requestUrl`.
