import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { removeTemporaryDirectories, temporaryDirectory } from '../../conformance/http/fixture';
import {
  freePort,
  readJsonAnnouncement,
  sendOnWire,
  startHost,
} from '../../conformance/http/host-process';
import { hostCommandFromEnvironment } from '../../conformance/http/node-host';
import { sidecarAnnouncementSchema } from '../../src/desktop/announcement';

/**
 * The conformance suite's own driver (`conformance/http/host-process.ts`),
 * against hosts that break the contract: it must fail them promptly and leave
 * no process behind.
 */

afterAll(removeTemporaryDirectories);

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A host command running `script` under Node, which writes its pid to `{directory}/pid`. */
const nodeHost = (script: string) => ({
  name: 'stand-in host',
  argv: [
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(require('node:path').join(process.argv[1], 'pid'), String(process.pid));${script}`,
    '{directory}',
  ],
  stopsOnStdinClose: false,
  keepsLock: false,
});

const pidIn = async (directory: string): Promise<number> =>
  Number(await readFile(join(directory, 'pid'), 'utf8'));

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('starting a host', () => {
  it('fails a host that never announces once the deadline passes, and kills it', async () => {
    const directory = await temporaryDirectory();
    await expect(
      startHost(
        nodeHost('setInterval(() => undefined, 1000);'),
        { directory, built: '' },
        { announceDeadlineMs: 1_000 },
      ),
    ).rejects.toThrow(/did not announce/);
    const pid = await pidIn(directory);
    await expect.poll(() => isAlive(pid)).toBe(false);
  });

  it('fails a host whose program cannot be started, promptly', async () => {
    const started = Date.now();
    await expect(
      startHost(
        {
          name: 'missing',
          argv: ['/nonexistent/host-binary'],
          stopsOnStdinClose: false,
          keepsLock: false,
        },
        { directory: await temporaryDirectory(), built: '' },
        { announceDeadlineMs: 20_000 },
      ),
    ).rejects.toThrow(/ENOENT/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('kills a host whose launch secret cannot be presented', async () => {
    const directory = await temporaryDirectory();
    const closed = await freePort();
    await expect(
      startHost(
        nodeHost(
          `console.log(JSON.stringify({ kind: 'listening', port: ${String(closed)}, secret: 's' })); setInterval(() => undefined, 1000);`,
        ),
        { directory, built: '' },
      ),
    ).rejects.toThrow();
    const pid = await pidIn(directory);
    await expect.poll(() => isAlive(pid)).toBe(false);
  });

  it('fails a host that never answers its own launch secret once the deadline passes, and kills it', async () => {
    const directory = await temporaryDirectory();
    await expect(
      startHost(
        nodeHost(
          `const server = require('node:net').createServer(() => undefined).listen(0, '127.0.0.1', () => console.log(JSON.stringify({ kind: 'listening', port: server.address().port, secret: 's' })));`,
        ),
        { directory, built: '' },
        { announceDeadlineMs: 1_000 },
      ),
    ).rejects.toThrow(/stand-in host did not answer its launch secret within 1000ms/);
    const pid = await pidIn(directory);
    await expect.poll(() => isAlive(pid)).toBe(false);
  }, 10_000);

  it('reads the whole of a refusal larger than a pipe holds, written just before the host exits', async () => {
    // Node may report the exit before standard output has been read to its end
    // (the 'exit' event's documentation), so the line is larger than a pipe holds.
    const directory = await temporaryDirectory();
    const lost: number[] = [];
    for (let size = 150_000; size < 250_000; size += 4_999) {
      const started = await startHost(
        nodeHost(
          `process.stdout.write(JSON.stringify({ kind: 'refused', message: 'm'.repeat(${String(size)}) }) + '\\n'); process.exitCode = 3;`,
        ),
        { directory, built: '' },
      );
      if (
        started.kind !== 'refused' ||
        started.message?.length !== size ||
        started.exitCode !== 3
      ) {
        lost.push(size);
      }
    }
    expect(lost).toEqual([]);
  }, 60_000);
});

const listening = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address instanceof Object ? address.port : 0);
    });
  });

describe('sending on the wire', () => {
  it('sends a body chunked, declaring no length, when the request names a Transfer-Encoding', async () => {
    const heads: string[] = [];
    const server = createServer((socket) => {
      let received = '';
      socket.setEncoding('latin1').on('data', (chunk: string) => {
        received += chunk;
        if (!received.endsWith('0\r\n\r\n')) return;
        heads.push(received.slice(0, received.indexOf('\r\n\r\n')).toLowerCase());
        socket.end('HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n');
      });
    });
    servers.push(server);
    const port = await listening(server);
    const response = await sendOnWire(port, {
      method: 'POST',
      target: '/api/spaces',
      headers: { host: `127.0.0.1:${String(port)}`, 'transfer-encoding': 'chunked' },
      body: new TextEncoder().encode('{}'),
    });
    expect(response.status).toBe(204);
    expect(heads).toHaveLength(1);
    expect(heads[0]).toContain('transfer-encoding: chunked');
    expect(heads[0]).not.toContain('content-length');
  });

  it('answers the response a host sent before closing without reading the body', async () => {
    const server = createServer((socket) => {
      socket.once('data', () => {
        socket.pause();
        socket.write(
          'HTTP/1.1 413 Payload Too Large\r\ncontent-type: text/plain\r\ncontent-length: 9\r\nconnection: close\r\n\r\ntoo large',
          () => socket.destroy(),
        );
      });
    });
    servers.push(server);
    const port = await listening(server);
    const response = await sendOnWire(port, {
      method: 'POST',
      target: '/api/spaces',
      headers: { host: `127.0.0.1:${String(port)}`, 'content-type': 'application/json' },
      body: new Uint8Array(8 << 20),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toBe('too large');
  });
});

describe('naming the host command', () => {
  it('reads a command that does not say whether it keeps the launch lock as one that does not', () => {
    const command = hostCommandFromEnvironment(
      JSON.stringify({ name: 'Rust CLI', argv: ['infinity-cube'], stopsOnStdinClose: false }),
    );
    expect(command.keepsLock).toBe(false);
  });

  it('holds the production Node host to the launch lock', () => {
    expect(hostCommandFromEnvironment(undefined).keepsLock).toBe(true);
  });

  it('refuses a command naming a key it does not read', () => {
    expect(() =>
      hostCommandFromEnvironment(
        JSON.stringify({
          name: 'Rust CLI',
          argv: ['infinity-cube'],
          stopsOnStdinClose: false,
          keepLock: true,
        }),
      ),
    ).toThrow(/keepLock/);
  });

  it('names the variable when its value is not JSON', () => {
    expect(() => hostCommandFromEnvironment('{ name: ')).toThrow(
      /INFINITY_CUBE_HTTP_CONFORMANCE_HOST is not valid JSON/,
    );
  });
});

describe('reading the announcement', () => {
  it('reads every line the desktop sidecar announces as the sidecar wrote it', () => {
    const announcement = fc.oneof(
      fc.record({
        kind: fc.constant('listening'),
        port: fc.integer({ min: 1, max: 65_535 }),
        secret: fc.string({ minLength: 1 }),
      }),
      fc.record({ kind: fc.constant('refused'), message: fc.string() }),
    );
    fc.assert(
      fc.property(announcement, (written) => {
        const sidecar = sidecarAnnouncementSchema.parse(written);
        expect(readJsonAnnouncement(JSON.stringify(sidecar))).toEqual(sidecar);
      }),
    );
  });
});
