import importlib.util
import os
import sys
import inspect
from pathlib import Path
from typing import List, Optional, Any
from langchain_core.tools import BaseTool, StructuredTool, tool

class LocalToolManager:
    def __init__(self, tools_dir: str = "../../workspace/tools"):
        self.tools_dir = Path(tools_dir).resolve()
        self.tools: List[BaseTool] = []
        if not self.tools_dir.exists():
            self.tools_dir.mkdir(parents=True, exist_ok=True)
            
        # Add tools dir to sys.path so imports work easily
        if str(self.tools_dir) not in sys.path:
            sys.path.append(str(self.tools_dir))

    def load_tools(self) -> List[BaseTool]:
        """
        Scans the tools directory and loads all valid LangChain tools.
        """
        self.tools = []
        print(f"Scanning for tools in {self.tools_dir}...")
        
        # Ensure the directory exists
        if not self.tools_dir.exists():
            print(f"Tools directory {self.tools_dir} does not exist. Creating it.")
            self.tools_dir.mkdir(parents=True, exist_ok=True)
            
        for filename in os.listdir(self.tools_dir):
            if filename.endswith(".py") and not filename.startswith("__"):
                module_name = filename[:-3]
                file_path = self.tools_dir / filename
                
                try:
                    print(f"Loading tool module: {module_name} from {file_path}")
                    # Dynamic import
                    spec = importlib.util.spec_from_file_location(module_name, file_path)
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        sys.modules[module_name] = module
                        spec.loader.exec_module(module)
                        
                        # Inspect module for tools
                        found_tools_in_module = 0
                        for name, obj in inspect.getmembers(module):
                            if isinstance(obj, BaseTool):
                                self.tools.append(obj)
                                found_tools_in_module += 1
                                print(f"  Found tool: {obj.name}")
                            # Also check for functions decorated with @tool
                            # LangChain @tool decorator returns a BaseTool (StructuredTool)
                            # so the first check should cover it.
                            
                        if found_tools_in_module == 0:
                             print(f"  No tools found in {module_name}")
                                
                except Exception as e:
                    print(f"Error loading tool module {module_name}: {e}")
                    import traceback
                    traceback.print_exc()

        return self.tools

    def create_tool_file(self, filename: str, code: str) -> str:
        """
        Creates a new Python file in the tools directory.
        """
        if not filename.endswith(".py"):
            filename += ".py"
            
        file_path = self.tools_dir / filename
        
        # specific validation could go here
        
        with open(file_path, "w") as f:
            f.write(code)
            
        return f"Tool file created at {file_path}. You should refresh tools to load it."

    def get_management_tools(self) -> List[BaseTool]:
        """
        Returns tools that allow the agent to manage (create/refresh) tools.
        """
        
        @tool
        def create_python_tool(filename: str, code: str) -> str:
            """
            Creates a new LangChain tool in Python. 
            The code MUST import 'tool' from 'langchain_core.tools' or 'BaseTool'.
            The code MUST define a function decorated with @tool or a class inheriting from BaseTool.
            Example:
            ```python
            from langchain_core.tools import tool

            @tool
            def my_tool(arg1: str) -> str:
                \"\"\"Description of what the tool does.\"\"\"
                return "result"
            ```
            """
            return self.create_tool_file(filename, code)

        @tool
        def refresh_local_tools() -> str:
            """
            Reloads all local tools from the tools directory. Call this after creating a new tool.
            """
            loaded = self.load_tools()
            tool_names = [t.name for t in loaded]
            return f"Tools refreshed. Loaded {len(loaded)} tools: {', '.join(tool_names)}"

        return [create_python_tool, refresh_local_tools]
