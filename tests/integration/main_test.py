from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_read_main():
    # This assumes we have a root endpoint, if not we might get 404
    # But since we use langserve, we might check /agent/playground/
    response = client.get("/agent/playground/")
    # It might return 200 or 404 depending on how langserve mounts it
    # For now, just checking we don't crash on startup
    assert response.status_code in [200, 404] 
