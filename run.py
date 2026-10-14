import sys
import argparse
import uvicorn

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def main():
    parser = argparse.ArgumentParser(description="Repo Runner Platform Launcher")
    parser.add_argument("--port", type=int, default=8000, help="Server port (default: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host IP to listen on (default: 0.0.0.0)")
    parser.add_argument("--tunnel", action="store_true", help="Automatically start Ngrok tunnel")
    args = parser.parse_args()

    if args.tunnel:
        try:
            from pyngrok import ngrok
            tunnel = ngrok.connect(args.port)
            print("=" * 60)
            print("LIVE NGROK TUNNEL ACTIVE:")
            print(f"👉 {tunnel.public_url}/ui/")
            print("=" * 60)
        except Exception as e:
            print(f"Could not start Ngrok: {e}")

    print(f"Local Server: http://localhost:{args.port}/ui/")
    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=True)

if __name__ == "__main__":
    main()
