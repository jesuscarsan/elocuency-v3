import os
from typing import List
import logging
import sys

# Suppress Chroma telemetry and other noise
os.environ["ANONYMIZED_TELEMETRY"] = "False"
logging.getLogger("chromadb").setLevel(logging.ERROR)

try:
    import posthog
    def noop_capture(*args, **kwargs):
        pass
    posthog.capture = noop_capture
except ImportError:
    pass

from langchain_community.document_loaders import ObsidianLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from chromadb.config import Settings
from src.domain.ports.obsidian_port import ObsidianPort

class LangChainObsidianAdapter(ObsidianPort):
    def __init__(self, vault_path: str, google_api_key: str, persist_directory: str = "../../workspace/chromadb"):
        self.vault_path = vault_path
        self.persist_directory = persist_directory
        
        # 1. Initialize Embeddings
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=google_api_key,
            task_type="retrieval_document"
        )
        
        # 2. Initialize LLM (optional for this adapter now, but keeping for compatibility)
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash", 
            google_api_key=google_api_key,
            temperature=0,
            convert_system_message_to_human=True
        )
        
        self.vector_store = self._initialize_vector_store()

    def _initialize_vector_store(self):
        # Check if DB already exists
        if os.path.exists(self.persist_directory) and os.listdir(self.persist_directory):
            try:
                return Chroma(
                    persist_directory=self.persist_directory,
                    embedding_function=self.embeddings,
                    client_settings=Settings(anonymized_telemetry=False)
                )
            except Exception:
                # Fallback if there's any issue with the persist directory
                pass
        
        # Otherwise, load and index the vault
        if not os.path.exists(self.vault_path):
            logging.error(f"Vault path does not exist: {self.vault_path}")
            # Return empty chroma if possible or raise
            return Chroma(
                embedding_function=self.embeddings,
                client_settings=Settings(anonymized_telemetry=False)
            )

        loader = ObsidianLoader(self.vault_path)
        documents = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = text_splitter.split_documents(documents)
        
        return Chroma.from_documents(
            documents=splits,
            embedding=self.embeddings,
            persist_directory=self.persist_directory,
            client_settings=Settings(anonymized_telemetry=False)
        )

    def query(self, question: str) -> str:
        """Fallback query method (not used by the main agent)."""
        return "Query method is deprecated. Use semantic search tool instead."

    def search(self, query: str, k: int = 5) -> List[dict]:
        """Performs a semantic similarity search and returns raw document snippets."""
        try:
            docs = self.vector_store.similarity_search(query, k=k)
            return [
                {
                    "content": d.page_content, 
                    "path": d.metadata.get("path", "unknown"),
                    "source": d.metadata.get("source", "unknown")
                } 
                for d in docs
            ]
        except Exception as e:
            logging.error(f"Error performing semantic search: {e}")
            return []
