"""Bounded command mutation admission and browser response headers."""

import time
import threading
from collections import deque
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class CommandSecurity(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests = {}
        self.lock = threading.Lock()

    async def dispatch(self, request, call_next):
        if request.method in {
            "POST",
            "PATCH",
            "DELETE",
        } and request.url.path.startswith(("/api/command/", "/api/demo/", "/api/hospital-command/")):
            key = request.client.host if request.client else "local"
            stamp = time.monotonic()
            with self.lock:
                queue = self.requests.setdefault(key, deque())
                while queue and queue[0] < stamp - 60:
                    queue.popleft()
                if len(queue) >= 180:
                    return JSONResponse(
                        {"detail": "Command rate limit reached; retry shortly"},
                        status_code=429,
                        headers={"Retry-After": "60"},
                    )
                queue.append(stamp)
                if len(self.requests) > 1000:
                    self.requests = {
                        k: v
                        for k, v in self.requests.items()
                        if v and v[-1] > stamp - 60
                    }
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        return response
