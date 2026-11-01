import argparse
import json
import socket
from pathlib import Path
from urllib.parse import quote

from .discovery import Advertisement, addresses
from .engine import KokoroEngine, Worker
from .server import create_server
from .state import State


def main():
    parser = argparse.ArgumentParser(description='Chapter-wise Kokoro sync for Ultimate Android')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--device', choices=('auto', 'cuda', 'cpu'), default='auto')
    parser.add_argument('--state-dir', type=Path, default=Path(__file__).resolve().parents[1] / '.state')
    args = parser.parse_args()
    state = State(args.state_dir)
    engine = KokoroEngine(args.device)
    try:
        server, pin = create_server(args.host, args.port, state, engine)
    except Exception as error:
        state.events.exception('startup_failed', f'Unable to start sync service on port {args.port}: {error}', error)
        raise SystemExit(1) from None
    bundle = 'svc1.' + state.config['id'] + '.' + pin + '.' + state.config['pairSecret']
    (state.root / 'pairing-code.txt').write_text(bundle)
    import qrcode
    qrcode.make('my-ultimate-app://local-sync?pair=' + quote(bundle)).save(state.root / 'pairing.png')
    print(f'Ultimate local sync: {socket.gethostname()} port {server.server_port}', flush=True)
    print('Local addresses: ' + ', '.join(addresses()), flush=True)
    print('Pairing code (valid for 30 minutes): ' + bundle, flush=True)
    print('QR code: ' + str(state.root / 'pairing.png'), flush=True)
    print('Chapter-wise transfer; GPU model loads on the first job.', flush=True)
    state.events.emit('service_started', f'Sync service started | port {server.server_port} | device {args.device} | progress every 5s', port=server.server_port, device=args.device)
    print('Progress and error history: ' + str(state.events.directory), flush=True)
    advertisement = Advertisement(state.config['id'], server.server_port, pin)
    worker = Worker(state, engine)
    worker.thread.start()
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        worker.stop.set()
        state.events.emit('service_stopped', 'Sync service stopped; unfinished chapters will resume on restart.')
        advertisement.close()
        server.server_close()


if __name__ == '__main__':
    main()
