# Generate Header Metadata Command

Este comando es una utilidad técnica para asegurar que los encabezados de las notas tengan identificadores únicos estables.

## ¿Cómo funciona?

1.  **Análisis de Encabezados**: Recorre todos los encabezados (`#`, `##`, ...) de la nota activa.
2.  **Generación de IDs**: Para cada encabezado, verifica si tiene un Block ID (formato `^id-alfanumerico`).
    *   Si no lo tiene, genera uno único y lo añade al final de la línea del encabezado.
3.  **Sincronización**: Guarda la relación entre el texto del encabezado y su ID en un archivo de metadatos externo (JSON).

## ¿Para qué sirve?

Es fundamental para funcionalidades que requieren rastrear el progreso de lectura o enlazado preciso a secciones, permitiendo que los enlaces sigan funcionando aunque cambie el texto del título, o para mantener estados de "leído/no leído" por sección en el sistema de Gamificación/Progreso.
