from abc import ABC, abstractmethod
from typing import List

class ObsidianPort(ABC):
    @abstractmethod
    def query(self, question: str) -> str:
        """
        Queries the Obsidian vault with a question and returns an answer.
        """
        pass

    @abstractmethod
    def search(self, query: str, k: int = 5) -> List[dict]:
        """
        Performs a semantic similarity search.
        """
        pass

    @abstractmethod
    def sync(self, force: bool = False) -> None:
        """
        Synchronizes the semantic search index with the Obsidian API.
        """
        pass
