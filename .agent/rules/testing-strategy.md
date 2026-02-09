# Testing Strategy & Guidelines

This project prioritizes **ROBUSTNESS** over **SPEED**.
Tests should serve as living documentation and be resilient to refactoring.

## Core Principles
1.  **Documentation**: Tests explain *what* the system does, not *how*.
2.  **Decoupling**: Tests in one layer must NOT break due to changes in another.
3.  **Refactor-Proof**: Test **observable behavior** (Public API), NOT internal implementation details.

## Layer-Specific Strategies

### 1. Domain Layer (`src/Domain`)
*   **Goal**: Verify pure business rules and invariants.
*   **Type**: Pure Unit Tests.
*   **Tools**: Jest (no heavy mocks).
*   **Rules**:
    *   ✅ **Instantiate** real Entities and Value Objects.
    *   ⛔️ **NEVER Mock** Domain Entities. If it's hard to instantiate, the design is complex.
    *   **Location**: `tests/Unit/Domain` or co-located `src/Domain/.../*.test.ts`.

### 2. Application Layer (`src/Application`)
*   **Goal**: Verify Use Case orchestration and user flows.
*   **Type**: Unit (Sociable) / Narrow Integration.
*   **Rules**:
    *   ✅ **Mock ONLY Ports** (Interfaces) defined in `Domain/Ports`.
    *   ⛔️ **NEVER Mock** concrete Infrastructure implementations (e.g., mock `LlmPort`, NOT `GeminiAdapter`).
    *   ✅ **Use Fakes** (In-Memory implementations) over Mocks/Spies for Repositories.
    *   **Location**: `tests/Unit/Application` or co-located `src/Application/.../*.test.ts`.

### 3. Infrastructure Layer (`src/Infrastructure`)
*   **Goal**: Ensure adapters work with the real world (or faithful simulations).
*   **Type**: Integration Tests.
*   **Rules**:
    *   ✅ **Verify Contracts**: Adapters must fulfill the Port's contract.
    *   ✅ **Real APIs**: Use real APIs where reasonable, or high-fidelity mocks of external libraries.
    *   **Location**: `tests/Integration/Infrastructure` or co-located `src/Infrastructure/.../*.test.ts`.

## Maintainability Practices

### Object Mothers
*   **Use Factories**: Create valid domain objects using Object Mothers to avoid cluttering tests with huge JSONs.
    *   ✅ `const session = SessionMother.createActive({ duration: 60 });`
    *   ⛔️ `const session = new Session("id", "active", ...);`

### Given-When-Then (GWT)
*   **Structure**: ALWAYS use the GWT pattern for test bodies to enhance readability.
    ```typescript
    it('should ...', async () => {
        // GIVEN
        const session = SessionMother.createActive();
        // WHEN
        await service.finish(session.id);
        // THEN
        expect(repo.findById(session.id).isFinished()).toBe(true);
    });
    ```

### Coverage
*   **Threshold**: Maintain or improve code coverage. Minimum goal: **30%**.
