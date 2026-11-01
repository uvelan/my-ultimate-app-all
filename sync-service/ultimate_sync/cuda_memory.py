"""Bound unused allocator cache on small/display GPUs without unloading weights."""
from __future__ import annotations

import time

MIB = 1024 ** 2


class CudaMemoryBudget:
    def __init__(self, cuda, clock=time.perf_counter):
        self.cuda, self.clock = cuda, clock
        self.trims = 0
        self.trim_seconds = 0.0
        self.error = None

    def begin(self):
        self.trims, self.trim_seconds, self.error = 0, 0.0, None
        self.release(force=True)
        try:
            self.cuda.reset_peak_memory_stats()
        except Exception as error:
            self.error = str(error)

    def release(self, force=False):
        try:
            allocated = self.cuda.memory_allocated()
            reserved = self.cuda.memory_reserved()
            total = self.cuda.get_device_properties(0).total_memory
            # CUDA on Windows can reserve beyond dedicated VRAM and spill to RAM.
            # Small display GPUs need cache returned at each passage boundary.
            pressure = total <= 6 * 1024 ** 3 or reserved >= total * 0.75
            if reserved - allocated < 256 * MIB or not (force or pressure):
                return False
            started = self.clock()
            self.cuda.empty_cache()
            self.trim_seconds += self.clock() - started
            self.trims += 1
            return True
        except Exception as error:
            # Optional cache management must not invalidate completed audio.
            self.error = str(error)
            return False

    def summary(self):
        result = {'cache_trims': self.trims, 'cache_trim_seconds': round(self.trim_seconds, 4)}
        try:
            result.update(allocated_mib=round(self.cuda.memory_allocated() / MIB, 2),
                          reserved_mib=round(self.cuda.memory_reserved() / MIB, 2),
                          peak_allocated_mib=round(self.cuda.max_memory_allocated() / MIB, 2),
                          peak_reserved_mib=round(self.cuda.max_memory_reserved() / MIB, 2))
        except Exception as error:
            self.error = str(error)
        if self.error:
            result['cache_cleanup_error'] = self.error[:300]
        return result
