import json
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

from ultimate_sync.engine import Worker, model_warnings
from ultimate_sync.progress import EventLog, ProgressReporter, duration
from ultimate_sync.state import State
from test_service import PAYLOAD, TestEngine


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = State(self.root)
        self.lines = []
        self.state.events.console = lambda line, **kwargs: self.lines.append(line)

    def tearDown(self):
        self.state.db.close()
        self.temp.cleanup()

    def history(self):
        return [json.loads(line) for path in sorted((self.root / 'logs').glob('history-*.jsonl')) for line in path.read_text(encoding='utf-8').splitlines()]

    def submit(self, index):
        return self.state.submit('local-owner', {**PAYLOAD, 'chapterId': str(index), 'requestKey': f'{index:016x}'})

    def test_elapsed_heartbeat_batch_totals_and_append_only_history(self):
        first, second = self.submit(1), self.submit(2)
        engine = TestEngine()
        engine.status = {**TestEngine.status, 'phase': 'loading model'}
        clock = [100.0]
        reporter = ProgressReporter(self.state, engine, clock=lambda: clock[0])
        job = self.state.next_job()
        reporter.start(job, json.loads(job['payload']))
        initial = len(self.history())
        clock[0] = 102
        reporter.progress(0.5)
        self.assertEqual(len(self.history()), initial, 'frequent passage updates must not flood the terminal')
        clock[0] = 165
        reporter.heartbeat()
        progress = self.history()[-1]
        self.assertEqual(progress['progress'], 0.5)
        self.assertEqual(progress['total'], 2)
        self.assertEqual(progress['batch_progress'], 0.25)
        self.assertEqual(progress['chapter_elapsed_seconds'], 65)
        self.assertIn('01:05', self.lines[-1])
        self.assertIn('loading model', self.lines[-1])
        manifest = {'sync': {'segments': [{'end': 180}]}, 'bytes': 1000, 'device': 'test'}
        self.state.update(first['id'], 'ready', 1, result=manifest)
        reporter.finish(manifest=manifest)
        job = self.state.next_job()
        reporter.start(job, json.loads(job['payload']))
        clock[0] = 170
        self.state.update(second['id'], 'ready', 1, result=manifest)
        reporter.finish(manifest=manifest)
        batch = self.history()[-1]
        self.assertEqual(batch['event'], 'batch_finished')
        self.assertEqual(batch['total'], 2)
        self.assertEqual(batch['completed'], 2)
        self.assertEqual(batch['elapsed_seconds'], 70)
        before = len(self.history())
        EventLog(self.root, console=None).emit('restart_test', 'Another service run appends history')
        self.assertEqual(len(self.history()), before + 1)
        serialized = json.dumps(self.history())
        self.assertNotIn('The moon rose.', serialized)
        self.assertNotIn(self.state.config['pairSecret'], serialized)
        self.assertEqual(duration(3661), '1:01:01')

    def test_late_submissions_join_the_active_generation_batch(self):
        self.submit(1)
        clock = [10]
        reporter = ProgressReporter(self.state, TestEngine(), clock=lambda: clock[0])
        job = self.state.next_job()
        reporter.start(job, json.loads(job['payload']))
        self.submit(2)
        clock[0] = 15
        reporter.progress(0.5)
        self.assertEqual(len(reporter.batch['ids']), 2)

    def test_retry_clears_stale_manifest_and_phone_acknowledgement(self):
        job = self.submit(1)
        self.state.update(job['id'], 'ready', 1, result={'previous': True})
        self.state.acknowledge('local-owner', job['id'])
        retried = self.submit(1)  # Missing audio file is regenerated.
        self.assertEqual(retried['status'], 'queued')
        self.assertIsNone(retried['manifest'])
        self.assertEqual(self.state.db.execute('SELECT acknowledged FROM jobs WHERE id=?', (job['id'],)).fetchone()[0], 0)

    def test_worker_error_is_recorded_and_next_chapter_recovers_health(self):
        class FailingOnce(TestEngine):
            def __init__(self):
                self.status = {'ready': True, 'device': 'test', 'error': None}
                self.calls = 0
            def render(self, payload, output, progress):
                self.calls += 1
                if self.calls == 1:
                    output.write_bytes(b'partial')
                    raise RuntimeError('Synthetic GPU failure')
                return super().render(payload, output, progress)
        first, second = self.submit(1), self.submit(2)
        engine = FailingOnce()
        worker = Worker(self.state, engine)
        worker._process(self.state.next_job())
        self.assertEqual(self.state.job('local-owner', first['id'])['status'], 'error')
        self.assertFalse((self.root / (first['id'] + '.part')).exists())
        failure = next(record for record in self.history() if record['event'] == 'chapter_failed')
        self.assertIn('Synthetic GPU failure', failure['traceback'])
        worker._process(self.state.next_job())
        self.assertEqual(self.state.job('local-owner', second['id'])['status'], 'ready')
        self.assertIsNone(engine.status['error'])
        self.assertEqual(self.history()[-1]['failed'], 1)
        self.assertEqual(self.history()[-1]['completed'], 1)

    def test_known_model_warnings_are_brief_but_unknown_warnings_remain_visible(self):
        with warnings.catch_warnings(record=True) as visible:
            warnings.simplefilter('always')
            with model_warnings(self.state.events):
                warnings.warn('dropout option adds dropout after all but last recurrent layer, num_layers=1')
                warnings.warn('`torch.nn.utils.weight_norm` is deprecated in favor of parametrizations', FutureWarning)
                warnings.warn('Unexpected numerical problem', RuntimeWarning)
        self.assertEqual(len(visible), 1)
        self.assertIn('Unexpected numerical problem', str(visible[0].message))
        self.assertEqual(sum(record['event'] == 'model_notice' for record in self.history()), 2)
        self.assertEqual(sum(record['event'] == 'model_warning' for record in self.history()), 1)

    def test_history_storage_failure_does_not_turn_good_audio_into_a_failed_job(self):
        self.submit(1)
        worker = Worker(self.state, TestEngine())
        with patch.object(Path, 'open', side_effect=PermissionError('History storage denied')):
            self.state.events.emit('example', 'Still visible in terminal')
        self.assertIn('Cannot save sync history', '\n'.join(self.lines))
        self.assertIn('Still visible in terminal', self.lines[-1])
        worker._process(self.state.next_job())
        self.assertEqual(self.history()[-1]['event'], 'batch_finished')


if __name__ == '__main__':
    unittest.main()
