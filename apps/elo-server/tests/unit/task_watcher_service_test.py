import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from src.application.services.task_watcher_service import TaskWatcherService

@pytest.fixture
def temp_workspace(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "tasks" / "todo").mkdir(parents=True)
    (workspace / "tasks" / "in-progress").mkdir(parents=True)
    (workspace / "tasks" / "done").mkdir(parents=True)
    (workspace / "tasks" / "error").mkdir(parents=True)
    (workspace / "tasks" / "human-required").mkdir(parents=True)
    return workspace

@pytest.mark.asyncio
async def test_process_tasks_success(temp_workspace):
    # Arrange
    mock_ask_ai = AsyncMock()
    mock_ask_ai.execute.return_value = "Paris"
    
    service = TaskWatcherService(mock_ask_ai, str(temp_workspace))
    
    task_file = temp_workspace / "task" / "todo" / "test.md"
    task_file.write_text("What is the capital of France?")
    
    # Act
    await service.process_tasks()
    
    # Assert
    assert not task_file.exists()
    done_file = temp_workspace / "task" / "done" / "test.md"
    assert done_file.exists()
    content = done_file.read_text()
    assert "Paris" in content
    assert "## AI Response" in content
    mock_ask_ai.execute.assert_called_once()

@pytest.mark.asyncio
async def test_process_tasks_error(temp_workspace):
    # Arrange
    mock_ask_ai = AsyncMock()
    mock_ask_ai.execute.side_effect = Exception("AI Error")
    
    service = TaskWatcherService(mock_ask_ai, str(temp_workspace))
    
    task_file = temp_workspace / "task" / "todo" / "error_test.md"
    task_file.write_text("Trigger error")
    
    # Act
    await service.process_tasks()
    
    # Assert
    assert not task_file.exists()
    error_file = temp_workspace / "task" / "error" / "error_test.md"
    assert error_file.exists()
    content = error_file.read_text()
    assert "## Error" in content
    assert "AI Error" in content
