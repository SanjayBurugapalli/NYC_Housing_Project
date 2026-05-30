"""Shared slowapi Limiter instance.

Centralizing here so every route decorator and `app.state.limiter` reference
the same in-memory storage backend. Importing slowapi.Limiter directly in
each router would create independent counters per module.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
