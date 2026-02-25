import importlib.util
import os
import sys
import inspect
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Any
from langchain_core.tools import BaseTool, StructuredTool, tool
from src.infrastructure.logging.logger import get_logger

logger = get_logger(__name__)

class LocalToolManager:
    def __init__(self, tools_dirs: List[str], root_path: str, activated_tools: Optional[List[Any]] = None, vault_path: Optional[str] = None):
        """
        Initializes the LocalToolManager with a list of directories to scan for tools.
        
        Args:
            tools_dirs: List of absolute paths to directories containing tool modules.
            root_path: Absolute path to the project root (used for finding scripts).
            activated_tools: List of ToolConfig objects from the configuration.
            vault_path: Path to the Obsidian vault.
        """
        self.tools_dirs = [Path(d).resolve() for d in tools_dirs]
        self.root_path = Path(root_path).resolve()
        self.activated_tools = activated_tools or []
        self.vault_path = Path(vault_path).resolve() if vault_path else None

        # Ensure directories exist (at least the workspace one)
        for d in self.tools_dirs:
            if d and not d.exists():
                logger.info(f"Creating tools directory: {d}")
                d.mkdir(parents=True, exist_ok=True)
            
            # Add tools dir to sys.path so imports work easily
            if str(d) not in sys.path:
                sys.path.append(str(d))
            
        # The primary directory for creating new tools is the last one (assumed to be workspace/user tools)
        self.primary_tools_dir = self.tools_dirs[-1] if self.tools_dirs else None

    def load_tools(self) -> List[BaseTool]:
        """
        Scans all tools directories and loads all valid LangChain tools.
        """
        self.tools = []
        for d in self.tools_dirs:
            logger.info(f"Scanning for tools in {d}...")
            if not d.exists():
                continue
                
            for filename in os.listdir(d):
                if filename.endswith(".py") and not filename.startswith("__"):
                    module_name = filename[:-3]
                    
                    # Check if this tool is activated in config
                    tool_config = next((t for t in self.activated_tools if t.name == module_name), None)
                    if not tool_config or not tool_config.active:
                        logger.info(f"Skipping deactivated local tool module: {module_name}")
                        continue

                    file_path = d / filename
                    
                    try:
                        logger.info(f"Loading tool module: {module_name} from {file_path}")
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
                                    logger.info(f"  Found tool: {obj.name}")
                                
                            if found_tools_in_module == 0:
                                 logger.info(f"  No tools found in {module_name}")
                                    
                    except Exception as e:
                        logger.error(f"Error loading tool module {module_name}: {e}")
                        import traceback
                        traceback.print_exc()

        return self.tools

    def create_tool_file(self, filename: str, code: str) -> str:
        """
        Creates a new Python file in the tools directory.
        """
        if not filename.endswith(".py"):
            filename += ".py"
            
        file_path = self.primary_tools_dir / filename
        
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

        @tool
        def sync_workspace() -> str:
            """
            Synchronizes the workspace by cloning and installing MCPs and LangChain tools 
            defined in the configuration (elo.config.json).
            This tool will:
            1. Clone any new repositories for MCPs or Tools.
            2. Install dependencies (npm/pip).
            3. Automatically refresh the agent's tools.
            """
            import subprocess
            try:
                # The script is in core/scripts/sync-workspace.js
                # Assuming node is available in the environment
                # We target the root script via package.json if possible, or direct node call
                logger.info("Starting workspace synchronization...")
                
                # Find root accurately
                script_path = self.root_path / "core" / "scripts" / "sync-workspace.js"
                
                if not script_path.exists():
                     # Fallback for Docker if root is /app but script is in /app/core ...
                     # Actually self.root_path should be correct based on config.
                     pass

                if not os.path.exists(script_path):
                    return f"Error: Synchronization script not found at {script_path}"

                result = subprocess.run(
                    ["node", str(script_path)], 
                    capture_output=True, 
                    text=True,
                    cwd=str(script_path.parents[2]) # cwd to monorepo root
                )
                
                if result.returncode != 0:
                    logger.error(f"Sync failed: {result.stderr}")
                    return f"Synchronization failed:\n{result.stderr}"
                
                logger.info("Sync complete. Refreshing tools...")
                refresh_msg = refresh_local_tools()
                
                return f"Workspace synchronized successfully!\n\nOutput:\n{result.stdout}\n\n{refresh_msg}"
            except Exception as e:
                logger.error(f"Unexpected error during sync: {e}")
                return f"Unexpected error during workspace synchronization: {str(e)}"

        @tool
        def delegate_to_human(reason: str = "", note_content: str = "") -> str:
            """
            Use this tool ONLY when you encounter a task that is physically impossible 
            for an AI (like bringing coffee) or that you cannot solve with ANY of your tools 
            (MCPs, local tools, n8n workflows). 
            
            Args:
                reason: The reason why you are delegating (e.g. 'This requires physical action').
                note_content: Alternative parameter for the reasoning.
            """
            actual_reason = reason or note_content or "No reason provided"
            logger.info(f"Delegating task to human: {actual_reason}")
            return f"DELEGATED_TO_HUMAN: {actual_reason}"

        return [create_python_tool, refresh_local_tools, sync_workspace, delegate_to_human]
