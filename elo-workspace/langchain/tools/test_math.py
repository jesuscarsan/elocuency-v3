
from langchain_core.tools import tool

@tool
def test_calc_add(a: int, b: int) -> int:
    "Adds two numbers."
    return a + b
