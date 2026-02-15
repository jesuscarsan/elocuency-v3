from abc import ABC, abstractmethod

class ObsidianPort(ABC):
    @abstractmethod
    def query(self, question: str) -> str:
        """
        Queries the Obsidian vault with a question and returns an answer.
        """
        pass
