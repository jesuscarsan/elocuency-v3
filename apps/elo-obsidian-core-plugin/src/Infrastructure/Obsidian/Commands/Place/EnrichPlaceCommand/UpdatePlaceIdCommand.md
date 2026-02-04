# Update Place ID Command

Este comando asegura que una nota de lugar esté vinculada unívocamente a Google Maps.

## ¿Cómo funciona?

1.  **Construcción de Consulta**: Combina el nombre de la nota con la información geográfica que ya tenga en el frontmatter (`Municipio`, `Región`, `País`) para hacer una búsqueda precisa.
2.  **Búsqueda en Google Maps**: Solicita los detalles del lugar a la API.
3.  **Actualización**:
    *   Guarda el `Place ID` único de Google en el campo `Lugar Id` (con prefijo `google-maps-id:`).
    *   Actualiza o corrige `Latitud` y `Longitud` con los datos exactos del punto en el mapa.

## Diferencia con Apply Geocoder

*   `Apply Geocoder` es más amplio: busca dirección, mueve la nota, crea estructura de carpetas.
*   `Update Place Id` es más quirúrgico: solo busca asegurar el ID y coordenadas correctas sin mover la nota ni cambiar otros metadatos drásticamente.
