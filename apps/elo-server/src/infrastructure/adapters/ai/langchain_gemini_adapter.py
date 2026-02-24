import os
from langchain_google_genai import ChatGoogleGenerativeAI
from src.domain.ports.ai_port import AIPort

class LangChainGeminiAdapter(AIPort):
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash"):
        if not api_key:
            raise ValueError("API key must be provided")
            
        self.model = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=0.7
        )

    def bind_tools(self, tools: list):
        """
        Binds tools to the underlying model.
        """
        if tools:
            self.model = self.model.bind_tools(tools)

    async def ask(self, prompt: str) -> str:
        """
        Sends a prompt to Gemini via LangChain and returns the text response.
        """
        response = await self.model.ainvoke(prompt)
        return response.content
