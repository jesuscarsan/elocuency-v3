import uvicorn
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.infrastructure.config import load_config
from src.infrastructure.adapters.ai.langgraph_agent_adapter import LangGraphAgentAdapter
from src.application.use_cases.ask_ai_use_case import AskAIUseCase
from src.infrastructure.adapters.api.fastapi_adapter import create_app
from src.infrastructure.mcp.manager import MCPManager
from src.infrastructure.tools.local_tool_manager import LocalToolManager

from src.infrastructure.adapters.obsidian.langchain_obsidian_adapter import LangChainObsidianAdapter
from langchain_core.tools import tool

from src.infrastructure.logging.logger import setup_logging, get_logger

# Load configuration first to get paths
config = load_config()

# Initialize logging
log_path = os.path.join(config.paths.workspace, "logs", "elo-server.log")
setup_logging(log_file=log_path)
logger = get_logger(__name__)

# Global instances (needed for lifespan access)
# Global instances (needed for lifespan access)
mcp_manager = MCPManager(workspace_path=config.paths.mcps)
local_tool_manager = LocalToolManager(
    tools_dirs=config.paths.local_tools, 
    root_path=config.paths.root
)
ai_adapter = LangGraphAgentAdapter(
    api_key=config.ai.api_key, 
    model_name=config.ai.model,
    vault_path=config.obsidian.vault_path,
    base_storage_path=os.path.join(config.paths.workspace, "users")
)

# Initialize Obsidian Semantic Search Adapter (optional/lazy)
obsidian_adapter = None
if config.obsidian.vault_path and config.ai.api_key:
    try:
        logger.info(f"Initializing Obsidian Semantic Search for {config.obsidian.vault_path}...")
        obsidian_adapter = LangChainObsidianAdapter(
            vault_path=config.obsidian.vault_path,
            google_api_key=config.ai.api_key,
            persist_directory=config.obsidian.persist_directory
        )
    except Exception as e:
        logger.warning(f"Could not initialize Obsidian Semantic Search: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for the FastAPI application.
    Handles startup and shutdown events for async components like MCP.
    """
    # Startup
    logger.info("Starting MCP Manager...")
    await mcp_manager.start()
    
    try:
        mcp_tools = await mcp_manager.get_tools()
        local_tools = local_tool_manager.load_tools()
        management_tools = local_tool_manager.get_management_tools()
        
        # Add Semantic Search Tool
        semantic_tools = []
        if obsidian_adapter:
            @tool
            def vault_semantic_search(query: str) -> str:
                """
                Searches the Obsidian vault semantically using vector embeddings. 
                Use this when you can't find something with exact text search, 
                when there might be typos, accents, or when looking for concepts.
                Returns document snippets and their paths.
                """
                results = obsidian_adapter.search(query)
                if not results:
                    return "No semantic results found."
                
                formatted = []
                for res in results:
                    formatted.append(f"--- File: {res['path']} ---\n{res['content']}")
                return "\n\n".join(formatted)
            
            semantic_tools.append(vault_semantic_search)

        all_tools = mcp_tools + local_tools + management_tools + semantic_tools
        
        if all_tools:
            logger.info(f"Binding {len(all_tools)} tools ({len(mcp_tools)} MCP, {len(local_tools)} local, {len(semantic_tools)} semantic) to AI adapter.")
            ai_adapter.bind_tools(all_tools)
        else:
            logger.info("No tools found.")
    except Exception as e:
        logger.error(f"Error binding tools: {e}")
        import traceback
        logger.error(traceback.format_exc())

    yield
    
    # Shutdown
    logger.info("Stopping MCP Manager...")
    await mcp_manager.stop()

from langserve import add_routes
import re as re_module
from starlette.types import ASGIApp, Receive, Scope, Send

class ConstToEnumMiddleware:
    """
    Middleware to fix Pydantic v2 'const' -> 'enum' for LangServe chat playground.
    Also patches AI message types for the UI.
    Uses raw ASGI middleware instead of BaseHTTPMiddleware to avoid breaking SSE streaming.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        
        # Intercept streaming paths (/stream_log, /stream) and non-streaming ones
        is_streaming = path.endswith("/stream_log") or path.endswith("/stream")
        is_schema = path.endswith("/output_schema") or path.endswith("/playground/")
        
        if not is_streaming and not is_schema:
            await self.app(scope, receive, send)
            return

        if is_streaming:
            # For streaming paths, patch chunks on the fly without buffering the whole response
            async def streaming_send(message):
                if message["type"] == "http.response.body":
                    chunk = message.get("body", b"")
                    if chunk:
                        try:
                            # Patch "type": "ai" -> "type": "AIMessage" in the chunk
                            text = chunk.decode("utf-8", errors="replace")
                            text = re_module.sub(r'"type":\s*"ai"', '"type": "AIMessage"', text)
                            text = re_module.sub(r'"type":\s*"human"', '"type": "HumanMessage"', text)
                            # Also apply the const->enum fix to streaming chunks if needed
                            text = re_module.sub(
                                r'"const":\s*"(ai|human|chat|system|function|tool|AIMessageChunk|HumanMessageChunk|ChatMessageChunk|SystemMessageChunk|FunctionMessageChunk|ToolMessageChunk)"',
                                lambda m: f'"enum": ["{m.group(1)}"]',
                                text
                            )
                            message["body"] = text.encode("utf-8")
                        except Exception:
                            pass
                await send(message)
            
            await self.app(scope, receive, streaming_send)
            return

        # For schema/playground paths, buffer and apply fix
        response_headers = []
        status_code = 200
        body_chunks = []

        async def capture_send(message):
            nonlocal response_headers, status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
                response_headers = message.get("headers", [])
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))

        await self.app(scope, receive, capture_send)

        body = b"".join(body_chunks)
        try:
            text = body.decode("utf-8", errors="replace")
            
            # Replace "const": "ai" with "enum": ["ai"] (and similar message types)
            text = re_module.sub(
                r'"const":\s*"(ai|human|chat|system|function|tool|AIMessageChunk|HumanMessageChunk|ChatMessageChunk|SystemMessageChunk|FunctionMessageChunk|ToolMessageChunk)"',
                lambda m: f'"enum": ["{m.group(1)}"]',
                text
            )
            # Patch types here as well
            text = re_module.sub(r'"type":\s*"ai"', '"type": "AIMessage"', text)
            text = re_module.sub(r'"type":\s*"human"', '"type": "HumanMessage"', text)

            new_body = text.encode("utf-8")
        except Exception:
            new_body = body

        # Build response headers, excluding content-length (it may have changed)
        out_headers = [
            (k, v) for k, v in response_headers
            if k.lower() != b"content-length"
        ]

        # --- UI Customization Injection ---
        if path.endswith("/playground/"):
            custom_style = """
<style>
    button.share-button { display: none !important; }
    nav > div.flex.items-center > svg { display: none !important; }
    /* Ensure the branding span is visible and looks like a logo */
    nav > div.flex.items-center > span.ml-1 {
        font-weight: 700;
        font-size: 1.25rem;
        color: #1a202c;
        margin-left: 0 !important;
    }
</style>
"""
            custom_script = """
<script>
    (function() {
        const replaceBranding = () => {
            document.title = "Elocuency";
            const span = document.querySelector('nav > div.flex.items-center > span.ml-1');
            if (span && span.textContent !== "Elocuency") {
                span.textContent = "Elocuency";
            }
        };
        replaceBranding();
        const observer = new MutationObserver(replaceBranding);
        observer.observe(document.body, { childList: true, subtree: true });
    })();
</script>
"""
            text = text.replace("</head>", f"{custom_style}</head>")
            text = text.replace("</body>", f"{custom_script}</body>")
            new_body = text.encode("utf-8")
        else:
            new_body = text.encode("utf-8")

        out_headers.append((b"content-length", str(len(new_body)).encode()))

        await send({
            "type": "http.response.start",
            "status": status_code,
            "headers": out_headers,
        })
        await send({
            "type": "http.response.body",
            "body": new_body,
        })

