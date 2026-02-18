import os
import asyncio
from pathlib import Path
from typing import List, Optional
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
from mcp.shared.session import RequestResponder
from langchain_core.tools import StructuredTool

from src.infrastructure.config import load_config
from src.infrastructure.logging.logger import get_logger

logger = get_logger(__name__)

class MCPManager:
    def __init__(self, workspace_path: str):
        self.config = load_config()
        self.workspace_path = Path(workspace_path).resolve()
        self._sessions: List[ClientSession] = []
        self._exit_stack = AsyncExitStack()
        self._background_tasks: List[asyncio.Task] = []

    async def start(self):
        """
        Starts the MCP client sessions.
        """
        # Search for MCP servers in the workspace
        if not self.workspace_path.exists():
            logger.warning(f"MCP workspace path does not exist: {self.workspace_path}")
            return

        for server_dir in self.workspace_path.iterdir():
            if server_dir.is_dir() and not server_dir.name.startswith("."):
                server_name = server_dir.name
                
                # Detect server type and path
                # Standard pattern: workspace/mcps/server-name/src/index.js (or similar)
                # For now, let's assume bitbonsai/mcp-obsidian pattern
                
                server_path = None
                command = None
                args = []
                
                # node/js
                if (server_dir / "dist" / "index.js").exists():
                    server_path = server_dir / "dist" / "index.js"
                    command = "node"
                    args = [str(server_path)]
                elif (server_dir / "index.js").exists():
                    server_path = server_dir / "index.js"
                    command = "node"
                    args = [str(server_path)]
                # python
                elif (server_dir / "src" / server_name / "server.py").exists():
                    server_path = server_dir / "src" / server_name / "server.py"
                    command = "python" # or python3
                    args = [str(server_path)]
                
                if command:
                    try:
                        logger.info(f"Connecting to {server_name} MCP server at {server_path}...")
                        server_params = StdioServerParameters(
                            command=command,
                            args=args,
                            env=os.environ.copy()
                        )
                        
                        # Use AsyncExitStack to manage session lifecycles
                        read, write = await self._exit_stack.enter_async_context(stdio_client(server_params))
                        session = await self._exit_stack.enter_async_context(ClientSession(read, write))
                        
                        await session.initialize()
                        self._sessions.append(session)
                        logger.info(f"Connected to {server_name} MCP server.")
                        
                    except Exception as e:
                        logger.error(f"Error starting MCP server {server_name}: {e}")

    async def stop(self):
        """
        Stops all MCP client sessions.
        """
        await self._exit_stack.aclose()
        self._sessions = []

    async def get_tools(self) -> List[StructuredTool]:
        """
        Fetches tools from all active MCP sessions and converts them to LangChain tools.
        """
        all_langchain_tools = []
        
        for session in self._sessions:
            try:
                # We need a way to identify which server this session belongs to for namespacing
                # For now, let's just use the server's index or name if we can find it
                # Simplified: let's assume we can get it from initialize result or similar
                # For bitbonsai/obsidian, the name is usually 'obsidian'
                
                # Fetch tools from the server
                mcp_tools = await asyncio.wait_for(session.list_tools(), timeout=10.0)
                
                # Namespace tools based on server name (this is a bit hacky as session doesn't store name)
                # Let's try to infer from the list of tools if possible, or just use 'obsidian' for now
                prefix = "obsidian" # Default fallback
                
                for tool in mcp_tools.tools:
                    # Prefix tool name
                    namespaced_name = f"{prefix}_{tool.name}"
                    logger.info(f"  Registering MCP tool: {namespaced_name}")
                    
                    # Store current values in a dictionary to be captured by the closure
                    # Actually, defining a factory function is cleaner
                    def create_mcp_tool_func(session, tool_name, full_name):
                        async def mcp_tool_func(*args, **kwargs):
                            logger.debug(f"mcp_tool_func '{full_name}' called with raw args: {args}, kwargs: {kwargs}")
                            
                            # Handle both positional dict (common in some LangChain calls) and kwargs
                            if args and isinstance(args[0], dict):
                                actual_args = args[0]
                            else:
                                actual_args = kwargs.get("kwargs", kwargs) if "kwargs" in kwargs and len(kwargs) == 1 else kwargs
                            
                            logger.info(f"Calling MCP tool '{tool_name}' (namespaced: {full_name}) with args: {actual_args}")
                            try:
                                result = await session.call_tool(tool_name, arguments=actual_args)
                                
                                # Handle potential error results from MCP
                                if hasattr(result, 'isError') and result.isError:
                                    error_msg = f"MCP tool '{tool_name}' returned an error."
                                    if hasattr(result, 'content'):
                                        for content in result.content:
                                            if hasattr(content, 'text'):
                                                error_msg += f" Details: {content.text}"
                                    return error_msg
                                # Log raw result for debugging
                                logger.debug(f"Raw result from {full_name}: {result}")
                                text_content = []
                                if hasattr(result, 'content'):
                                    for content in result.content:
                                        if hasattr(content, 'text'):
                                             text_content.append(content.text)
                                return "\n\n".join(text_content)
                            except Exception as e:
                                logger.error(f"Error calling MCP tool {full_name}: {e}")
                                return f"Error calling {full_name}: {str(e)}"
                        return mcp_tool_func

                    tool_func = create_mcp_tool_func(session, tool.name, namespaced_name)

                    from pydantic import create_model, Field
                    from typing import Any
                    
                    # Create a simple Pydantic model for arguments based on the tool's JSON Schema
                    props = tool.inputSchema.get("properties", {})
                    fields = {}
                    for prop_name, prop_data in props.items():
                        field_type = Any
                        if prop_data.get("type") == "string":
                            field_type = str
                        elif prop_data.get("type") == "integer":
                            field_type = int
                        elif prop_data.get("type") == "boolean":
                            field_type = bool
                        
                        default = ... if prop_name in tool.inputSchema.get("required", []) else None
                        fields[prop_name] = (field_type, Field(default, description=prop_data.get("description", "")))
                    
                    # If no properties, create an empty model anyway to satisfy StructuredTool
                    args_model = create_model(f"{namespaced_name}_args", **fields)

                    langchain_tool = StructuredTool.from_function(
                        func=None,
                        coroutine=tool_func,
                        name=namespaced_name,
                        description=f"[MCP] {tool.description}",
                        args_schema=args_model
                    )
                    all_langchain_tools.append(langchain_tool)
                    
            except Exception as e:
                logger.error(f"Error fetching tools from session: {e}")
                
        return all_langchain_tools
