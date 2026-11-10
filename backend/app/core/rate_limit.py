"""Shared slowapi Limiter instance.

Centralizing here so every route decorator and `app.state.limiter` reference
the same in-memory storage backend. Importing slowapi.Limiter directly in
each router would create independent counters per module.
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request: Request) -> str:
    """The visitor's IP, for rate limiting, analytics and request logs.

    Behind Railway the socket peer is Railway's edge proxy, so keying on it
    would put every visitor in one shared bucket. The edge sets X-Real-IP to the
    connecting client and replaces any copy the client sent, which makes it the
    one forwarded header a visitor can't forge — the leftmost X-Forwarded-For
    entry (what uvicorn's --forwarded-allow-ips='*' trusts) can be. Off Railway
    (local dev) the header is absent and the socket address is used.
    """
    real_ip = request.headers.get("x-real-ip", "").strip()
    return real_ip or get_remote_address(request)


limiter = Limiter(key_func=client_ip)
