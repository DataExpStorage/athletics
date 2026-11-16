"""Send a newsletter Markdown file to Telegram.

Usage: python scripts/send_telegram.py newsletters/2026-W47.md
Needs the environment variables TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

LIMIT = 3800  # Telegram allows 4096 characters per message


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(^|[\s(])\*([^*\s][^*]*)\*", r"\1<i>\2</i>", text)
    return text


def to_blocks(markdown):
    """Markdown -> list of Telegram-HTML blocks (one per heading, paragraph or bullet)."""
    blocks, para = [], []

    def flush():
        if para:
            blocks.append(inline(" ".join(para)))
            del para[:]

    for line in markdown.splitlines():
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        bullet = re.match(r"^\s*[-*]\s+(.*)$", line)
        if heading:
            flush()
            blocks.append("\n<b>%s</b>" % inline(heading.group(2)).upper() if len(heading.group(1)) > 1
                          else "<b>%s</b>" % inline(heading.group(2)))
        elif bullet:
            flush()
            blocks.append(u"• " + inline(bullet.group(1)))
        elif not line.strip():
            flush()
        else:
            para.append(line.strip())
    flush()
    return blocks


def to_messages(blocks):
    messages, current = [], ""
    for b in blocks:
        if current and len(current) + len(b) + 1 > LIMIT:
            messages.append(current)
            current = ""
        current = (current + "\n" + b) if current else b.lstrip("\n")
    if current:
        messages.append(current)
    return messages


def send(token, chat_id, text):
    data = urllib.parse.urlencode({
        "chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request("https://api.telegram.org/bot%s/sendMessage" % token, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            reply = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError("Telegram refused the message: %s" % e.read().decode()[:300])
    if not reply.get("ok"):
        raise RuntimeError("Telegram error: %s" % reply)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    token, chat_id = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        sys.exit("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first.")
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            messages = to_messages(to_blocks(f.read()))
        dashboard = os.environ.get("DASHBOARD_URL")
        if dashboard and messages:
            messages[-1] += '\n\n<a href="%s">Open the dashboard</a>' % html.escape(dashboard)
        for m in messages:
            send(token, chat_id, m)
        print("Sent %s in %d message(s)" % (path, len(messages)))


if __name__ == "__main__":
    main()
