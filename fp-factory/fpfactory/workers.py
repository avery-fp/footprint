"""
WORKERS — multiprocessing pool with chunking and resource-safe execution.

Handles parallelization of:
  - Video slicing (I/O bound, moderate parallelism)
  - Variant generation (CPU/GPU bound, controlled concurrency)
  - Packaging (I/O bound, high parallelism)

Uses multiprocessing.Pool with configurable worker count and chunk size.
Includes progress tracking, error collection, and graceful shutdown.
"""

import multiprocessing as mp
import os
import signal
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

T = TypeVar("T")
R = TypeVar("R")


@dataclass
class WorkerStats:
    """Statistics from a worker pool run."""
    total_items: int
    completed: int
    failed: int
    elapsed_seconds: float
    items_per_second: float
    errors: list[str]


# ─── Progress tracker ───────────────────────────────────

class ProgressTracker:
    """Thread-safe progress tracking for worker pools."""

    def __init__(self, total: int, label: str = ""):
        self.total = total
        self.label = label
        self._completed = mp.Value("i", 0)
        self._failed = mp.Value("i", 0)
        self._start = time.time()

    def tick(self, success: bool = True):
        if success:
            with self._completed.get_lock():
                self._completed.value += 1
        else:
            with self._failed.get_lock():
                self._failed.value += 1

    @property
    def completed(self) -> int:
        return self._completed.value

    @property
    def failed(self) -> int:
        return self._failed.value

    def summary(self) -> str:
        elapsed = time.time() - self._start
        rate = self.completed / elapsed if elapsed > 0 else 0
        return (
            f"  [{self.label}] {self.completed}/{self.total} done "
            f"({self.failed} failed) "
            f"[{elapsed:.1f}s, {rate:.1f}/s]"
        )


# ─── Chunker ────────────────────────────────────────────

def chunk_items(items: list, chunk_size: int) -> list[list]:
    """Split a list into chunks of specified size."""
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


# ─── Worker wrapper (handles errors gracefully) ─────────

def _safe_worker(args: tuple) -> tuple[bool, Any, str]:
    """
    Wrapper that catches exceptions and returns (success, result, error).
    Prevents one bad item from killing the pool.
    """
    fn, item = args
    try:
        result = fn(item)
        return (True, result, "")
    except Exception as e:
        return (False, None, f"{type(e).__name__}: {str(e)[:200]}")


# ─── Main pool runner ───────────────────────────────────

def run_pool(
    fn: Callable,
    items: list,
    workers: int = 4,
    chunk_size: int = 10,
    label: str = "pool",
    show_progress: bool = True,
) -> WorkerStats:
    """
    Run a function across items using a multiprocessing pool.

    Args:
        fn: function to call on each item (must be picklable)
        items: list of items to process
        workers: number of worker processes
        chunk_size: items per chunk for imap
        label: label for progress output
        show_progress: print progress updates

    Returns:
        WorkerStats with completion info
    """
    total = len(items)
    if total == 0:
        return WorkerStats(0, 0, 0, 0.0, 0.0, [])

    # Cap workers at item count and CPU count
    max_workers = min(workers, total, os.cpu_count() or 4)
    start_time = time.time()
    errors: list[str] = []
    completed = 0
    failed = 0

    if show_progress:
        print(f"  [{label}] starting: {total} items, {max_workers} workers, chunk={chunk_size}")

    # Wrap items with function reference for _safe_worker
    work_items = [(fn, item) for item in items]

    with mp.Pool(processes=max_workers) as pool:
        try:
            for i, (success, result, error) in enumerate(
                pool.imap_unordered(_safe_worker, work_items, chunksize=chunk_size)
            ):
                if success:
                    completed += 1
                else:
                    failed += 1
                    errors.append(error)

                # Progress output every 10% or every 50 items
                if show_progress and ((i + 1) % max(1, total // 10) == 0 or (i + 1) == total):
                    elapsed = time.time() - start_time
                    rate = (i + 1) / elapsed if elapsed > 0 else 0
                    print(f"  [{label}] {i+1}/{total} ({rate:.1f}/s) — {failed} failed")

        except KeyboardInterrupt:
            print(f"\n  [{label}] interrupted — terminating workers...")
            pool.terminate()
            pool.join()

    elapsed = time.time() - start_time
    rate = completed / elapsed if elapsed > 0 else 0

    stats = WorkerStats(
        total_items=total,
        completed=completed,
        failed=failed,
        elapsed_seconds=elapsed,
        items_per_second=rate,
        errors=errors,
    )

    if show_progress:
        print(f"  [{label}] complete: {completed}/{total} in {elapsed:.1f}s ({rate:.1f}/s)")
        if errors:
            print(f"  [{label}] {len(errors)} errors:")
            for e in errors[:5]:
                print(f"    - {e}")
            if len(errors) > 5:
                print(f"    ... and {len(errors)-5} more")

    return stats


# ─── Sequential runner (fallback / debugging) ───────────

def run_sequential(
    fn: Callable,
    items: list,
    label: str = "seq",
    show_progress: bool = True,
) -> WorkerStats:
    """
    Run items sequentially (single process).
    Useful for debugging or when multiprocessing isn't available.
    """
    total = len(items)
    start_time = time.time()
    completed = 0
    failed = 0
    errors: list[str] = []

    for i, item in enumerate(items):
        try:
            fn(item)
            completed += 1
        except Exception as e:
            failed += 1
            errors.append(f"{type(e).__name__}: {str(e)[:200]}")

        if show_progress and ((i + 1) % max(1, total // 10) == 0 or (i + 1) == total):
            print(f"  [{label}] {i+1}/{total}")

    elapsed = time.time() - start_time
    return WorkerStats(total, completed, failed, elapsed, completed / elapsed if elapsed > 0 else 0, errors)
