from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from backend.api.routes import router, ws_connections

app = FastAPI(title="Repo Runner Engine")
app.include_router(router)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="static")

@app.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    await websocket.accept()
    if run_id not in ws_connections:
        ws_connections[run_id] = []
    ws_connections[run_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if run_id in ws_connections and websocket in ws_connections[run_id]:
            ws_connections[run_id].remove(websocket)
