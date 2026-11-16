"""View the dashboard locally: python scripts/serve.py  ->  http://localhost:8765"""
import functools
import http.server
import os
import socketserver
import webbrowser

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = 8765

if __name__ == "__main__":
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        print("Dashboard at http://localhost:%d  (Ctrl+C to stop)" % PORT)
        if not os.environ.get("NO_BROWSER"):
            webbrowser.open("http://localhost:%d" % PORT)
        httpd.serve_forever()
