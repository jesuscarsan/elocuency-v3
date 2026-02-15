import asyncio
import sys
import uuid
from src.infrastructure.config import load_config
from src.infrastructure.adapters.ai.langgraph_agent_adapter import LangGraphAgentAdapter
from src.application.use_cases.ask_ai_use_case import AskAIUseCase
from src.infrastructure.mcp.manager import MCPManager
from src.infrastructure.tools.local_tool_manager import LocalToolManager

async def main():
    print("Initializing Elo Server CLI...")
    
    # Load config
    try:
        config = load_config()
    except Exception as e:
        print(f"Error loading config: {e}")
        return

    # Initialize Managers
    mcp_manager = MCPManager()
    local_tool_manager = LocalToolManager()
    
    print("Starting MCP Manager...")
    await mcp_manager.start()
    
    # Prepare Tools
    try:
        mcp_tools = await mcp_manager.get_tools()
        local_tools = local_tool_manager.load_tools()
        management_tools = local_tool_manager.get_management_tools()
        all_tools = mcp_tools + local_tools + management_tools
    except Exception as e:
        print(f"Error loading tools: {e}")
        all_tools = []

    # Initialize Adapter
    ai_adapter = LangGraphAgentAdapter(
        api_key=config.ai.api_key, 
        model_name=config.ai.model
    )
    
    if all_tools:
        print(f"Binding {len(all_tools)} tools.")
        ai_adapter.bind_tools(all_tools)
    else:
        print("No tools bound.")

    # Initialize Use Case
    ask_ai_use_case = AskAIUseCase(ai_adapter)

    # Get User ID
    user_id = input("Enter User ID (press Enter for random): ").strip()
    if not user_id:
        user_id = str(uuid.uuid4())
        print(f"Generated User ID: {user_id}")
    else:
        print(f"Using User ID: {user_id}")

    print("\n--- Start Chatting (type 'exit' or 'quit' to stop) ---")

    try:
        while True:
            prompt = input("\nUser: ").strip()
            if prompt.lower() in ("exit", "quit"):
                break
            
            if not prompt:
                continue

            print("AI: ...", end="\r")
            try:
                response = await ask_ai_use_case.execute(prompt, user_id=user_id)
                print(f"AI: {response}")
            except Exception as e:
                print(f"Error: {e}")

    except KeyboardInterrupt:
        print("\nExiting...")
    finally:
        print("Stopping MCP Manager...")
        await mcp_manager.stop()
        print("Goodbye!")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
