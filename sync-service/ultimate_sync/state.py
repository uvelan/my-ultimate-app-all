from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from .progress import EventLog


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def validate_chapter(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError('Expected a chapter object')
    for key in ('requestKey', 'chapterId', 'bookId', 'title'):
        if not isinstance(payload.get(key), str) or len(payload[key]) > 500:
            raise ValueError(f'Invalid {key}')
    if len(payload['requestKey']) != 16 or any(c not in '0123456789abcdef' for c in payload['requestKey']):
        raise ValueError('Invalid audio identity')
    if payload.get('voice') not in ('af_heart', 'af_bella'):
        raise ValueError('Choose Heart or Bella')
    for key in ('chunks', 'paragraphs'):
        values = payload.get(key)
        if not isinstance(values, list) or not 0 < len(values) <= 10000:
            raise ValueError(f'Invalid {key}')
        if any(not isinstance(value, str) or not value.strip() or len(value) > (4000 if key == 'chunks' else 250000) for value in values):
            raise ValueError(f'Invalid {key} text')
    if sum(map(len, payload['chunks'])) > 250000:
        raise ValueError('Chapter is too long')
    return {key: payload[key] for key in ('requestKey', 'chapterId', 'bookId', 'title', 'voice', 'chunks', 'paragraphs')}


class State:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.events = EventLog(self.root)
        self.lock = threading.RLock()
        config = self.root / 'service.json'
        if config.exists():
            self.config = json.loads(config.read_text())
        else:
            self.config = {'id': secrets.token_hex(16), 'pairSecret': secrets.token_urlsafe(24)}
            config.write_text(json.dumps(self.config), encoding='utf-8')
        self.pair_until = time.time() + 1800
        self.db = sqlite3.connect(self.root / 'jobs.sqlite3', check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS clients (token_hash TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL,
                status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
                result TEXT, error TEXT, acknowledged INTEGER NOT NULL DEFAULT 0,
                created REAL NOT NULL
            );
            UPDATE jobs SET status='queued', progress=0 WHERE status='generating';
        ''')
        self.db.commit()

    def pair(self, secret: str, name: str) -> str:
        if time.time() > self.pair_until or not secrets.compare_digest(secret, self.config['pairSecret']):
            raise PermissionError('Pairing code is invalid or expired. Restart the PC service to reopen pairing.')
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.db.execute('INSERT INTO clients VALUES (?, ?)', (digest(token), name[:80]))
            self.db.commit()
        return token

    def owner(self, authorization: str) -> str:
        token = authorization.removeprefix('Bearer ')
        if not authorization.startswith('Bearer ') or not token:
            raise PermissionError('Pair this phone first')
        owner = digest(token)
        with self.lock:
            if not self.db.execute('SELECT 1 FROM clients WHERE token_hash=?', (owner,)).fetchone():
                raise PermissionError('Pair this phone first')
        return owner

    def submit(self, owner: str, payload: dict) -> dict:
        payload = validate_chapter(payload)
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        job_id = digest(owner + ':kokoro-v1.0:' + serialized)[:40]
        with self.lock:
            row = self.db.execute('SELECT status FROM jobs WHERE id=?', (job_id,)).fetchone()
            if row and (row['status'] in ('error', 'cancelled') or (row['status'] == 'ready' and not (self.root / (job_id + '.wav')).is_file())):
                self.db.execute("UPDATE jobs SET status='queued', progress=0, error=NULL, result=NULL, acknowledged=0 WHERE id=?", (job_id,))
            elif not row:
                count = self.db.execute("SELECT COUNT(*) FROM jobs WHERE owner=? AND status IN ('queued','generating')", (owner,)).fetchone()[0]
                if count >= 50:
                    raise ValueError('A maximum of 50 pending chapters is allowed')
                self.db.execute('INSERT INTO jobs(id,owner,payload,status,created) VALUES (?,?,?,?,?)',
                                (job_id, owner, serialized, 'queued', time.time()))
            self.db.commit()
        return self.job(owner, job_id)

    def job(self, owner: str, job_id: str) -> dict:
        with self.lock:
            row = self.db.execute('SELECT * FROM jobs WHERE id=? AND owner=?', (job_id, owner)).fetchone()
        if not row:
            raise FileNotFoundError('Chapter job not found')
        return {'id': row['id'], 'status': row['status'], 'progress': row['progress'],
                'manifest': json.loads(row['result']) if row['result'] else None, 'error': row['error']}

    def next_job(self):
        with self.lock:
            row = self.db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
            if row:
                self.db.execute("UPDATE jobs SET status='generating' WHERE id=?", (row['id'],))
                self.db.commit()
        return dict(row) if row else None

    def pending_jobs(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT id,owner,payload FROM jobs WHERE status IN ('queued','generating') ORDER BY created")]

    def update(self, job_id: str, status: str, progress=0, result=None, error=None):
        with self.lock:
            self.db.execute('UPDATE jobs SET status=?,progress=?,result=?,error=? WHERE id=?',
                            (status, progress, json.dumps(result) if result else None, error, job_id))
            self.db.commit()

    def acknowledge(self, owner: str, job_id: str):
        if self.job(owner, job_id)['status'] != 'ready':
            raise ValueError('Chapter is not ready')
        with self.lock:
            already = self.db.execute('SELECT acknowledged FROM jobs WHERE id=? AND owner=?', (job_id, owner)).fetchone()[0]
            self.db.execute('UPDATE jobs SET acknowledged=1 WHERE id=? AND owner=?', (job_id, owner))
            self.db.commit()
        if not already:
            self.events.emit('chapter_verified', f'Phone verified and saved chapter job {job_id[:8]}', job_id=job_id)

    def audio(self, owner: str, job_id: str) -> Path:
        if self.job(owner, job_id)['status'] != 'ready':
            raise ValueError('Chapter generation is not complete')
        path = self.root / (job_id + '.wav')
        if not path.is_file():
            raise FileNotFoundError('Generated audio is missing')
        return path
