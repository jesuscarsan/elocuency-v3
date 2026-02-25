from abc import ABC, abstractmethod
from typing import List

class N8nPort(ABC):
    @abstractmethod
    def trigger_workflow(self, workflow_name: str, data: dict) -> str:
        """
        Triggers an n8n workflow by name.
        """
        pass

    @abstractmethod
    def list_workflows(self) -> List[str]:
        """
        Lists all available n8n workflows.
        """
        pass

    @abstractmethod
    def create_workflow(self, workflow_name: str, workflow_json: str) -> str:
        """
        Creates a new n8n workflow file.
        """
        pass
