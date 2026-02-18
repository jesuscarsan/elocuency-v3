import pytest
from src.application.use_cases.ask_ai_use_case import AskAIUseCase

@pytest.mark.asyncio
async def test_ask_ai_execute_success(mock_ai_port):
    # Arrange
    use_case = AskAIUseCase(mock_ai_port)
    mock_ai_port.ask.return_value = "Hello, World!"
    prompt = "Hi"

    # Act
    result = await use_case.execute(prompt)

    # Assert
    assert result == "Hello, World!"
    mock_ai_port.ask.assert_called_once_with(prompt, user_id=None)

@pytest.mark.asyncio
async def test_ask_ai_execute_empty_prompt(mock_ai_port):
    # Arrange
    use_case = AskAIUseCase(mock_ai_port)
    
    # Act & Assert
    with pytest.raises(ValueError, match="Prompt cannot be empty"):
        await use_case.execute("")
