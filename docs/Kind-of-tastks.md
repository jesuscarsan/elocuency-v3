# Cuando se debe usar n8n, MCP o LangChain tools

1. Herramientas que SÍ O SÍ deben ir por n8n
   Criterio: Cualquier servicio que requiera autenticación compleja (OAuth2), que sea propenso a errores de red, o que tenga una interfaz visual de arrastrar y soltar que te ahorre 200 líneas de código.

Google Calendar / Tasks / Gmail: Gestionar los tokens de refresco, las fechas en formato ISO y los ámbitos (scopes) de Google en Python es una pesadilla. n8n lo hace con tres clics y gestiona el login visual del usuario.

Slack / Discord / Telegram: Para enviar notificaciones o alertas. n8n tiene nodos dedicados que formatean los mensajes perfectamente.

CRMs o ERPs externos: (Salesforce, Hubspot, Airtable). Las APIs de estos servicios cambian a menudo; n8n actualiza sus nodos automáticamente.

Webhooks de entrada: Si quieres que una acción externa (ej: te llega un pago en Stripe o un correo) "despierte" a tu asistente.

2. Herramientas que deben ir directamente por MCP
   Criterio: Servicios locales, acceso a archivos del sistema o integraciones profundas con aplicaciones de escritorio que ya tengan un servidor MCP oficial.

Obsidian (Tu Vault): Es tu base de datos principal. La latencia debe ser mínima. Usar el MCP de Obsidian (o conectarse directamente a la Local REST API) es mucho más rápido que pasar por un webhook de n8n.

Filesystem (Sistema de archivos): Para que la IA lea tus PDFs, logs de sistema o scripts locales. Pasar archivos binarios pesados por n8n suele ser ineficiente.

Terminal / Ejecución de código: Si quieres que la IA ejecute comandos en tu servidor o scripts de Python locales.

3. Herramientas que deben ir por "Tools" (Python/LangChain)
   Criterio: Lógica de computación pura, matemáticas, procesamiento de datos locales o utilidades que no salen a internet.

ChromaDB (RAG): El acceso a tu base de datos vectorial debe ser directo desde LangChain. Meter n8n en medio del RAG destrozaría el rendimiento.

Cálculos complejos / Pandas: Si necesitas que la IA analice un CSV y haga una estadística. Se hace en el langchain-server usando librerías de Python.

Búsqueda Web (Tavily / Brave): LangChain tiene integraciones tan directas y optimizadas para esto que no merece la pena montarlo en n8n.
