"""Bounded async-safe TTL cache built exclusively on Python stdlib."""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

T = TypeVar("T")


class TTLCache:
    """In-memory bounded LRU+TTL cache using `OrderedDict` and `time.monotonic()`."""

    def __init__(self, max_entries: int = 512, default_ttl: int = 3600) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be >= 1")
        if default_ttl < 1:
            raise ValueError("default_ttl must be >= 1")
        self._max_entries = max_entries
        self._default_ttl = default_ttl
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> tuple[bool, Any]:
        """Return `(found, value)`, evicting expired entries lazily."""
        now = time.monotonic()
        async with self._lock:
            item = self._store.get(key)
            if item is None:
                return False, None
            expires_at, value = item
            if now >= expires_at:
                del self._store[key]
                return False, None
            self._store.move_to_end(key)
            return True, value

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Insert or update a cached entry, evicting LRU if over capacity."""
        ttl_seconds = self._default_ttl if ttl is None else max(1, ttl)
        expires_at = time.monotonic() + ttl_seconds
        async with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = (expires_at, value)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)

    async def get_or_set(
        self,
        key: str,
        loader: Callable[[], Awaitable[T]],
        ttl: int | None = None,
    ) -> T:
        """Return cached value or compute via `loader()` and cache the result."""
        found, cached = await self.get(key)
        if found:
            return cached
        value = await loader()
        await self.set(key, value, ttl=ttl)
        return value

    async def clear(self) -> None:
        """Remove all entries from the cache."""
        async with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
