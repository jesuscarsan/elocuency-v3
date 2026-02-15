from src.domain.ports.ai_port import AIPort

from typing import Any

class AskAIUseCase:
    def __init__(self, ai_port: AIPort):
        self.ai_port = ai_port

    async def execute(self, prompt: str, user_id: str | None = None) -> str:
        """
        Executes the AI query logic. This is the entry point for the business logic.
        """
        if not prompt:
            raise ValueError("Prompt cannot be empty")

        response = await self.ai_port.ask(prompt, user_id=user_id)

        return response
