import sys
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from backend.api.routes import router, ws_connections

# UTF-8
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


app = FastAPI(title="Repo Runner Engine")
app.include_router(router)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="static")

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/app", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


# WebSocket ws://localhost:8000
@app.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    await websocket.accept()

    if run_id not in ws_connections:
        ws_connections[run_id] = []
    ws_connections[run_id].append(websocket)

    from backend.api.routes import active_runs
    if run_id in active_runs:
        for past_log in active_runs[run_id].get("logs", []):
            try:
                await websocket.send_json({"run_id": run_id, "message": past_log})
            except Exception:
                pass

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if run_id in ws_connections and websocket in ws_connections[run_id]:
            ws_connections[run_id].remove(websocket)
