from __future__ import annotations

import datetime as dt
import json
import secrets
import threading
import time
import traceback
from pathlib import Path
from .terminal import TerminalProgress


INDIA = dt.timezone(dt.timedelta(hours=5, minutes=30))


def duration(seconds):
    seconds = max(0, int(seconds))
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    return f'{hours:d}:{minutes:02d}:{seconds:02d}' if hours else f'{minutes:02d}:{seconds:02d}'


class EventLog:
    """Daily append-only history. No open file handles or chapter body/token logging."""
    def __init__(self, root: Path, console=print):
        self.directory = root / 'logs'
        self.directory.mkdir(parents=True, exist_ok=True)
        self.console = console
        self.terminal = TerminalProgress() if console is print else None
        self.lock = threading.RLock()
        self.last_error = None

    def emit(self, event, message, **fields):
        now = dt.datetime.now(INDIA)
        message = ' '.join(str(message).splitlines())
        record = {'timestamp': now.isoformat(timespec='seconds'), 'event': event, 'message': message, **fields}
        line = f'[{now:%H:%M:%S}] {message}'
        with self.lock:
            try:
                with (self.directory / f'history-{now:%Y-%m-%d}.jsonl').open('a', encoding='utf-8') as stream:
                    stream.write(json.dumps(record, ensure_ascii=False) + '\n')
                with (self.directory / f'sync-{now:%Y-%m-%d}.log').open('a', encoding='utf-8') as stream:
                    stream.write(line + '\n')
                    if fields.get('traceback'):
                        stream.write(fields['traceback'] + '\n')
                self.last_error = None
            except OSError as error:
                if self.console and self.last_error != str(error):
                    self._print(f'WARNING: Cannot save sync history: {error}')
                self.last_error = str(error)
            if self.console is print and self.terminal:
                try:
                    self.terminal.emit(event, line, fields)
                except (OSError, UnicodeError):
                    pass
            else:
                self._print(line)

    def _print(self, line):
        if self.console:
            try:
                if self.console is print and self.terminal:
                    self.terminal.emit('notice', line, {})
                else:
                    self.console(line, flush=True)
            except OSError:
                pass  # A closed console must not stop a generation job.

    def exception(self, event, message, error, **fields):
        self.emit(event, message, error_type=type(error).__name__, error=str(error)[:500],
                  traceback=''.join(traceback.format_exception(type(error), error, error.__traceback__)), **fields)


class ProgressReporter:
    """A generation batch is the queued chapters for one phone/book/voice.

    Later submissions join while that batch is running; downloads are logged separately.
    """
    def __init__(self, state, engine, clock=time.monotonic, interval=5):
        self.state, self.engine, self.clock, self.interval = state, engine, clock, interval
        self.events = state.events
        self.lock = threading.RLock()
        self.batch = None
        self.current = None
        self.last_print = float('-inf')

    def _refresh(self):
        for job in self.state.pending_jobs():
            payload = json.loads(job['payload'])
            if (job['owner'], payload['bookId'], payload['voice']) == self.batch['key']:
                self.batch['ids'].add(job['id'])

    def start(self, job, payload):
        with self.lock:
            key = (job['owner'], payload['bookId'], payload['voice'])
            if self.batch and self.batch['key'] != key:
                self._finish('batch_paused')
            if not self.batch:
                self.batch = {'id': secrets.token_hex(4), 'key': key, 'ids': set(), 'done': set(),
                              'failed': set(), 'started': self.clock()}
                self._refresh()
                self.events.emit('batch_started', f"Batch {self.batch['id']} started | {len(self.batch['ids'])} chapter(s) queued",
                                 batch_id=self.batch['id'], book_id=payload['bookId'], voice=payload['voice'])
            self.batch['ids'].add(job['id'])
            self.batch['done'].discard(job['id'])
            self.batch['failed'].discard(job['id'])
            self._refresh()
            self.current = {'id': job['id'], 'title': payload['title'][:120], 'started': self.clock(), 'progress': 0,
                            'passages': len(payload['chunks'])}
            self.last_print = float('-inf')
            self._print('chapter_started')

    def _print(self, event):
        now = self.clock()
        current, batch = self.current, self.batch
        completed, failed, total = len(batch['done']), len(batch['failed']), len(batch['ids'])
        percent = round(current['progress'] * 100)
        passage = round(current['progress'] * current['passages'])
        batch_progress = (completed + failed + current['progress']) / total if total else 0
        phase = self.engine.status.get('phase') or ('generating' if self.engine.status.get('ready') else 'loading model')
        self.events.emit(event,
            f"Batch {batch['id']} | chapter {completed + failed + 1}/{total} {current['title']} | "
            f"{phase} {percent}% ({passage}/{current['passages']} passages) | "
            f"chapter {duration(now - current['started'])} | batch {batch_progress * 100:.0f}% in {duration(now - batch['started'])} | "
            f"{completed} ready, {failed} failed, {max(0, total - completed - failed - 1)} waiting",
            batch_id=batch['id'], job_id=current['id'], progress=current['progress'],
            title=current['title'], phase=phase,
            passage=passage, passages=current['passages'], completed=completed, failed=failed, total=total, batch_progress=batch_progress,
            chapter_elapsed_seconds=round(now - current['started'], 2), batch_elapsed_seconds=round(now - batch['started'], 2))
        self.last_print = now

    def progress(self, value):
        with self.lock:
            if not self.current:
                return
            self.current['progress'] = max(0, min(1, value))
            if self.clock() - self.last_print >= self.interval:
                self._refresh()
                self._print('chapter_progress')

    def heartbeat(self):
        with self.lock:
            if self.current and self.clock() - self.last_print >= self.interval:
                self._refresh()
                self._print('chapter_progress')

    def finish(self, manifest=None, error=None, memory=None):
        with self.lock:
            if not self.current:
                return
            current, batch = self.current, self.batch
            elapsed = self.clock() - current['started']
            fields = {'batch_id': batch['id'], 'job_id': current['id'], 'elapsed_seconds': round(elapsed, 2)}
            if memory:
                fields['gpu_memory'] = memory
            if error:
                batch['failed'].add(current['id'])
                self.events.exception('chapter_failed', f"FAILED {current['title']} after {duration(elapsed)}: {error}", error, **fields)
            else:
                batch['done'].add(current['id'])
                audio = manifest['sync']['segments'][-1]['end'] if manifest['sync']['segments'] else 0
                self.events.emit('chapter_ready', f"READY {current['title']} in {duration(elapsed)} | audio {duration(audio)} | {manifest['bytes'] / 1_000_000:.1f} MB",
                                 audio_seconds=audio, bytes=manifest['bytes'], device=manifest['device'], **fields)
            self._refresh()
            self.current = None
            if batch['ids'] <= batch['done'] | batch['failed']:
                self._finish('batch_finished')

    def _finish(self, event):
        batch = self.batch
        elapsed = self.clock() - batch['started']
        self.events.emit(event, f"Batch {batch['id']} {'finished' if event == 'batch_finished' else 'paused'} in {duration(elapsed)} | "
                         f"{len(batch['done'])}/{len(batch['ids'])} ready, {len(batch['failed'])} failed",
                         batch_id=batch['id'], total=len(batch['ids']), completed=len(batch['done']), failed=len(batch['failed']), elapsed_seconds=round(elapsed, 2))
        self.batch = None
