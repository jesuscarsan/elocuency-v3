# Search Spotify Artist Command

Este comando conecta tu nota con datos reales de Spotify.

## ¿Cómo funciona?

1.  **Autenticación**: Verifica que tengas un token válido de Spotify (si no, abre el modal de login).
2.  **Búsqueda**: Usa el nombre de la nota actual para buscar artistas en la API de Spotify.
3.  **Selección**:
    *   Si encuentra uno exacto, procede.
    *   Si hay varios, te permite elegir el correcto de una lista.
4.  **Enriquecimiento**: Actualiza el frontmatter con:
    *   `Spotify uri`: Enlace interno de Spotify.
    *   `Estilos musicales`: Géneros asociados.
    *   `"!!images"`: Fotos del artista.
    *   `Spotify popularidad`: Índice de 0 a 100.
5.  **Renombrado**: Si el nombre de la nota no coincide exactamente con el nombre oficial del artista en Spotify, renombra el archivo para corregirlo.

## Requisitos

*   Cuenta de Spotify y claves de API (Client ID/Secret) configuradas en el plugin.
