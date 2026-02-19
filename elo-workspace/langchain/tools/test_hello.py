
from langchain_core.tools import tool

@tool
def test_say_hello(name: str) -> str:
    "Says hello."
    return f"Hello {name}!"
