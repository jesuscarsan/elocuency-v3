import asyncio
import sys
import uuid
from langserve import RemoteRunnable

async def main():
    print("Initializing Elo Server Remote CLI...")
    
    # Connect to the local server (running inside the container, so localhost:8001 is correct)
    # The URL pattern for LangServe typically ends with slash
    agent_url = "http://localhost:8001/agent/" 
    
    # Get User ID
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    else:
        user_id = input("Enter User ID (press Enter for random): ").strip()
        
    if not user_id:
        user_id = str(uuid.uuid4())[:8]
        print(f"Generated User ID: {user_id}")
    else:
        print(f"Using User ID: {user_id}")

    try:
        # Pass user_id as header to ensure session persistence
        remote_chain = RemoteRunnable(agent_url, headers={"x-user-id": user_id})
    except Exception as e:
        print(f"Error connecting to agent at {agent_url}: {e}")
        return

    print(f"\nConnected to {agent_url}")
    print("--- Start Chatting (type 'exit' or 'quit' to stop) ---")

    try:
        while True:
            prompt = input("\nUser: ").strip()
            if prompt.lower() in ("exit", "quit"):
                break
            
            if not prompt:
                continue

            print("AI: ", end="", flush=True)
            
            try:
                # Use explicit dict format for input
                input_data = {
                    "messages": [
                        {"type": "human", "content": prompt}
                    ]
                }
                
                # Streaming support
                async for chunk in remote_chain.astream(input_data, config={"configurable": {"user_id": user_id}}):
                    # In LangGraph/RemoteRunnable, chunks can be:
                    # 1. State updates: {'agent': {'messages': [...]}}
                    # 2. Direct message objects (if the server extracts them)
                    # 3. Message chunks (if true streaming is enabled)
                    
                    msg_to_print = None
                    
                    if isinstance(chunk, dict):
                        # Case A: State update with messages list
                        if "messages" in chunk:
                            msg_to_print = chunk["messages"][-1]
                        elif "agent" in chunk and "messages" in chunk["agent"]:
                            msg_to_print = chunk["agent"]["messages"][-1]
                        # Case B: Direct message dict
                        elif chunk.get("type") in ("ai", "AIMessage") or chunk.get("role") == "assistant":
                            msg_to_print = chunk
                        
                        if msg_to_print:
                            # Handle both dicts and message objects
                            content = ""
                            if isinstance(msg_to_print, dict):
                                content = msg_to_print.get("content", "")
                            elif hasattr(msg_to_print, "content"):
                                content = msg_to_print.content
                            
                            # Only print if it's AI content and not empty
                            # (Avoid re-printing user messages or empty tool chunks)
                            if content:
                                print(content, end="", flush=True)
                                
                    elif isinstance(chunk, str):
                        print(chunk, end="", flush=True)
                    elif hasattr(chunk, "content"): # Direct message object
                         print(chunk.content, end="", flush=True)
            except Exception as e:
                print(f"\nError interacting with agent: {e}")
            
            print() # Newline after response

    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
    finally:
        print("Goodbye!")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
