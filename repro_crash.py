import asyncio
import os
from src.infrastructure.config import load_config
from src.infrastructure.adapters.ai.langgraph_agent_adapter import LangGraphAgentAdapter
from langchain_core.messages import HumanMessage

async def main():
    print("Loading config...")
    config = load_config()
    
    print(f"Initializing adapter with model {config.ai.model}...")
    adapter = LangGraphAgentAdapter(
        api_key=config.ai.api_key, 
        model_name=config.ai.model
    )
    
    inputs = {"messages": [HumanMessage(content="Hello")]}
    # MemorySaver needs thread_id
    run_config = {"configurable": {"thread_id": "repro_test_thread"}}
    
    print("Starting astream_log...")
    try:
        import json
        from langchain_core.messages import BaseMessage
        
        async for chunk in adapter.graph.astream_log(inputs, run_config):
            # Check serialization
            try:
                # Naive json dump to check for obvious non-serializable types
                # LangServe uses a smarter encoder but basic types should pass json.dumps
                # We simply try to dump the 'value' of ops if possible
                for op in chunk.ops:
                    val = op.get('value')
                    if val:
                        # If it's a message or list of messages, convert to dict first
                        if hasattr(val, 'dict'):
                            json.dumps(val.dict(), default=str)
                        else:
                            json.dumps(val, default=str)
            except TypeError as te:
                print(f"Serialization ERROR in chunk: {te}")
                # Print the problematic value
                print(f"Bad Value: {op.get('value')}")
                raise te
            
            print(chunk)
    except Exception as e:
        print(f"\nCRASHED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
