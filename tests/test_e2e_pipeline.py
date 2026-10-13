import pytest
from pathlib import Path
from backend.models import RunRequest, StatusEnum
from backend.api.routes import _execute_pipeline, active_runs

@pytest.mark.asyncio
async def test_e2e_pipeline_on_local_sample(tmp_path):
    # Setup dummy project
    sample_repo = tmp_path / "sample_app"
    sample_repo.mkdir()
    (sample_repo / "main.py").write_text("print('Mock server ready')\n", encoding="utf-8")
    (sample_repo / "requirements.txt").write_text("", encoding="utf-8")

    run_id = "test-e2e-1"
    active_runs[run_id] = {
        "status": StatusEnum.CLONING,
        "logs": [],
        "port": 8999,
        "framework": None,
        "is_healthy": False
    }

    req = RunRequest(local_path=str(sample_repo), port=8999)
    await _execute_pipeline(run_id, req)

    run_data = active_runs[run_id]
    assert run_data["framework"] in ["generic_python", "fastapi"]
    assert any("Repo hazırlandı" in log for log in run_data["logs"])
