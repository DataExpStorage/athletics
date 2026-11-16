"""View the dashboard locally: python scripts/serve.py  ->  http://localhost:8765"""
import http.server
import os
import socketserver
import webbrowser

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE, **kwargs)

    def end_headers(self):
        # always serve the current files, so a rebuilt site shows up on refresh
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("Dashboard at http://localhost:%d  (Ctrl+C to stop)" % PORT)
        if not os.environ.get("NO_BROWSER"):
            webbrowser.open("http://localhost:%d" % PORT)
        httpd.serve_forever()
