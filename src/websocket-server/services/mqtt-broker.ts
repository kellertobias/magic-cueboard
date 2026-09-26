import Aedes from "aedes";
import { createServer } from "aedes-server-factory";
import { EventEmitter } from "node:events";
import type { Client, Subscription, PublishPacket } from "aedes";
import type { Server } from "net";

/**
 * Service for running an MQTT broker using Aedes
 * Handles MQTT client connections and message routing
 */
export class MQTTBrokerService extends EventEmitter {
  private broker: Aedes;
  private server: Server | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryMilliseconds = 1000;
  private stopping = false;

  constructor(
    private config: {
      port: number;
      host?: string;
    }
  ) {
    super();
    this.broker = new Aedes();
    this.setupBroker();
  }

  /**
   * Sets up the MQTT broker with event handlers
   */
  private setupBroker(): void {
    // Aedes passes a client only for publishes received over MQTT. Internal
    // publications have no client and must never come back as incoming toasts.
    this.broker.on("publish", (packet: PublishPacket, client: Client | null) => {
      if (client) this.emit("incoming", packet.topic, packet.payload.toString(), client.id);
    });
    // Handle client connections
    this.broker.on("client", (client: Client) => {
      console.log(`[MQTT] Client connected: ${client.id}`);
      this.emit("clientConnected", client.id);
    });

    // Handle client disconnections
    this.broker.on("clientDisconnect", (client: Client) => {
      console.log(`[MQTT] Client disconnected: ${client.id}`);
      this.emit("clientDisconnected", client.id);
    });

    // Handle subscription events
    this.broker.on(
      "subscribe",
      (subscriptions: Subscription[], client: Client) => {
        console.log(
          `[MQTT] Client ${client.id} subscribed to:`,
          subscriptions.map((s) => s.topic).join(", ")
        );
      }
    );

    // Handle unsubscription events
    this.broker.on("unsubscribe", (subscriptions: string[], client: Client) => {
      console.log(
        `[MQTT] Client ${client.id} unsubscribed from:`,
        subscriptions.join(", ")
      );
    });
  }

  /**
   * Starts the MQTT broker server
   */
  public start(): void {
    if (this.server || this.retryTimer) return;
    this.stopping = false;
    this.listen();
  }

  public address(): { host: string; port: number } | null {
    const address = this.server?.address();
    return address && typeof address !== "string" ? { host: address.address, port: address.port } : null;
  }

  private listen(): void {
    this.server = createServer(this.broker);
    this.server.listen(this.config.port, this.config.host || "0.0.0.0", () => {
      this.retryMilliseconds = 1000;
      console.log(
        `[MQTT] Broker started on ${this.config.host || "0.0.0.0"}:${
          this.config.port
        }`
      );
      this.emit("started");
    });

    this.server.on("error", (error: Error) => {
      console.warn("[MQTT] Broker unavailable; retrying:", error.message);
      this.emit("warning", error);
      const failedServer = this.server;
      this.server = null;
      try { failedServer?.close(); } catch { /* A failed listener may already be closed. */ }
      if (!this.stopping && !this.retryTimer) {
        const delay = this.retryMilliseconds;
        this.retryMilliseconds = Math.min(10_000, this.retryMilliseconds * 2);
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.listen(); }, delay);
      }
    });
  }

  /**
   * Stops the MQTT broker server
   */
  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    return new Promise((resolve) => {
      if (this.server) {
        const server = this.server;
        this.server = null;
        server.close(() => {
          console.log("[MQTT] Broker stopped");
          this.emit("stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Publishes a message to a topic
   * @param topic The topic to publish to
   * @param message The message to publish
   */
  public publish(topic: string, message: unknown, retain = false): void {
    this.publishText(topic, JSON.stringify(message), retain);
  }

  public publishText(topic: string, payload: string, retain = false): void {
    const packet: PublishPacket = {
      cmd: "publish",
      topic,
      payload: Buffer.from(payload),
      qos: 0,
      retain,
      dup: false,
    };
    this.broker.publish(packet, () => {
      // Optional callback for when the message is published
    });
  }

  /**
   * Subscribes to a topic
   * @param topic The topic to subscribe to
   * @param callback Optional callback for subscription result
   */
  public subscribe(topic: string, callback?: () => void): void {
    this.broker.subscribe(topic, () => {}, callback || (() => {}));
  }
}
