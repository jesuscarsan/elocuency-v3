import asyncio
from langserve import RemoteRunnable

async def main():
    agent_url = "http://localhost:8001/agent/"
    # Note: Use localhost:8001 because inside the container the port is mapped, or if running locally against container.
    # Wait, if running inside container, it should be localhost:8000 or whatever uvicorn listens on.
    # Uvicorn listens on 0.0.0.0:8000 inside the container.
    # If running from host machine, mapped port is likely 8001 or 8000.
    # Let's assume this script runs INSIDE the container, so localhost:8000 is correct.
    
    user_id = "test-user-header-123"
    remote_chain = RemoteRunnable(agent_url, headers={"x-user-id": user_id})
    
    # This configuration mimics what cli.py sends
    config = {"configurable": {"user_id": user_id}}

    print(f"Sending first message with user_id={user_id}...")
    try:
        # Pydantic v2 might require stricter typing, but let's try dict first
        input_data = {"messages": [{"type": "human", "content": "My favorite fruit is pear."}]}
        response1 = await remote_chain.ainvoke(input_data, config=config)
        print(f"Response 1: {response1.content}")
    except Exception as e:
        print(f"Error 1: {e}")

    print(f"Sending second message with user_id={user_id}...")
    try:
        input_data = {"messages": [{"type": "human", "content": "What is my favorite fruit?"}]}
        response2 = await remote_chain.ainvoke(input_data, config=config)
        print(f"Response 2: {response2.content}")
        
        if "pear" in response2.content.lower():
            print("SUCCESS: Context preserved.")
        else:
            print("FAILURE: Context lost.")
            
    except Exception as e:
        print(f"Error 2: {e}")

if __name__ == "__main__":
    asyncio.run(main())
