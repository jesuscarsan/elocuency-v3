import asyncio
from langserve import RemoteRunnable

async def main():
    agent_url = "http://localhost:8001/agent/"
    user_id = "test-user-header-123"
    
    print("Testing RemoteRunnable with headers...")
    try:
        # Try passing headers to constructor
        remote_chain = RemoteRunnable(agent_url, headers={"x-user-id": user_id})
        print("Constructor accepted headers.")
    except TypeError:
        print("Constructor did NOT accept headers. Trying to set on client...")
        remote_chain = RemoteRunnable(agent_url)
        # Inspect for client
        if hasattr(remote_chain, "client"):
             print("Found 'client' attribute.")
             # It might be httpx.AsyncClient
             remote_chain.client.headers["x-user-id"] = user_id
        elif hasattr(remote_chain, "http_client"):
             print("Found 'http_client' attribute.")
             remote_chain.http_client.headers["x-user-id"] = user_id
        else:
             print("Could not find client attribute. Dir:", dir(remote_chain))

    # Now send a request
    print(f"Sending message with user_id={user_id}...")
    try:
        input_data = {"messages": [{"type": "human", "content": "My name is HeaderTest."}]}
        # We don't implement the server-side header check yet, so this won't "work" for memory 
        # but we can check logs to see if header was sent.
        response1 = await remote_chain.ainvoke(input_data)
        print(f"Response: {response1.content}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
