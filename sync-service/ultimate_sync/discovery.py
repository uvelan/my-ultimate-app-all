import socket
import threading

SERVICE_TYPE = '_ultimate-tts._tcp.local.'


def addresses():
    values = sorted({entry[4][0] for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
                     if not entry[4][0].startswith('127.')})
    return values or ['127.0.0.1']


class Advertisement:
    def __init__(self, service_id, port, pin):
        from zeroconf import Zeroconf, ServiceInfo, IPVersion
        self.zeroconf = Zeroconf(ip_version=IPVersion.V4Only)
        self.stop = threading.Event()
        self.info = ServiceInfo(SERVICE_TYPE, f'{socket.gethostname()}-{service_id[:8]}.{SERVICE_TYPE}',
                                addresses=[socket.inet_aton(ip) for ip in addresses()], port=port,
                                properties={'id': service_id, 'protocol': '1', 'pin': pin},
                                server=f'ultimate-{service_id}.local.')
        self.zeroconf.register_service(self.info)
        self.thread = threading.Thread(target=self.watch, daemon=True)
        self.thread.start()

    def watch(self):
        while not self.stop.wait(20):
            current = [socket.inet_aton(ip) for ip in addresses()]
            if current != self.info.addresses:
                self.info.addresses = current
                self.zeroconf.update_service(self.info)

    def close(self):
        self.stop.set()
        self.zeroconf.unregister_service(self.info)
        self.zeroconf.close()
