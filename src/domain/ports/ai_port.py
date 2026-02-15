from abc import ABC, abstractmethod

class AIPort(ABC):
    @abstractmethod
    async def ask(self, prompt: str, user_id: str | None = None) -> str:
        """
        Sends a prompt to the AI and returns the response.
        """
        pass
