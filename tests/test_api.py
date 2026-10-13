from fastapi.testclient import TestClient
from backend.main import app

def test_api_health_check():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