def bootstrap():
    """
    Dependency Injection and application bootstrap.
    """
    # 2. Initialize Use Cases (Application)
    ask_ai_use_case = AskAIUseCase(ai_adapter)
    
    # 3. Initialize API (Infrastructure)
    app = create_app(ask_ai_use_case, lifespan=lifespan)
    
    # 4. Add LangServe Routes
    
    from langchain_core.runnables import RunnableLambda
    from langchain_core.messages import HumanMessage, convert_to_messages

    def adapt_request(input, config):
        """
        Adapts LangServe playground input to LangGraph schema.
        Also maps session_id to thread_id for MemorySaver.
        """
        # Input Sanitization
        if isinstance(input, dict):
            # Fix 'undefined' key issue
            if "undefined" in input:
                input["messages"] = input.pop("undefined")
            
            # Fallback: if 'messages' missing but 'input' exists
            if "messages" not in input and "input" in input:
                val = input["input"]
                if isinstance(val, list):
                    input["messages"] = val
                elif isinstance(val, str):
                    input["messages"] = [HumanMessage(content=val)]
            
            # Convert messages to objects for tracers (fixes 500 error)
            if "messages" in input:
                input["messages"] = convert_to_messages(input["messages"])
        
        return input

    def per_req_config_modifier(config, request):
        """
        Injects thread_id from session_id for MemorySaver compatibility.
        """
        import uuid
        cfg = config.copy()
        configurable = cfg.get("configurable", {})
        
        # Map session_id to thread_id
        if "session_id" in configurable:
            configurable["thread_id"] = configurable["session_id"]
        elif "thread_id" not in configurable:
            configurable["thread_id"] = f"playground_{uuid.uuid4().hex[:8]}"
            
        cfg["configurable"] = configurable
        return cfg


    # Create the chain: Adapter -> Graph
    # We pass ai_adapter directly. The adapter handles input sanitization and stream adaptation.
    # chain = RunnableLambda(adapt_request).with_types(input_type=dict) | ai_adapter

    # TEMP: Reference route to spy on correct stream format
    from langchain_google_genai import ChatGoogleGenerativeAI
    simple_model = ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=config.ai.api_key)
    add_routes(
        app,
        simple_model,
        path="/simple-agent",
        playground_type="chat",
    )

    from src.infrastructure.adapters.ai.langgraph_agent_adapter import ChatInputSchema
    from langchain_core.messages import AnyMessage

    add_routes(
        app,
        ai_adapter.with_types(input_type=ChatInputSchema, output_type=AnyMessage),
        path="/agent",
        playground_type="chat",
        per_req_config_modifier=per_req_config_modifier
    )

    app.add_middleware(ConstToEnumMiddleware)


    return app

app = bootstrap()

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app", 
        host=config.server.host, 
        port=config.server.port, 
        reload=config.server.reload
    )
