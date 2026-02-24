import asyncio
import os
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
from mcp.shared.session import RequestResponder

async def handle_messages(session: ClientSession, allowed_path: str):
    print("Background message handler started.")
    async for message in session.incoming_messages:
        if isinstance(message, RequestResponder):
            print(f"Received request: {message.request.root.method}")
            if message.request.root.method == "roots/list":
                print("Responding to roots/list...")
                await message.respond(types.ListRootsResult(roots=[
                    types.Root(uri=f"file://{allowed_path}", name="project-root")
                ]))
            else:
                print(f"Unknown request: {message.request.root.method}")
        elif isinstance(message, Exception):
            print(f"Session error: {message}")
        else:
            print(f"Received notification: {message.root.method}")

async def test():
    # Define the allowed path
    allowed_path = '/Users/joshua/my-docs/code/elocuency-v3'
    
    params = StdioServerParameters(
        command='npx',
        args=['-y', '@modelcontextprotocol/server-filesystem', allowed_path],
        env=os.environ.copy()
    )
    
    print("Starting client...")
    try:
        async with stdio_client(params) as (read, write):
            print("Connected to stdio.")
            
            async with ClientSession(read, write) as session:
                print("Initializing session...")
                
                # Start message handler in background
                handler_task = asyncio.create_task(handle_messages(session, allowed_path))
                
                await session.initialize()
                print("Fetching tools...")
                tools = await session.list_tools()
                print(f'Tools: {[t.name for t in tools.tools]}')
                
                # Try calling a tool
                print("Calling list_directory...")
                result = await session.call_tool("list_directory", arguments={"path": "."})
                print(f"Result: {result}")
                
                # Cleanup
                handler_task.cancel()
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
