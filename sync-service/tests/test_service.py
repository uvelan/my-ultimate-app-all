import hashlib
import json
import ssl
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import wave
from pathlib import Path

from ultimate_sync.engine import Worker
from ultimate_sync.server import create_server
from ultimate_sync.state import State, validate_chapter


PAYLOAD = {'requestKey': 'a' * 16, 'bookId': 'book', 'chapterId': 'chapter', 'title': 'Chapter one',
           'voice': 'af_heart', 'paragraphs': ['The moon rose.'], 'chunks': ['Chapter one.', 'The moon rose.']}


class TestEngine:
    status = {'ready': True, 'device': 'test', 'gpu': None, 'error': None}

    def render(self, payload, output, progress):
        segments = []
        with wave.open(str(output), 'wb') as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(24000)
            for index, text in enumerate(payload['chunks']):
                stream.writeframes(b'\x00\x01' * 2400)
                segments.append({'text': text, 'start': index / 10, 'end': (index + 1) / 10})
                progress((index + 1) / len(payload['chunks']))
        return {'version': 1, 'title': payload['title'], 'paragraphs': payload['paragraphs'], 'segments': segments}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = State(self.root)
        self.engine = TestEngine()
        self.server, self.pin = create_server('127.0.0.1', 0, self.state, self.engine)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'https://127.0.0.1:{self.server.server_port}'
        self.ssl = ssl.create_default_context(cafile=str(self.root / 'certificate.pem'))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.state.db.close()
        self.temp.cleanup()

    def request(self, path, body=None, token=None, headers=None):
        request = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {}), **(headers or {})})
        with urllib.request.urlopen(request, context=self.ssl) as response:
            return response.status, response.read(), dict(response.headers)

    def pair(self):
        return json.loads(self.request('/v1/pair', {'secret': self.state.config['pairSecret'], 'name': 'Test Android'})[1])['token']

    def test_tls_and_pairing_are_required(self):
        self.assertEqual(json.loads(self.request('/v1/health')[1])['id'], self.state.config['id'])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/v1/chapters', PAYLOAD)
        self.assertEqual(error.exception.code, 401)
        with self.assertRaises(urllib.error.HTTPError):
            self.request('/v1/pair', {'secret': 'wrong'})
        self.assertEqual(len(self.pin), 64)

    def test_complete_chapter_atomic_publication_range_and_ack(self):
        token = self.pair()
        status, raw, _ = self.request('/v1/chapters', PAYLOAD, token)
        self.assertEqual(status, 202)
        job_id = json.loads(raw)['id']
        with self.assertRaises(urllib.error.HTTPError):
            self.request(f'/v1/jobs/{job_id}/audio', token=token)
        worker = Worker(self.state, self.engine)
        worker.thread.start()
        try:
            for _ in range(100):
                result = json.loads(self.request(f'/v1/jobs/{job_id}', token=token)[1])
                if result['status'] == 'ready':
                    break
                time.sleep(0.01)
            self.assertEqual(result['status'], 'ready')
            manifest = result['manifest']
            full = self.request(f'/v1/jobs/{job_id}/audio', token=token)[1]
            self.assertEqual(manifest['sha256'], hashlib.sha256(full).hexdigest())
            self.assertEqual(manifest['bytes'], len(full))
            self.assertEqual([segment['text'] for segment in manifest['sync']['segments']], PAYLOAD['chunks'])
            code, remainder, headers = self.request(f'/v1/jobs/{job_id}/audio', token=token, headers={'Range': 'bytes=123-'})
            self.assertEqual(code, 206)
            self.assertEqual(remainder, full[123:])
            self.assertTrue(headers['Content-Range'].startswith('bytes 123-'))
            self.assertEqual(self.request(f'/v1/jobs/{job_id}/ack', {'verified': True}, token)[0], 200)
            again = json.loads(self.request('/v1/chapters', PAYLOAD, token)[1])
            self.assertEqual(again['id'], job_id)
            self.assertEqual(again['status'], 'ready')
        finally:
            worker.stop.set()
            worker.thread.join(2)

    def test_batch_waits_for_all_chapters_then_downloads_one_verified_archive(self):
        import io
        import zipfile
        token, other = self.pair(), self.pair()
        ids = [json.loads(self.request('/v1/chapters', {**PAYLOAD, 'chapterId': str(index), 'requestKey': f'{index:016x}'}, token)[1])['id'] for index in range(3)]
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/v1/bundles', {'jobs': ids}, token)
        self.assertEqual(error.exception.code, 400)
        worker = Worker(self.state, self.engine)
        worker.thread.start()
        try:
            for _ in range(200):
                if all(self.state.job(self.state.owner('Bearer ' + token), value)['status'] == 'ready' for value in ids):
                    break
                time.sleep(0.01)
            summary = json.loads(self.request('/v1/batches/status', {'jobs': ids}, token)[1])
            self.assertEqual(len(summary['jobs']), 3)
            self.assertNotIn('manifest', summary['jobs'][0])
            manifest = json.loads(self.request('/v1/bundles', {'jobs': ids}, token)[1])
            raw = self.request('/v1/bundles/' + manifest['id'] + '/audio', token=token)[1]
            self.assertEqual(hashlib.sha256(raw).hexdigest(), manifest['sha256'])
            self.assertEqual(len(raw), manifest['bytes'])
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                self.assertEqual(set(archive.namelist()), {value + '.wav' for value in ids})
                for chapter in manifest['chapters']:
                    self.assertEqual(hashlib.sha256(archive.read(chapter['jobId'] + '.wav')).hexdigest(), chapter['sha256'])
            self.assertEqual(self.request('/v1/bundles/' + manifest['id'] + '/audio', token=token, headers={'Range': 'bytes=123-'})[1], raw[123:])
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/v1/bundles/' + manifest['id'] + '/audio', token=other)
            self.assertEqual(error.exception.code, 404)
            self.assertEqual(json.loads(self.request('/v1/bundles', {'jobs': ids}, token)[1])['id'], manifest['id'])
        finally:
            worker.stop.set()
            worker.thread.join(2)

    def test_other_paired_phone_cannot_read_jobs(self):
        owner, other = self.pair(), self.pair()
        job_id = json.loads(self.request('/v1/chapters', PAYLOAD, owner)[1])['id']
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request(f'/v1/jobs/{job_id}', token=other)
        self.assertEqual(error.exception.code, 404)

    def test_restart_retains_pc_identity_tokens_and_resumes_unfinished_chapter(self):
        token = self.pair()
        job = self.state.submit(self.state.owner('Bearer ' + token), PAYLOAD)
        self.state.next_job()
        restarted = State(self.root)
        try:
            self.assertEqual(restarted.config['id'], self.state.config['id'])
            self.assertEqual(restarted.job(restarted.owner('Bearer ' + token), job['id'])['status'], 'queued')
        finally:
            restarted.db.close()

    def test_invalid_and_oversized_text_is_rejected(self):
        for altered in ({'voice': 'unknown'}, {'chunks': ['x' * 4001]}, {'requestKey': '../escape'}, {'chunks': []}):
            with self.assertRaises(ValueError):
                validate_chapter({**PAYLOAD, **altered})


if __name__ == '__main__':
    unittest.main()
