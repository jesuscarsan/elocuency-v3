from typing import Any, List, Optional, Sequence, Type
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, BaseMessage
from langchain_core.runnables import Runnable
from langchain_core.tracers.log_stream import RunLogPatch
from src.domain.ports.ai_port import AIPort


class ChatInputSchema(BaseModel):
    """Input schema for the chat agent. LangServe uses this to build the Playground UI."""
    messages: Sequence[AnyMessage] = Field(
        ...,
        description="The list of chat messages",
    )

class LangGraphAgentAdapter(AIPort, Runnable):

    @property
    def input_schema(self) -> Type[BaseModel]:
        return ChatInputSchema

    @property
    def output_schema(self) -> Type[BaseModel]:
        return AIMessage

    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash", tools: Optional[List] = None, base_storage_path: str = "workspace/users"):
        if not api_key:
            raise ValueError("API key must be provided")
            
        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=0.7
        )
        
        self.tools = tools or []
        self.base_storage_path = Path(base_storage_path)
        self.checkpointer = MemorySaver()
        self.graph = None
        
        self._initialize_agent()

    def _initialize_agent(self):
        """
        Initializes the ReAct agent with MemorySaver persistence.
        """
        self.graph = create_react_agent(self.llm, self.tools, checkpointer=self.checkpointer)
        # self.graph = create_react_agent(self.llm, self.tools)

    def bind_tools(self, tools: List):
        """
        Binds tools to the agent and re-initializes it.
        """
        self.tools = tools
        self._initialize_agent()

    def _ensure_config(self, config, user_id=None):
        """Ensures that the config has a thread_id based on session_id/user_id."""
        config = config or {}
        if "configurable" not in config:
            config["configurable"] = {}
            
        # Map session_id to thread_id if present (LangServe standard)
        if "session_id" in config["configurable"]:
             config["configurable"]["thread_id"] = config["configurable"]["session_id"]
        
        # Or use provided user_id
        if "thread_id" not in config["configurable"]:
            config["configurable"]["thread_id"] = user_id or "default_playground_thread"
            
        return config



    def _sanitize_input(self, input):
        """
        Sanitizes the input logic to ensure 'messages' key exists.
        Fixes issue where LangServe/Playground sends 'undefined' key.
        """
        from langchain_core.messages import convert_to_messages, HumanMessage
        
        if isinstance(input, dict):
            # Fix 'undefined' key issue seen in logs
            if "undefined" in input:
                input["messages"] = input.pop("undefined")
            
            # Fallback: if 'messages' missing but 'input' exists and is a list
            if "messages" not in input and "input" in input:
                val = input["input"]
                if isinstance(val, list):
                    input["messages"] = val
                elif isinstance(val, str):
                    input["messages"] = [HumanMessage(content=val)]
            
            # Convert to message objects (Critical for Tracers)
            if "messages" in input:
                input["messages"] = convert_to_messages(input["messages"])
            
        return input

    def _extract_output(self, result):
        """Extracts the last message content from the graph result."""
        # Result is correct AIMessage or string?
        # Graph returns state dict usually.
        if isinstance(result, dict) and "messages" in result:
             last_msg = result["messages"][-1]
             # Return the message object itself so it has .type for tracers
             return last_msg
        return result

    # Runnable Interface Implementation
    def invoke(self, input, config=None, **kwargs):
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        result = self.graph.invoke(input, config, **kwargs)
        return self._extract_output(result)

    async def ainvoke(self, input, config=None, **kwargs):
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        result = await self.graph.ainvoke(input, config, **kwargs)
        return self._extract_output(result)

    def stream(self, input, config=None, **kwargs):
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        # Fallback to invoke to ensure stability for now.
        # Yield the extracted message.
        result = self.graph.invoke(input, config, **kwargs)
        yield self._extract_output(result)

    async def astream(self, input, config=None, **kwargs):
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        # Fallback to ainvoke to ensure stability for now.
        # Yield the extracted message.
        result = await self.graph.ainvoke(input, config, **kwargs)
        yield self._extract_output(result)

    def _safe_message_to_dict(self, msg):
        """
        Manually converts a message to a dict to ensure JSON serializability.
        Avoids Pydantic model_dump() which might include unsafe types.
        """
        import uuid
        safe_dict = {
            "content": msg.content if hasattr(msg, "content") else str(msg),
            "type": msg.type if hasattr(msg, "type") else "unknown",
            "id": msg.id if hasattr(msg, "id") and msg.id else str(uuid.uuid4()),
            "name": msg.name if hasattr(msg, "name") else None,
            "additional_kwargs": {},
            "response_metadata": {},
            "tool_calls": [],
            "invalid_tool_calls": [],
        }
        
        # Copy basic metadata if safe
        if hasattr(msg, "response_metadata") and isinstance(msg.response_metadata, dict):
             # Filter metadata to strings only just in case
             safe_meta = {}
             for k, v in msg.response_metadata.items():
                 if isinstance(v, (str, int, float, bool, type(None))):
                     safe_meta[k] = v
             safe_dict["response_metadata"] = safe_meta

        return safe_dict

    async def astream_log(self, input, config=None, **kwargs):
        """
        Delegates to the internal graph's astream_log, ensuring input and config are prepared.
        Also adapts the stream for LangServe Playground by hoisting LLM tokens to root.
        """
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        
        
        # We need to inject the stream buffers into the initial Run state
        # effectively making sure they exist when valid operations start arriving.
        first_chunk = True
        
        # RESTORED DYNAMIC LOGIC WITH SANITIZATION
        import asyncio
        # RESTORED DYNAMIC LOGIC WITH SANITIZATION
        import asyncio
        try:
            async for chunk in self.graph.astream_log(input, config, **kwargs):
                ops = []
                for op in chunk.ops:
                    should_yield = False
                    final_op = None

                    # If this is the root run initialization (replace /), inject our buffers
                    if op["op"] == "replace" and op["path"] in ["", "/"]:
                         # NUCLEAR OPTION: Create fresh dict to avoid any LangGraph state pollution
                         import uuid
                         val = {
                             "id": str(uuid.uuid4()),
                             "streamed_output": [],
                             "final_output": None,
                             "logs": {},
                             "name": "/agent",
                             "type": "llm"
                         }
                         # Deep copy op construction
                         final_op = {
                             "op": "replace",
                             "path": "",
                             "value": val
                         }
                         should_yield = True
                    
                    # Unwrap final_output if it's a state dict
                    elif op["path"] == "/final_output" and op["op"] == "replace":
                         val = op.get("value")
                         if isinstance(val, dict):
                             # Fallback: check if 'messages' is at top level (sometimes happens)
                             msgs = None
                             if "agent" in val and isinstance(val["agent"], dict) and "messages" in val["agent"]:
                                  msgs = val["agent"]["messages"]
                             elif "messages" in val:
                                  msgs = val["messages"]
                             
                             if isinstance(msgs, list) and msgs:
                                  last_msg = msgs[-1]
                                  # Aggressive Sanitization with Deep Copy
                                  final_op = {
                                      "op": "replace",
                                      "path": "/final_output",
                                      "value": self._safe_message_to_dict(last_msg)
                                  }
                                  should_yield = True
                    
                    # Hoist ChatGoogleGenerativeAI stream to root for Playground
                    elif "ChatGoogleGenerativeAI" in op["path"] and "streamed_output" in op["path"] and "streamed_output_str" not in op["path"]:
                         val = op.get("value")
                         if isinstance(val, dict) and "messages" in val and isinstance(val["messages"], list):
                             if val["messages"]:
                                 last_msg = val["messages"][-1]
                                 # Rewrite path to root
                                 suffix = ""
                                 if "/streamed_output/" in op["path"]:
                                     suffix = op["path"].split("/streamed_output/")[-1]
                                 
                                 # Deep Copy
                                 final_op = {
                                     "op": op["op"],
                                     "path": f"/streamed_output/{suffix}",
                                     "value": self._safe_message_to_dict(last_msg)
                                 }
                                 should_yield = True

                    if should_yield and final_op:
                        ops.append(final_op)
                
                if ops:
                    yield RunLogPatch(*ops)
                    # Artificial delay to prevent chunked encoding errors
                    import asyncio
                    await asyncio.sleep(0.05)
        except Exception as e:
            print(f"ERROR in astream_log: {e}")
            import traceback
            traceback.print_exc()
            raise e
    def batch(self, inputs, config=None, **kwargs):
        inputs = [self._sanitize_input(i) for i in inputs]
        config = self._ensure_config(config)
        results = self.graph.batch(inputs, config, **kwargs)
        return [self._extract_output(r) for r in results]

    async def abatch(self, inputs, config=None, **kwargs):
        inputs = [self._sanitize_input(i) for i in inputs]
        config = self._ensure_config(config)
        return await self.graph.abatch(inputs, config, **kwargs)

    async def ask(self, prompt: str, user_id: str | None = None) -> str:
        """
        Sends a prompt to the agent and returns the final response.
        Uses user_id as thread_id to maintain session history.
        """
        if not self.graph:
             response = await self.llm.ainvoke(prompt)
             return response.content

        config = self._ensure_config(None, user_id=user_id)
        
        result = await self.graph.ainvoke(
            {"messages": [HumanMessage(content=prompt)]},
            config=config
        )
        
        # Extract the last message content from the state dict
        if isinstance(result, dict) and "messages" in result:
             last_msg = result["messages"][-1]
             if hasattr(last_msg, "content"):
                 return last_msg.content
             return str(last_msg)
             
        return str(result)
