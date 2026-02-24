from src.domain.ports.obsidian_port import ObsidianPort

class QueryVaultUseCase:
    def __init__(self, obsidian_port: ObsidianPort):
        self.obsidian_port = obsidian_port

    def execute(self, question: str) -> str:
        return self.obsidian_port.query(question)
