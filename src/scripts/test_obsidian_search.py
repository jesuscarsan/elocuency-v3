import os
import sys
import urllib.request
import json

def test_search():
    url = "http://localhost:8001/agent/invoke"
    print(f"Testing Obsidian Search via {url}...")
    
    query = "Search for notes with tag #todo or #important using the obsidian search tool."
    
    payload = {
        "input": {
            "messages": [
                {"role": "user", "content": query}
            ]
        },
        "config": {
            "configurable": {
                "user_id": "test-user-mcp",
                "session_id": "test-session-mcp"
            }
        }
    }
    
    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8")
    
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
        
        # Parse output
        output = result.get("output", {}).get("content", "")
        # Or if it returns messages list
        if "messages" in result.get("output", {}):
             messages = result["output"]["messages"]
             last_message = messages[-1] if messages else {}
             output = last_message.get("content", "")
        
        print(f"\nResponse:\n{output}")
        
        if "obsidian" in output.lower() or "search" in output.lower() or "found" in output.lower():
            print("\nSUCCESS: The agent likely used the tool.")
        else:
             print("\nWARNING: Response might not have used the tool. Check logs.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_search()
