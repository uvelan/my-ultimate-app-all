import unittest
from types import SimpleNamespace

from ultimate_sync.cuda_memory import CudaMemoryBudget, MIB


class FakeCuda:
    def __init__(self, total=4096, reserved=3000, allocated=550):
        self.total, self.reserved, self.allocated = total * MIB, reserved * MIB, allocated * MIB
        self.empties = 0
    def memory_allocated(self): return self.allocated
    def memory_reserved(self): return self.reserved
    def max_memory_allocated(self): return self.allocated
    def max_memory_reserved(self): return self.reserved
    def get_device_properties(self, index): return SimpleNamespace(total_memory=self.total)
    def reset_peak_memory_stats(self): pass
    def empty_cache(self):
        self.empties += 1
        self.reserved = self.allocated + 64 * MIB


class CudaMemoryTests(unittest.TestCase):
    def test_small_gpu_returns_unused_cache_without_touching_live_allocations(self):
        cuda = FakeCuda()
        budget = CudaMemoryBudget(cuda)
        self.assertTrue(budget.release())
        self.assertEqual(cuda.allocated, 550 * MIB)
        self.assertEqual(cuda.reserved, 614 * MIB)
        self.assertFalse(budget.release(), 'do not repeatedly trim tiny remaining cache')
        self.assertEqual(budget.summary()['cache_trims'], 1)

    def test_large_gpu_keeps_useful_cache_until_pressure_or_chapter_boundary(self):
        cuda = FakeCuda(total=24000)
        budget = CudaMemoryBudget(cuda)
        self.assertFalse(budget.release())
        cuda.reserved = 19000 * MIB
        self.assertTrue(budget.release())
        cuda.reserved = 3000 * MIB
        self.assertTrue(budget.release(force=True))

    def test_live_tensors_near_the_limit_are_never_treated_as_unused_cache(self):
        cuda = FakeCuda(reserved=3000, allocated=2900)
        self.assertFalse(CudaMemoryBudget(cuda).release(force=True))
        self.assertEqual(cuda.empties, 0)

    def test_cleanup_failure_is_reported_without_failing_completed_audio(self):
        cuda = FakeCuda()
        def fail(): raise RuntimeError('cleanup unavailable')
        cuda.empty_cache = fail
        budget = CudaMemoryBudget(cuda)
        self.assertFalse(budget.release())
        self.assertEqual(budget.summary()['cache_cleanup_error'], 'cleanup unavailable')

    def test_chapter_begin_resets_previous_metrics_and_releases_stale_cache(self):
        cuda = FakeCuda()
        budget = CudaMemoryBudget(cuda)
        budget.begin()
        self.assertEqual(budget.trims, 1)
        budget.begin()
        self.assertEqual(budget.trims, 0)


if __name__ == '__main__':
    unittest.main()
