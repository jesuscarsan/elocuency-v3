import asyncio
import sys
import os

# Add the project root to the python path
sys.path.append(os.path.join(os.path.dirname(__file__), "../../../elo-server"))

from src.infrastructure.mcp.manager import MCPManager

async def test_mcp_manager():
    print("Initializing MCP Manager...")
    manager = MCPManager()
    
    print("Starting MCP Manager...")
    await manager.start()
    
    try:
        print("Fetching tools...")
        tools = await manager.get_tools()
        
        if not tools:
            print("❌ No tools found!")
            return
            
        print(f"✅ Found {len(tools)} tools:")
        for tool in tools:
            print(f"  - {tool.name}: {tool.description}")
            
        # Optional: Try to invoke a tool if possible, e.g. list notes
        # This depends on the exact tool names provided by bitbonsai/mcp-obsidian
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
    finally:
        print("Stopping MCP Manager...")
        await manager.stop()

if __name__ == "__main__":
    asyncio.run(test_mcp_manager())
