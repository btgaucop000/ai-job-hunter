// Offline CLI tripwire, not a general-purpose security sandbox. Loaded before
// the runner; denies Node network entry points and HTTP listener creation.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => {
  throw new Error('OFFLINE_NETWORK_FORBIDDEN');
};
for (const [object, keys] of [
  [globalThis, ['fetch', 'WebSocket']],
  [net, ['connect', 'createConnection']],
  [net.Socket.prototype, ['connect']],
  [net.Server.prototype, ['listen']],
  [http, ['request', 'get']],
  [https, ['request', 'get']],
  [http2, ['connect']],
  [tls, ['connect']],
  [dgram, ['createSocket']],
  [dns, ['lookup', 'resolve']],
  [dns.promises, ['lookup', 'resolve']],
] as const)
  for (const key of keys)
    Object.defineProperty(object, key, {
      value: deny,
      configurable: true,
      writable: true,
    });
syncBuiltinESMExports();
