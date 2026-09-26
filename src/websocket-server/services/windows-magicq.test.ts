import { describe, expect, it } from "vitest";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { WindowsMagicQService } from "./windows-magicq";

const timing = { heartbeat: 20, stale: 80, retry: 30, maxRetry: 60 };
const metrics = { timestamp: 1, cpuP95Percent: 42, ramUsedBytes: 100, ramTotalBytes: 200, gpuPercent: 12, temperatureC: null, cpuHistory: [42] };
async function openServer(port = 0) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await once(server, "listening");
  return server;
}
async function closeServer(server: WebSocketServer) {
  for (const client of server.clients) client.terminate();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

describe("Windows bridge recovery", () => {
  it("reconnects and receives fresh metrics after the Windows server restarts", async () => {
    let server = await openServer();
    const address = server.address() as { port: number };
    const service = new WindowsMagicQService(`ws://127.0.0.1:${address.port}/surface`, "test-token-at-least-16", timing);
    server.on("connection", socket => socket.send(JSON.stringify({ type: "system-metrics", data: metrics })));
    try {
      const first = once(service, "system-metrics");
      service.start();
      expect((await first)[0].cpuP95Percent).toBe(42);
      await closeServer(server);
      const resumed = once(service, "system-metrics");
      server = await openServer(address.port);
      server.on("connection", socket => socket.send(JSON.stringify({ type: "system-metrics", data: { ...metrics, timestamp: 2, cpuP95Percent: 24 } })));
      expect((await resumed)[0].cpuP95Percent).toBe(24);
    } finally { await service.stop(); await closeServer(server); }
  });

  it("replaces a stalled connection when the Windows server stops responding", async () => {
    const server = await openServer();
    const address = server.address() as { port: number };
    const service = new WindowsMagicQService(`ws://127.0.0.1:${address.port}/surface`, "test-token-at-least-16", timing);
    let connections = 0;
    server.on("connection", socket => {
      connections++;
      if (connections === 1) (socket as unknown as { _socket: { pause(): void } })._socket.pause();
      else socket.send(JSON.stringify({ type: "system-metrics", data: metrics }));
    });
    try {
      const resumed = once(service, "system-metrics");
      service.start();
      expect((await resumed)[0].ramUsedBytes).toBe(100);
      expect(connections).toBe(2);
    } finally { for (const client of server.clients) client.terminate(); await service.stop(); await closeServer(server); }
  });
});
