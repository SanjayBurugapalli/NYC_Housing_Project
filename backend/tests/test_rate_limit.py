from starlette.requests import Request

from app.core.rate_limit import client_ip


def _request(headers: dict[str, str], peer: str = "100.64.0.7") -> Request:
    return Request({
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 443),
    })


def test_client_ip_uses_railway_real_ip_header():
    assert client_ip(_request({"X-Real-IP": "203.0.113.9"})) == "203.0.113.9"


def test_client_ip_ignores_forgeable_forwarded_for():
    # A client-supplied X-Forwarded-For must not pick the rate-limit bucket.
    req = _request({"X-Forwarded-For": "1.2.3.4, 203.0.113.9", "X-Real-IP": "203.0.113.9"})
    assert client_ip(req) == "203.0.113.9"


def test_client_ip_falls_back_to_socket_peer_without_header():
    assert client_ip(_request({})) == "100.64.0.7"
    assert client_ip(_request({"X-Real-IP": "  "})) == "100.64.0.7"
