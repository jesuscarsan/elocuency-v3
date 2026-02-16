import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.infrastructure.config import load_config
from src.infrastructure.adapters.ai.langgraph_agent_adapter import LangGraphAgentAdapter
from src.application.use_cases.ask_ai_use_case import AskAIUseCase
from src.infrastructure.adapters.api.fastapi_adapter import create_app
from src.infrastructure.mcp.manager import MCPManager
from src.infrastructure.tools.local_tool_manager import LocalToolManager

# Load configuration
config = load_config()

# Global instances (needed for lifespan access)
mcp_manager = MCPManager()
local_tool_manager = LocalToolManager()
ai_adapter = LangGraphAgentAdapter(
    api_key=config.ai.api_key, 
    model_name=config.ai.model
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for the FastAPI application.
    Handles startup and shutdown events for async components like MCP.
    """
    # Startup
    print("Starting MCP Manager...")
    await mcp_manager.start()
    
    try:
        mcp_tools = await mcp_manager.get_tools()
        local_tools = local_tool_manager.load_tools()
        management_tools = local_tool_manager.get_management_tools()
        
        all_tools = mcp_tools + local_tools + management_tools
        
        if all_tools:
            print(f"Binding {len(all_tools)} tools ({len(mcp_tools)} MCP, {len(local_tools)} local) to AI adapter.")
            ai_adapter.bind_tools(all_tools)
        else:
            print("No tools found.")
    except Exception as e:
        print(f"Error binding tools: {e}")

    yield
    
    # Shutdown
    print("Stopping MCP Manager...")
    await mcp_manager.stop()

from langserve import add_routes

# ... imports ...

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
        cfg = config.copy()
        configurable = cfg.get("configurable", {})
        
        # Map session_id to thread_id
        if "session_id" in configurable:
            configurable["thread_id"] = configurable["session_id"]
        elif "thread_id" not in configurable:
            configurable["thread_id"] = "default_playground_thread"
            
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

    # Middleware to fix Pydantic v2 'const' -> 'enum' for LangServe chat playground.
    # The chat playground frontend checks `option.properties?.type?.enum?.includes("ai")`
    # but Pydantic v2 generates `const: "ai"` instead of `enum: ["ai"]`.
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response
    import json as json_module

    class ConstToEnumMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            path = request.url.path
            if path.endswith("/output_schema") or path.endswith("/playground/"):
                body = b""
                async for chunk in response.body_iterator:
                    if isinstance(chunk, str):
                        body += chunk.encode()
                    else:
                        body += chunk
                text = body.decode()
                # Replace "const": "ai" with "enum": ["ai"] (and similar message types)
                import re
                text = re.sub(
                    r'"const":\s*"(ai|human|chat|system|function|tool|AIMessageChunk|HumanMessageChunk|ChatMessageChunk|SystemMessageChunk|FunctionMessageChunk|ToolMessageChunk)"',
                    lambda m: f'"enum": ["{m.group(1)}"]',
                    text
                )
                return Response(
                    content=text,
                    status_code=response.status_code,
                    headers={k: v for k, v in response.headers.items() if k.lower() != 'content-length'},
                    media_type=response.media_type
                )
            return response

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
