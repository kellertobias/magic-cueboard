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
    this.server = createServer(this.broker);
    this.server.listen(this.config.port, this.config.host || "0.0.0.0", () => {
      console.log(
        `[MQTT] Broker started on ${this.config.host || "0.0.0.0"}:${
          this.config.port
        }`
      );
      this.emit("started");
    });

    this.server.on("error", (error: Error) => {
      console.error("[MQTT] Server error:", error);
      this.emit("error", error);
    });
  }

  /**
   * Stops the MQTT broker server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
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
  public publish(topic: string, message: unknown): void {
    const payload = JSON.stringify(message);
    const packet: PublishPacket = {
      cmd: "publish",
      topic,
      payload: Buffer.from(payload),
      qos: 0,
      retain: false,
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
