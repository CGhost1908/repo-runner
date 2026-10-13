import sys
import argparse
import uvicorn

def main():
    parser = argparse.ArgumentParser(description="Repo Runner Platform Başlatıcı")
    parser.add_argument("--port", type=int, default=8000, help="Sunucu portu (varsayılan: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Dinlenecek IP (varsayılan: 0.0.0.0)")
    parser.add_argument("--tunnel", action="store_true", help="Ngrok tünelini otomatik başlat")
    args = parser.parse_args()

    if args.tunnel:
        try:
            from pyngrok import ngrok
            tunnel = ngrok.connect(args.port)
            print("=" * 60)
            print(f"🚀 CANLI NGROK TÜNELİ AKTİF:")
            print(f"👉 {tunnel.public_url}/ui/")
            print("=" * 60)
        except Exception as e:
            print(f"⚠️ Ngrok tüneli başlatılamadı: {e}")

    print(f"🌐 Yerel Sunucu: http://localhost:{args.port}/ui/")
    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=True)

if __name__ == "__main__":
    main()
