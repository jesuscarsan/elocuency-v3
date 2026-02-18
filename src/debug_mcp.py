import asyncio
import os
import sys

# Add src to path
sys.path.append(os.path.abspath("src"))

from src.infrastructure.mcp.manager import MCPManager

async def test_mcp():
    print("Initializing MCP Manager...")
    manager = MCPManager()
    
    print("Starting MCP Manager...")
    await manager.start()
    
    try:
        print("Fetching tools...")
        tools = await manager.get_tools()
        
        # Find 'obsidian_list_directory'
        list_tool = next((t for t in tools if t.name == "obsidian_list_directory"), None)
        # Find 'obsidian_search_notes'
        search_tool = next((t for t in tools if t.name == "obsidian_search_notes"), None)
        
        if list_tool:
            print(f"Calling tool: {list_tool.name} for 'Personas'")
            result = await list_tool.ainvoke({"path": "Personas"})
            # print(f"Result for 'Personas': {result}")
            print(f"Directory listing successful, found {len(result)} items (truncated logic).")
            
            # Try 5: Root file word
            print("\n--- Try 5: pluribus ---")
            if search_tool:
                result = await search_tool.ainvoke({"query": "pluribus"})
                print(f"Result for 'pluribus': {result}")
            else:
                print("Error: obsidian_search_notes tool not found.")
        else:
            print("Error: obsidian_list_directory not found.")
                    
    except Exception as e:
        print(f"Exception during test: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("Stopping MCP Manager...")
        await manager.stop()

if __name__ == "__main__":
    asyncio.run(test_mcp())
