import { EventEmitter } from "node:events";
import OSC from "osc-js";
import { getExecutorNumber, makeExecutorNumber } from "./helpers";

/**
 * Service for handling OSC communications with MagicQ
 * Uses separate OSC objects for sending and receiving messages
 */
export class MagicQOscService extends EventEmitter {
  public connected = false;
  private feedbackInterval: NodeJS.Timeout | null = null;
  private oscReceiver: OSC;
  private oscSender: OSC;

  constructor(
    private connection: {
      receivePort: number;
      receiveAddress: string;
      sendPort: number;
      sendAddress: string;
    }
  ) {
    super();

    // Initialize OSC receiver
    this.oscReceiver = new OSC({
      plugin: new OSC.DatagramPlugin({
        type: "udp4",
        open: {
          host: this.connection.receiveAddress,
          port: this.connection.receivePort,
        },
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      } as any),
    });

    // Initialize OSC sender
    this.oscSender = new OSC({
      plugin: new OSC.DatagramPlugin({
        type: "udp4",
        send: {
          host: this.connection.sendAddress,
          port: this.connection.sendPort,
        },
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      } as any),
    });

    // Set up receiver event handlers
    this.oscReceiver.on("open", () => {
      console.log(" ---- OSC RECEIVER OPENED ----");
      console.log(
        `[OSC] receiver started on ${this.connection.receiveAddress}:${this.connection.receivePort}`
      );
    });

    this.oscReceiver.on("*", (message: OSC.Message) => {
      console.log("[OSC] Received message:", message);
      this.handleOSCMessage(message);
    });

    // Set up sender event handlers
    this.oscSender.on("open", () => {
      console.log(
        `[OSC] sender configured to send to ${this.connection.sendAddress}:${this.connection.sendPort}`
      );
    });
  }

  /**
   * Starts the OSC receiver and feedback interval
   */
  public start(): void {
    // Start OSC receiver
    this.oscReceiver.open({
      host: this.connection.receiveAddress,
      port: this.connection.receivePort,
    });
    console.log(
      `[OSC] receiver starting on ${this.connection.receiveAddress}:${this.connection.receivePort}`
    );

    // Start feedback interval
    this.startFeedbackInterval();
  }

  /**
   * Stops the OSC server and cleans up resources
   */
  public stop(): void {
    // Stop feedback interval
    if (this.feedbackInterval) {
      clearInterval(this.feedbackInterval);
      this.feedbackInterval = null;
    }

    // Close OSC connections
    this.oscReceiver.close();
    this.oscSender.close();
  }

  /**
   * Sends an OSC message using the sender
   */
  public sendOSC(path: string, value: number | string): void {
    if (!this.connected) {
      console.log("[OSC] Not connected, skipping message:", path, value);
      return;
    }
    const message = new OSC.Message(path, Number(value) * 1.0);
    message.types = "f";
    console.log("[OSC] Sending message:", message);
    this.oscSender.send(message);
  }

  /**
   * Sends an executor command to MagicQ
   * @param exec Executor number
   * @param value Float value between 0 and 1
   */
  public async sendExecutorCommand(
    exec: number,
    value: number
  ): Promise<number> {
    const execNumber = makeExecutorNumber(exec);
    try {
      // Validate value range
      const normalizedValue = Math.max(0, Math.min(1, value));
      const address = `/exec/1/${execNumber}`;

      this.sendOSC(address, normalizedValue);
    } catch (error) {
      console.error("[OSC] Error sending executor command:", error);
    }
    return execNumber;
  }

  /**
   * Starts the interval to send feedback requests to MagicQ
   */
  private startFeedbackInterval(): void {
    // Clear any existing interval
    if (this.feedbackInterval) {
      clearInterval(this.feedbackInterval);
    }

    // Send feedback request every minute
    this.feedbackInterval = setInterval(() => {
      try {
        console.log("[OSC] Sending feedback request");
        if (this.connected) {
          const message = new OSC.Message("/feedback/exec", true);
          this.oscSender.send(message);
        }
      } catch (error) {
        console.error("[OSC] Error sending feedback request:", error);
      }
    }, 10000); // 1 minute

    // Send initial feedback request
    console.log("[OSC] Sending feedback request");
    if (this.connected) {
      const message = new OSC.Message("/feedback/exec", true);
      this.oscSender.send(message);
    }
  }

  /**
   * Handles incoming OSC messages
   */
  private handleOSCMessage(message: OSC.Message): void {
    try {
      console.log("[OSC] Received message:", message);

      // Check if it's an executor update
      const match = message.address.match(/^\/exec\/1\/(\d+)$/);
      if (match && message.args.length > 0) {
        const exec = Number.parseInt(match[1], 10);
        const isInfoExec = (exec - 1) % 20 > 9;
        const executorNumber = getExecutorNumber(exec);
        const value = message.args[0] as number;

        if (!isInfoExec) {
          this.emit("osc", {
            exec: executorNumber,
            value,
          });
        }
      }

      // Emit the OSC message for other handlers
    } catch (error) {
      console.error("[OSC] Error handling OSC message:", error);
    }
  }
}
