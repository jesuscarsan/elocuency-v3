# Estrategia de Testing - Elo Obsidian Ext

> [!IMPORTANT]
> **Filosofía**: En este proyecto priorizamos la **ROBUSTEZ** de los tests sobre la **VELOCIDAD** de ejecución. Un test lento que aporta confianza es infinitamente superior a un test rápido que falla aleatoriamente (flaky) o que hay que reescribir con cada pequeña refactorización.

Esta estrategia está diseñada para alinearse estrictamente con nuestra **Arquitectura Hexagonal**, asegurando que cada capa sea testeada de acuerdo a su responsabilidad y nivel de aislamiento.

## 1. Principios Rectores

1.  **Tests como Documentación Viva**: Los tests deben explicar *qué* hace el sistema, no *cómo* lo hace. Deben ser legibles por un humano sin necesidad de descifrar código críptico.
2.  **Desacoplamiento**: Los tests de una capa no deben romperse si cambiamos la implementación de otra.
    *   Los tests de Dominio NO saben de bases de datos ni de Obsidian.
    *   Los tests de Aplicación NO saben qué librería usamos para la IA.
3.  **Refactor-Proof (Resistencia al Refactor)**: Testeamos el **comportamiento observable** (Public API), nunca detalles internos o métodos privados.

---

## 2. Estrategia por Capas

### 2.1. Domain Layer (`src/Domain`)
*Objetivo: Verificar las reglas de negocio puras e invariantes.*

*   **Tipo de Test**: Unitarios Puros.
*   **Herramientas**: Jest (sin mocks pesados).
*   **Enfoque**:
    *   Se instancian las Entidades y Value Objects reales.
    *   Se verifican los cálculos, validaciones de estado y lógica de dominio.
    *   **Prohibido**: Mockear entidades de dominio. Si una entidad es difícil de instanciar, es un "code smell" de que el diseño es complejo.
    *   **Ubicación**: `tests/Unit/Domain`

### 2.2. Application Layer (`src/Application`)
*Objetivo: Verificar la orquestación de Casos de Uso y flujos de usuario.*

*   **Tipo de Test**: Unitarios (Sociables) / Integración acotada.
*   **Mocks**:
    *   Se mockean **SOLO los Puertos (Interfaces)** definidos en `Domain/Ports`.
    *   Nunca se mockea la implementación concreta de infraestructura (ej. NO mockear `GoogleGeminiLiveAdapter`, mockear `LlmPort`).
*   **Enfoque**:
    *   Testear el `UseCase` como punto de entrada.
    *   Verificar que, dado un input, se llama al puerto correcto o se devuelve el resultado esperado.
    *   Usar **Fakes** en memoria (ej. `InMemoryHistoryRepository`) preferiblemente sobre Mocks/Spies para repositorios, para testear estado.
    *   Ubicación: `tests/Unit/Application`

### 2.3. Infrastructure Layer (`src/Infrastructure`)
*Objetivo: Asegurar que nuestros adaptadores funcionan con el mundo real (o sus simulacros fieles).*

*   **Tipo de Test**: Integración.
*   **Enfoque**:
    *   **Adaptadores**: Verificar que cumplen el contrato del Puerto. Si el puerto dice `connect()`, el adaptador de Obsidian debe llamar a la API real de Obsidian (o un mock de la librería externa).
    *   **Vistas/Comandos**: Testeo manual o tests E2E muy ligeros si es posible. Dada la dificultad de testear UIs en Obsidian, delegamos la lógica a la capa de Aplicación para minimizar la necesidad de tests aquí.
    *   Ubicación: `tests/Integration/Infrastructure`

---

## 3. Prácticas para la Robustez (Maintainability)

Para evitar que los tests se vuelvan una carga, seguiremos estas prácticas:

### 3.1. Object Mothers / Builders
En lugar de repetir JSONs gigantes en cada test, usaremos factorías para crear objetos de dominio válidos.

```typescript
// ✅ Good: Test limpio y enfocado en lo que cambia
const session = SessionMother.createActive({ duration: 60 });

// ❌ Bad: Ruido innecesario y acoplamiento a la estructura de datos
const session = new Session("id", "active", 60, [], null, ...);
```

### 3.2. Given-When-Then (GWT)
Estructura obligatoria para la legibilidad.

```typescript
it('debería finalizar una sesión activa', async () => {
    // GIVEN
    const session = SessionMother.createActive();
    const service = new SessionService(repo);

    // WHEN
    await service.finish(session.id);

    // THEN
    expect(repo.findById(session.id).status).toBe('FINISHED');
});
```

### 3.3. Isolation
Cada test debe ser independiente. No compartir estado mutable entre tests. Usar `beforeEach` para limpiar mocks y resetear repositorios en memoria.

### 3.4. Code Coverage Threshold
> [!IMPORTANT]
> **Mínimo Requerido: 30%**
> Todo código nuevo o modificado debe mantener o mejorar la cobertura. El CI fallará si la cobertura global baja del 30%.

## 4. Tecnologías

*   **Runner**: `jest` (configurado con `ts-jest`).
*   **Asserts**: `expect` (nativo de Jest).
*   **Mocking**: `jest.mock`, `jest.spyOn` (usar con moderación, preferir Fakes para repositorios).
*   **Environment**: `node` (con mocks globales de `obsidian` ya configurados en `tests/__mocks__/obsidian.ts`).

## 5. Resumen del Plan de Ejecución

1.  Consolidar configuración de Jest (ya existente).
2.  Crear `Object Mothers` para las entidades principales (`Session`, `Message`, `User`).
3.  Escribir tests para los Casos de Uso críticos (`StartSession`, `SendMessage`) usando Fakes para los puertos.
4.  Añadir tests de integración para los adaptadores clave (`GeminiAdapter`).

> [!TIP]
> **Regla de Oro**: Si un test es difícil de escribir, **el código es difícil de usar**. Escucha a tus tests, son el primer consumidor de tu API.
