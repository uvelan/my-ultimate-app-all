from __future__ import annotations

import datetime as dt
import hashlib
import ipaddress
import json
import re
import socket
import ssl
import threading
import time
import zipfile
import shutil
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .state import State


def certificate(root: Path, service_id: str):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    cert_path, key_path = root / 'certificate.pem', root / 'key.pem'
    if not cert_path.exists() or not key_path.exists():
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Ultimate Local Sync ' + service_id)])
        now = dt.datetime.now(dt.timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
                .not_valid_after(now + dt.timedelta(days=3650))
                .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'), x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), False)
                .sign(key, hashes.SHA256()))
        key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    return cert_path, key_path, cert.fingerprint(hashes.SHA256()).hex()


class SyncServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, state, engine):
        self.state, self.engine = state, engine
        self.pair_attempts = {}
        self.rate_lock = threading.Lock()
        self.bundle_lock = threading.Lock()
        super().__init__(address, Handler)


def chapter_bundle(server, owner, ids):
    if not isinstance(ids, list) or not 1 <= len(ids) <= 50 or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
        raise ValueError('Choose 1–50 unique chapter jobs')
    if any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{40}', value) for value in ids):
        raise ValueError('Invalid chapter job')
    jobs = [server.state.job(owner, job_id) for job_id in ids]
    if any(job['status'] != 'ready' for job in jobs):
        raise ValueError('The complete batch must finish generating first')
    bundle_id = hashlib.sha256((owner + ':' + ':'.join(ids)).encode()).hexdigest()[:40]
    path = server.state.root / ('bundle-' + bundle_id + '.zip')
    record = path.with_suffix('.json')
    with server.bundle_lock:
        if not path.exists() or not record.exists():
            size = sum(job['manifest']['bytes'] for job in jobs)
            if size > 2_000_000_000:
                raise ValueError('This batch exceeds 2 GB. Choose fewer chapters.')
            if shutil.disk_usage(server.state.root).free < size + 100_000_000:
                raise ValueError('PC storage is too low to package this batch')
            partial = path.with_suffix('.part')
            try:
                with zipfile.ZipFile(partial, 'w', compression=zipfile.ZIP_STORED) as archive:
                    for job in jobs:
                        archive.write(server.state.audio(owner, job['id']), job['id'] + '.wav')
                sha = hashlib.sha256()
                with partial.open('rb') as stream:
                    while data := stream.read(1_048_576):
                        sha.update(data)
                manifest = {'id': bundle_id, 'bytes': partial.stat().st_size, 'sha256': sha.hexdigest(),
                            'chapters': [{'jobId': job['id'], **job['manifest']} for job in jobs]}
                os.replace(partial, path)
                temp = record.with_suffix('.tmp')
                temp.write_text(json.dumps({'owner': owner, 'manifest': manifest}), encoding='utf-8')
                os.replace(temp, record)
            finally:
                partial.unlink(missing_ok=True)
        return json.loads(record.read_text(encoding='utf-8'))['manifest']


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, *args):
        # Chapter text, bearer tokens and pairing secrets never enter HTTP logs.
        pass

    def reply(self, status, value):
        encoded = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(encoded)

    def body(self):
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 1_500_000:
            raise ValueError('Invalid request size')
        return json.loads(self.rfile.read(size))

    def owner(self):
        return self.server.state.owner(self.headers.get('Authorization', ''))

    def do_GET(self):
        try:
            if self.path == '/v1/health':
                backend = {**self.server.engine.status, 'error': bool(self.server.engine.status.get('error'))}
                return self.reply(200, {'protocol': 1, 'id': self.server.state.config['id'], 'name': socket.gethostname(),
                                        'backend': backend, 'chapterWise': True})
            bundle = re.fullmatch(r'/v1/bundles/([a-f0-9]{40})/audio', self.path)
            if bundle:
                owner = self.owner()
                path = self.server.state.root / ('bundle-' + bundle[1] + '.zip')
                record = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
                if record['owner'] != owner:
                    raise FileNotFoundError('Batch not found')
                return self.stream_file(path, 'application/zip')
            match = re.fullmatch(r'/v1/jobs/([a-f0-9]{40})(/audio)?', self.path)
            if not match:
                raise FileNotFoundError('Endpoint not found')
            owner = self.owner()
            if not match[2]:
                return self.reply(200, self.server.state.job(owner, match[1]))
            path = self.server.state.audio(owner, match[1])
            return self.stream_file(path, 'audio/wav')
        except PermissionError as error:
            self.reply(401, {'error': str(error)})
        except FileNotFoundError as error:
            self.reply(404, {'error': str(error)})
        except (ValueError, json.JSONDecodeError) as error:
            self.reply(400, {'error': str(error)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def stream_file(self, path, content_type):
        size, start = path.stat().st_size, 0
        if self.headers.get('Range'):
            ranged = re.fullmatch(r'bytes=(\d+)-', self.headers['Range'])
            if not ranged or int(ranged[1]) >= size:
                return self.reply(416, {'error': 'Invalid byte range'})
            start = int(ranged[1])
        self.send_response(206 if start else 200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(size - start))
        self.send_header('Accept-Ranges', 'bytes')
        if start:
            self.send_header('Content-Range', f'bytes {start}-{size-1}/{size}')
        self.end_headers()
        with path.open('rb') as stream:
            stream.seek(start)
            while data := stream.read(65536):
                self.wfile.write(data)

    def do_POST(self):
        try:
            if self.headers.get('Origin'):
                raise PermissionError('Use the paired Android client')
            if self.path == '/v1/pair':
                with self.server.rate_lock:
                    attempts = [when for when in self.server.pair_attempts.get(self.client_address[0], []) if time.time() - when < 60]
                    if len(attempts) >= 5:
                        return self.reply(429, {'error': 'Wait a minute before trying to pair again'})
                    attempts.append(time.time())
                    self.server.pair_attempts[self.client_address[0]] = attempts
                body = self.body()
                token = self.server.state.pair(str(body.get('secret', '')), str(body.get('name', 'Android')))
                return self.reply(200, {'token': token, 'id': self.server.state.config['id']})
            owner = self.owner()
            if self.path == '/v1/batches/status':
                ids = self.body().get('jobs')
                if not isinstance(ids, list) or not 1 <= len(ids) <= 50 or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{40}', value) for value in ids):
                    raise ValueError('Invalid chapter jobs')
                jobs = [self.server.state.job(owner, value) for value in ids]
                return self.reply(200, {'jobs': [{key: job[key] for key in ('id', 'status', 'progress', 'error')} for job in jobs]})
            if self.path == '/v1/bundles':
                return self.reply(200, chapter_bundle(self.server, owner, self.body().get('jobs')))
            if self.path == '/v1/chapters':
                return self.reply(202, self.server.state.submit(owner, self.body()))
            match = re.fullmatch(r'/v1/jobs/([a-f0-9]{40})/ack', self.path)
            if match:
                self.body()
                self.server.state.acknowledge(owner, match[1])
                return self.reply(200, {'ok': True})
            raise FileNotFoundError('Endpoint not found')
        except PermissionError as error:
            self.reply(401, {'error': str(error)})
        except FileNotFoundError as error:
            self.reply(404, {'error': str(error)})
        except (ValueError, json.JSONDecodeError) as error:
            self.reply(400, {'error': str(error)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass


def create_server(host, port, state, engine):
    cert, key, pin = certificate(state.root, state.config['id'])
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)
    server = SyncServer((host, port), state, engine)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    return server, pin
