# Apply Stream Brief Command

Este comando genera automáticamente un resumen de un vídeo o streaming y lo añade a la nota.

## ¿Cómo funciona?

1.  **Lectura de URL**: Busca la propiedad `Url` en el frontmatter de la nota actual.
2.  **Obtención de Transcripción**: Descarga la transcripción del vídeo desde la URL proporcionada.
3.  **Generación de Resumen**: Envía la transcripción y el título de la nota a Gemini con la instrucción de crear un resumen en Markdown ("Brief").
4.  **Actualización de la Nota**: Añade el resumen generado al final de la nota bajo el encabezado `## Resumen`.

## Requisitos

*   La nota debe tener un campo frontmatter `Url` válido (ej. enlace de YouTube).
*   API Key de Gemini configurada.
*   El vídeo debe tener subtítulos/transcripción disponibles públicamente para que puedan ser extraídos.
