# Apply Place Type Command

Este comando es una versión extendida de [Apply Geocoder Command](./EnrichPlaceCommand/ApplyGeocoderCommand.md) que además clasifica el tipo de lugar.

## ¿Cómo funciona?

1.  **Análisis con IA**: Antes de geolocalizar, pregunta a la IA qué tipo de lugar es basándose en su nombre (ej. "¿McDonalds es un Restaurante?").
2.  **Clasificación (Tags)**:
    *   Sugiere una etiqueta de la lista de `PlaceTypes` (ej. `Lugares/Restaurante`, `Lugares/Museo`).
    *   Si la IA está muy segura, aplica la etiqueta automáticamente.
    *   Si la IA duda, abre un menú para que el usuario elija el tipo correcto.
3.  **Actualización de Frontmatter**: Añade la etiqueta seleccionada al campo `tags`.
4.  **Geolocalización**: Ejecuta automáticamente el proceso de `Apply Geocoder Command` para rellenar datos geográficos y mover la nota.

## Flujo de Uso

1.  Creas una nota llamada `[[Museo del Prado]]`.
2.  Ejecutas **"Indicate Place Type"**.
3.  El sistema detecta que es un museo y añade `#Lugares/Museo`.
4.  El sistema busca la dirección, coordenadas, etc.
5.  La nota se mueve a `Lugares/Europa/España/Comunidad de Madrid/Madrid/Museo del Prado.md`.
