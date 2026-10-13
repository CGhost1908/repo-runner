from fastapi.testclient import TestClient
from backend.main import app

def test_api_health_check():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_ui_static_served():
    client = TestClient(app)
    response = client.get("/ui/")
    assert response.status_code == 200
    assert "Repo Runner" in response.text
    assert "/ui/style.css" in response.text

    css_response = client.get("/ui/style.css")
    assert css_response.status_code == 200
    assert ".app-body" in css_response.text
