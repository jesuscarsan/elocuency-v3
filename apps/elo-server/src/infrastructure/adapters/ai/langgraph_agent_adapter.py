from typing import Any, List, Optional, Sequence, Type
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
import os
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, BaseMessage
from langchain_core.runnables import Runnable

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

    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash", tools: Optional[List] = None, base_storage_path: str = "workspace/users", vault_path: Optional[str] = None):
        if not api_key:
            raise ValueError("API key must be provided")
            
        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=0.7
        )
        
        self.tools = tools or []
        self.base_storage_path = Path(base_storage_path)
        self.vault_path = Path(vault_path) if vault_path else None
        if not self.base_storage_path.exists():
            self.base_storage_path.mkdir(parents=True, exist_ok=True)
            
        self.checkpointer = MemorySaver()
        self.graph = None
        
        # Load vault schema if available
        self.vault_schema = self._load_vault_schema()
        
        self._initialize_agent()

    def _load_vault_schema(self) -> dict:
        """Loads frontmatter keys from .obsidian/types.json if it exists."""
        if not self.vault_path:
            return {}
            
        # Try both direct path and inside .obsidian
        schema_path = self.vault_path / ".obsidian" / "types.json"
        if not schema_path.exists():
            return {}

        try:
            import json
            with open(schema_path, "r") as f:
                data = json.load(f)
                return data.get("types", {})
        except Exception as e:
            print(f"Warning: Could not load vault schema: {e}")
            return {}

    def _initialize_agent(self):
        """
        Initializes the ReAct agent with MemorySaver persistence and system prompt.
        """
        system_msg = (
            "You are a powerful AI assistant with full access to an Obsidian vault and an n8n automation environment. "
            "You can read, search, and modify notes, as well as list, call, and CREATE n8n workflows. "
            "\n\nProactivity: If a user asks for a capability you don't have (like WhatsApp integration or email notifications), "
            "check if you can solve it by CREATE-ing an n8n workflow. If you can't build it yourself, "
            "delegate the task to a human with a clear description of what's needed. "
            "\n\nCRITICAL: If you encounter a task that you cannot complete with your current tools, "
            "OR if you need to ask the user a question, clarify requirements, or get permission to proceed, "
            "you MUST use the 'delegate_to_human' tool. "
            "Call it as: delegate_to_human(reason='detailed reason or your question here'). "
            "Do NOT wrap the tool call in markdown code blocks. Use the tool calling API provided to you. "
            "Do NOT ask questions, offer options, or explain why you can't do it in your final response text; use the tool instead. "
            "If you see a '<!-- DELEGATED_TO_HUMAN -->' marker in the task, it means you have already asked for help. "
            "Check for any new human-written notes or updated instructions in the vault or workspace before continuing."
        )
        
        if self.vault_schema:
            schema_keys = ", ".join(list(self.vault_schema.keys()))
            system_msg += (
                f"\n\nVault Metadata Schema (Frontmatter keys):\n{schema_keys}\n"
                "When searching or querying notes, use these exact keys in your queries if possible. "
                "Be aware of accents and specific naming (e.g., 'Oficios', 'Profesión')."
            )

        system_msg += (
            "\n\nIf a tool fails due to missing content or search issues, try using "
            "the Filesystem tools as a fallback or broaden your search."
        )

        self.graph = create_react_agent(
            self.llm, 
            self.tools, 
            checkpointer=self.checkpointer,
            prompt=system_msg
        )

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
        import logging
        logger = logging.getLogger("src.infrastructure.adapters.ai.langgraph_agent_adapter")
        logger.info(f"AI Agent ainvoke | Input: {input}")
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        result = await self.graph.ainvoke(input, config, **kwargs)
        output = self._extract_output(result)
        logger.info(f"AI Agent ainvoke | Output type: {type(output)}")
        if hasattr(output, "content"):
            logger.info(f"AI Agent ainvoke | Output content: {output.content[:50]}...")
        return output

    def stream(self, input, config=None, **kwargs):
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        # Fallback to invoke to ensure stability for now.
        # Yield the extracted message.
        result = self.graph.invoke(input, config, **kwargs)
        yield self._extract_output(result)

    async def astream(self, input, config=None, **kwargs):
        import logging
        logger = logging.getLogger("src.infrastructure.adapters.ai.langgraph_agent_adapter")
        logger.info(f"AI Agent astream | Input: {input}")
        input = self._sanitize_input(input)
        config = self._ensure_config(config)
        # Fallback to ainvoke for stability.
        result = await self.graph.ainvoke(input, config, **kwargs)
        output = self._extract_output(result)
        logger.info(f"AI Agent astream | Yielding: {output}")
        yield output

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
             messages = result["messages"]
             
             # Search backwards for a delegation in the current turn
             # We stop if we see a HumanMessage (which started this turn)
             for msg in reversed(messages):
                 if getattr(msg, "type", "") == "human":
                     break
                 if hasattr(msg, "content") and "DELEGATED_TO_HUMAN:" in str(msg.content):
                     return str(msg.content)

             last_msg = messages[-1]
             if hasattr(last_msg, "content"):
                 return last_msg.content
             return str(last_msg)
             
        return str(result)
