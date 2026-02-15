# Elo Server (Python AI Backend)

This is the Python-based backend for Elocuency, responsible for handling AI interactions via **LangChain** and **FastAPI**.

It follows **Hexagonal Architecture** and uses **snake_case** per PEP 8 standards.

## Prerequisites

- Python 3.10+
- `pip`

## Installation

1.  **Navigate to the server directory**:

    ```bash
    cd apps/elo-server
    ```

2.  **Create a virtual environment** (recommended):

    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## Configuration

1.  Copy the example environment file:

    ```bash
    cp .env.example .env
    ```

2.  Open `.env` and set your Google Gemini API Key:
    ```
    GOOGLE_API_KEY=your_api_key_here
    PORT=8000
    ```

## Running the Server

Start the server using `uvicorn`:

```bash
# Provide the module path to main:app
python src/main.py
```

Or run uvicorn directly:

```bash
uvicorn src.main:app --reload
```

## API Endpoints

- **Health Check**: `GET /health`
- **Ask AI**: `POST /ask`
  - Body: `{"prompt": "Your question here"}`
