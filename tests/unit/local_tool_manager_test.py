import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from src.infrastructure.tools.local_tool_manager import LocalToolManager

def test_local_tool_manager_initialization(tmp_path):
    # Arrange
    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    root_dir = tmp_path / "root"
    root_dir.mkdir()
    
    # Act
    manager = LocalToolManager(tools_dirs=[str(tools_dir)], root_path=str(root_dir))
    
    # Assert
    assert manager.root_path == root_dir.resolve()
    assert manager.primary_tools_dir == tools_dir.resolve()
    assert str(tools_dir.resolve()) in sys.path

def test_create_tool_file(tmp_path):
    # Arrange
    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    root_dir = tmp_path / "root"
    root_dir.mkdir()
    manager = LocalToolManager(tools_dirs=[str(tools_dir)], root_path=str(root_dir))
    
    tool_code = "def my_tool(): pass"
    filename = "my_tool.py"
    
    # Act
    result = manager.create_tool_file(filename, tool_code)
    
    # Assert
    assert "Tool file created at" in result
    created_file = tools_dir / filename
    assert created_file.exists()
    assert created_file.read_text() == tool_code

def test_load_tools_empty(tmp_path):
    # Arrange
    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    root_dir = tmp_path / "root"
    root_dir.mkdir()
    manager = LocalToolManager(tools_dirs=[str(tools_dir)], root_path=str(root_dir))
    
    # Act
    tools = manager.load_tools()
    
    # Assert
    assert isinstance(tools, list)
    assert len(tools) == 0
