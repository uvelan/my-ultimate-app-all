import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ultimate_sync.progress import EventLog
from ultimate_sync.terminal import TerminalProgress, generation_line


class Terminal(io.StringIO):
    def isatty(self):
        return True


FIELDS = {'title': 'Chapter 351 - Origin', 'completed': 1, 'failed': 0, 'total': 15,
          'progress': 0.81, 'batch_progress': 0.12,
          'chapter_elapsed_seconds': 60, 'batch_elapsed_seconds': 177, 'phase': 'generating'}


class TerminalTests(unittest.TestCase):
    def test_progress_rewrites_one_line_and_completion_finishes_it(self):
        stream = Terminal()
        terminal = TerminalProgress(stream, columns=lambda: 120)
        terminal.emit('chapter_started', 'full history message', {**FIELDS, 'progress': 0})
        for value in (0.1, 0.5, 0.81, 0.94):
            terminal.emit('chapter_progress', 'full history message', {**FIELDS, 'progress': value})
        output = stream.getvalue()
        self.assertEqual(output.count('\n'), 1)
        self.assertIn('Chapter 2/15: Chapter 351 - Origin', output)
        self.assertIn('94%', output)
        self.assertIn('[#', output)
        terminal.emit('chapter_ready', 'READY in 01:10', {})
        self.assertEqual(stream.getvalue().count('\n'), 2)
        self.assertTrue(stream.getvalue().endswith('READY in 01:10\n'))
        self.assertIsNone(terminal.active)

    def test_model_warnings_and_transfer_messages_preserve_the_generation_bar(self):
        stream = Terminal()
        terminal = TerminalProgress(stream, columns=lambda: 100)
        terminal.emit('chapter_started', '', FIELDS)
        terminal.emit('model_notice', 'Non-fatal model notice', {})
        terminal.emit('transfer_started', 'Sending previous chapter', {})
        terminal.emit('transfer_progress', '', {'progress': 0.5})
        terminal.emit('transfer_sent', 'Sent previous chapter', {})
        self.assertEqual(terminal.active[0], 'generation')
        self.assertIn('81%', stream.getvalue().split('\r')[-1])
        self.assertIn('Non-fatal model notice\n', stream.getvalue())

    def test_bar_fits_narrow_terminals_and_resize_does_not_wrap(self):
        for width in (20, 40, 60, 80, 100, 160):
            with self.subTest(width=width):
                self.assertLessEqual(len(generation_line(FIELDS, width - 1)), width - 1)
        stream = Terminal()
        width = [120]
        terminal = TerminalProgress(stream, columns=lambda: width[0])
        terminal.emit('chapter_progress', '', FIELDS)
        start = len(stream.getvalue())
        width[0] = 50
        terminal.emit('chapter_progress', '', FIELDS)
        self.assertLessEqual(len(stream.getvalue()[start:].split('\r')[-1]), 49)

    def test_redirected_output_contains_milestones_without_progress_spam(self):
        stream = io.StringIO()
        terminal = TerminalProgress(stream)
        terminal.emit('chapter_started', '', FIELDS)
        for _ in range(10):
            terminal.emit('chapter_progress', 'long progress text', FIELDS)
        terminal.emit('chapter_ready', 'READY chapter', {})
        self.assertEqual(stream.getvalue().count('\n'), 2)
        self.assertNotIn('\r', stream.getvalue())
        self.assertNotIn('long progress text', stream.getvalue())

    def test_full_progress_history_is_saved_while_terminal_uses_a_single_bar(self):
        stream = Terminal()
        with tempfile.TemporaryDirectory() as directory:
            with patch('sys.stdout', stream):
                events = EventLog(Path(directory))
                events.emit('chapter_started', 'Full initial history details', **FIELDS)
                for percent in (0.1, 0.5, 0.81):
                    events.emit('chapter_progress', 'Full passage and batch details', **{**FIELDS, 'progress': percent})
            records = [json.loads(line) for path in events.directory.glob('history-*.jsonl') for line in path.read_text(encoding='utf-8').splitlines()]
            self.assertEqual(len(records), 4)
            self.assertEqual(records[-1]['progress'], 0.81)
            self.assertEqual(stream.getvalue().count('\n'), 1)


if __name__ == '__main__':
    unittest.main()
