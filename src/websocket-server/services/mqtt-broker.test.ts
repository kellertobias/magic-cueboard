import { afterEach, describe, expect, it } from "vitest";
import { connectAsync, type MqttClient } from "mqtt";
import { MQTTBrokerService } from "./mqtt-broker";

describe("embedded MQTT broker", () => {
  let broker: MQTTBrokerService | null = null;
  let client: MqttClient | null = null;
  afterEach(async () => { if (client) await client.endAsync(); if (broker) await broker.stop(); client = null; broker = null; });

  it("delivers retained SPL state to consumers that connect after publication", async () => {
    broker = new MQTTBrokerService({ host: "127.0.0.1", port: 0 });
    const started = new Promise<void>(resolve => broker?.once("started", resolve));
    broker.start(); await started;
    broker.publish("tosklight/spl/value", 93.25, true);
    const address = broker.address(); expect(address).not.toBeNull();
    client = await connectAsync(`mqtt://127.0.0.1:${address?.port}`, { clientId: `spl-test-${Date.now()}` });
    const received = new Promise<{ payload: string; retain: boolean }>(resolve => client?.once("message", (_topic, payload, packet) => resolve({ payload: payload.toString(), retain: packet.retain })));
    await client.subscribeAsync("tosklight/spl/value");
    await expect(received).resolves.toEqual({ payload: "93.25", retain: true });
  });
});
