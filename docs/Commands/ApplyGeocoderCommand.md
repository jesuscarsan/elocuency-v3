# Apply Geocoder Command

Este comando enriquece la nota de un lugar con información geográfica y la mueve a una estructura de carpetas organizada.

## ¿Cómo funciona?

1.  **Lectura del Nombre**: Toma el nombre de la nota como el lugar a buscar.
2.  **Enriquecimiento (Geocoding + IA)**:
    *   Usa Google Maps Geocoding API para obtener coordenadas y componentes de dirección.
    *   Usa Google Gemini (IA) para refinar los detalles y asegurar que la información sea culturalmente correcta (ej. nombres de regiones en español).
3.  **Actualización del Frontmatter**: Rellena automáticamente campos como:
    *   `Municipio`, `Provincia`, `Region`, `País`
    *   `Latitud`, `Longitud`
    *   `Lugar Id`
    *   `Capital` (si aplica)
4.  **Reorganización (Move)**: Mueve la nota a una jerarquía de carpetas basada en su ubicación.
    *   Ejemplo: `Lugares/Europa/España/Comunidad de Madrid/Madrid/Puerta del Sol.md`

## Requisitos

*   API Key de Google Maps (Geocoding) configurada.
*   API Key de Google Gemini configurada.

## Estructura de Carpetas Generada

El comando intenta crear una estructura lógica:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [Región/Comunidad] / [Provincia] / [Municipio] / Nota.md`
