import sys
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from backend.api.routes import router, ws_connections

# ---------------------------------------------------------
# 1. WINDOWS KONSOL AYARI (Karakter & Emoji Desteği)
# ---------------------------------------------------------
# Windows komut satırında Türkçe karakterler veya emojiler (🚀, ❌ vb.)
# yazdırılırken hata (UnicodeEncodeError) vermemesi için konsol çıktısını UTF-8 yapıyoruz.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---------------------------------------------------------
# 2. FASTAPI UYGULAMASI VE API ROTALARI
# ---------------------------------------------------------
# FastAPI ana sunucu nesnemizi oluşturuyoruz.
app = FastAPI(title="Repo Runner Engine")

# routes.py dosyasında yazdığımız tüm /api/... rotalarını (run, stop, status vb.) sisteme dahil ediyoruz.
app.include_router(router)

# ---------------------------------------------------------
# 3. ÖN YÜZ (STATIC & REACT) DOSYALARININ SUNULMASI
# ---------------------------------------------------------
# /ui adresine girildiğinde klasik HTML/CSS arayüzünü sunar.
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="static")

# Eğer React frontend'i derlenmişse (frontend/dist varsa), /app adresinden modern React SPA'yı sunar.
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/app", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

# ---------------------------------------------------------
# 4. CANLI LOG AKIŞI (WEBSOCKET BAĞLANTISI)
# ---------------------------------------------------------
# Arayüz (React veya Web), terminaldeki logları anlık görebilmek için
# bu WebSocket kanalına bağlanır: ws://localhost:8000/ws/logs/{run_id}
@app.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    # İstemcinin (tarayıcının) bağlantısını kabul ediyoruz
    await websocket.accept()
    
    # Bu çalıştırma (run_id) için dinleyici listesi oluşturup yeni bağlantıyı ekliyoruz
    if run_id not in ws_connections:
        ws_connections[run_id] = []
    ws_connections[run_id].append(websocket)

    # GEÇMİŞ LOGLARI TEKRAR OYNATMA (REPLAY):
    # Kullanıcı sayfayı yenilerse veya WebSocket biraz geç bağlanırsa
    # önceki logları kaçırmasın diye hafızadaki eski logları hemen yolluyoruz.
    from backend.api.routes import active_runs
    if run_id in active_runs:
        for past_log in active_runs[run_id].get("logs", []):
            try:
                await websocket.send_json({"run_id": run_id, "message": past_log})
            except Exception:
                pass

    # BAĞLANTIYI CANLI TUTMA VE KOPMA YÖNETİMİ:
    # Kullanıcı sayfayı kapatana kadar bu döngü çalışır. Sayfa kapanınca istemciyi listeden sileriz.
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if run_id in ws_connections and websocket in ws_connections[run_id]:
            ws_connections[run_id].remove(websocket)
