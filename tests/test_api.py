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

def test_api_detect_stack(tmp_path):
    (tmp_path / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
    (tmp_path / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")

    client = TestClient(app)
    response = client.post("/api/detect", json={"local_path": str(tmp_path), "port": 8000})
    assert response.status_code == 200
    data = response.json()
    assert data["framework"] == "fastapi"
    assert data["is_standard"] is True
    assert "uvicorn" in data["run_command"]
    assert "requirements.txt" in data["detected_files"]
    assert "main.py" in data["detected_files"]


def test_api_ports_and_preflight_check():
    client = TestClient(app)
    res_list = client.get("/api/ports")
    assert res_list.status_code == 200
    data_list = res_list.json()
    assert "ports" in data_list
    assert "suggested_free_port" in data_list

    res_check = client.get("/api/ports/check/8999")
    assert res_check.status_code == 200
    data_check = res_check.json()
    assert data_check["port"] == 8999
    assert "in_use" in data_check
    assert "suggested_free_port" in data_check

    # Protected system ports (7000, 7001) cannot be freed
    res_protected = client.post("/api/ports/free/7000")
    assert res_protected.status_code == 400
