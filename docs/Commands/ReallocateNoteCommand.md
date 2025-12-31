# Relocatete Note Command

Este comando se utiliza para **mover la nota actual automáticamente** a la misma carpeta donde se encuentra otra nota relacionada (por ejemplo, una nota de "Lugar" o "Lugares").

## ¿Cómo funciona?

1.  **Busca en el Frontmatter**: El comando lee las propiedades (frontmatter) de la nota que tienes abierta.
2.  **Identifica el destino**: Busca campos específicos que estén configurados para realojamiento (actualmente `Lugar` o `Lugares`).
3.  **Resuelve el enlace**: Toma el valor de ese campo (que suele ser un enlace tipo `[[Nombre de la Nota]]`) y busca dónde está guardada esa nota de destino.
4.  **Mueve la nota**: Mueve tu nota actual a la **misma carpeta** donde reside la nota de destino encontrada.

## Requisitos para que funcione

Para que el comando se ejecute con éxito, la nota actual debe cumplir con lo siguiente:

1.  **Tener Frontmatter**: Debe tener propiedades definidas al inicio.
2.  **Campo Válido**: Debe tener uno de los siguientes campos rellenos:
    *   `Lugar`: Un enlace único (ej. `[[Madrid]]`).
    *   `Lugares`: Una lista de enlaces (el comando usará el primero que encuentre).
3.  **Destino Existente**: La nota enlazada en `Lugar` o `Lugares` debe existir realmente en tu bóveda.

## Ejemplo de Uso

Supongamos que tienes la siguiente estructura de carpetas:

*   📂 `Lugares/Europa/España/Comunidad de Madrid/` -> Aquí está la nota `[[Madrid.md]]`
*   📂 `Bandeja de Entrada/` -> Aquí tienes tu nota `[[Mi Viaje.md]]`

Si en `[[Mi Viaje.md]]` tienes este frontmatter:

```yaml
---
Lugar: [[Madrid]]
---
```

Al ejecutar el comando **"Relocatete Note"** (Cmd/Ctrl + P -> Relocatete Note), la nota `[[Mi Viaje.md]]` se moverá automáticamente de `Bandeja de Entrada/` a `Lugares/Europa/España/Comunidad de Madrid/`.
