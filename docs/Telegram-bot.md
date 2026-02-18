1. Crear el Bot de Telegram
   Abre Telegram y busca a @BotFather.
   Envía el comando /newbot y sigue las instrucciones para elegir un nombre (p.ej. "Elocuency Bot") y un username único (p.ej. "mielocuency_bot").
   Copia el API Token que te dará al terminar.
2. Configurar n8n
   Abre tu n8n (o asegúrate de que esté corriendo con docker-compose up -d).
   Ve a Workflows -> Add Workflow (o el botón "+").
   En el menú de arriba a la derecha (tres puntos), selecciona Import from File y elige el archivo: telegram_to_langchain.json que está en: /Users/joshua/my-docs/code/elocuency-v3/apps/elo-server/workspace/n8n-workflows/
   Configura las credenciales:
   Haz doble clic en el nodo Telegram Trigger.
   En Credential for Telegram API, selecciona "Create New Credential".
   Pega tu Access Token de BotFather.
   Haz lo mismo en el nodo Telegram Reply (puedes reutilizar la credencial que acabas de crear).
   Activa el flujo: Dale al interruptor Active (arriba a la derecha).
3. Prueba
   Envía un mensaje a tu nuevo bot en Telegram. Debería responderte usando tu servidor de LangChain.
