from langchain_core.tools import tool

@tool
def echo_tool(input_str: str) -> str:
    """Returns the input string."""
    return f"Echo: {input_str}"
