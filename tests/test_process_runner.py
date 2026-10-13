import pytest
from backend.services.process_runner import ProcessRunner

@pytest.mark.asyncio
async def test_healthcheck_unreachable_port():
    runner = ProcessRunner()
    healthy = await runner.check_health(port=59999, timeout_seconds=0.5)
    assert healthy is False
