import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { ChildProcess } from "./services/child-process";
import { MagicQHttpService } from "./services/magicq-http";
import { MagicQOscService } from "./services/magicq-osc";
import { ButtonControllerService } from "./services/button-controller";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

dotenv.config();

const WS_PORT = Number(process.env.WS_PORT || 3001);
const LISTEN_IP = process.env.LISTEN_IP || "localhost";
const MAGICQ_IP = process.env.MAGICQ_IP || "localhost";
const MAGICQ_HTTP_PORT = Number(process.env.MAGICQ_HTTP_PORT || 8080);
const MAGICQ_OSC_RECEIVE_PORT = Number(
  process.env.MAGICQ_OSC_RECEIVE_PORT || 8000
);
const MAGICQ_OSC_SEND_PORT = Number(process.env.MAGICQ_OSC_SEND_PORT || 9000);
const BUTTON_CONTROLLER_PORT =
  process.env.BUTTON_CONTROLLER_PORT || "/dev/cu.usbmodem1101";

// Default brightness values
const DEFAULT_INACTIVE_BRIGHTNESS = 25;
const DEFAULT_ACTIVE_BRIGHTNESS = 40;

// Path to store brightness settings
const BRIGHTNESS_SETTINGS_PATH = join(__dirname, "brightness-settings.json");

class WebSocketService {
  private wss: WebSocketServer;
  private childProcess: ChildProcess;
  private magicq: MagicQHttpService;
  private magicqOsc: MagicQOscService;
  private buttonController: ButtonControllerService;
  private isShuttingDown = false;
  private showLoaded = false;
  private brightnessSettings: { inactive: number; active: number };

  private state: Record<
    number,
    { type: "toggle" | "flash" | "fader" | "other"; value: number }
  > = {};

  constructor() {
    // Load brightness settings from file or use defaults
    this.brightnessSettings = this.loadBrightnessSettings();

    console.log(`
+----------------------------------+
| LISTEN_IP: ${LISTEN_IP}            |
| MAGICQ_IP: ${MAGICQ_IP}            |
| MAGICQ_HTTP_PORT: ${MAGICQ_HTTP_PORT} |
| MAGICQ_OSC_RECEIVE_PORT: ${MAGICQ_OSC_RECEIVE_PORT} |
| MAGICQ_OSC_SEND_PORT: ${MAGICQ_OSC_SEND_PORT} |
| BUTTON_CONTROLLER_PORT: ${BUTTON_CONTROLLER_PORT} |
| INACTIVE_BRIGHTNESS: ${this.brightnessSettings.inactive} |
| ACTIVE_BRIGHTNESS: ${this.brightnessSettings.active} |
+----------------------------------+
`);

    // Initialize WebSocket server on its own port
    this.wss = new WebSocketServer({ port: WS_PORT });

    // Initialize services
    this.childProcess = new ChildProcess();
    this.magicq = new MagicQHttpService(
      `http://${MAGICQ_IP}:${MAGICQ_HTTP_PORT}`
    );
    this.magicqOsc = new MagicQOscService({
      receivePort: MAGICQ_OSC_RECEIVE_PORT,
      sendPort: MAGICQ_OSC_SEND_PORT,
      receiveAddress: LISTEN_IP,
      sendAddress: MAGICQ_IP,
    });
    this.buttonController = new ButtonControllerService(BUTTON_CONTROLLER_PORT);

    // Handle button controller events
    this.buttonController.on("connected", () => {
      console.log("Button controller connected");

      // Set initial brightness values
      this.buttonController.setBrightness(
        this.brightnessSettings.inactive,
        this.brightnessSettings.active
      );
    });

    this.buttonController.on("disconnected", () => {
      console.log("Button controller disconnected");
    });

    this.buttonController.on("buttonPressed", (button) => {
      this.handleExecutorCommand(button, 1);
    });

    this.buttonController.on("buttonReleased", (button) => {
      this.handleExecutorCommand(button, 0);
    });

    this.buttonController.on("potValue", (pot, value) => {
      this.handleExecutorCommand(41 + pot, value);
    });

    this.magicqOsc.on("osc", (data) => {
      this.state[data.exec] = {
        type: data.type,
        value: data.value,
      };

      this.broadcast({
        type: "val",
        data: {
          number: data.exec,
          value: data.value,
        },
      });

      // Update button state if it's a button executor
      if (data.exec <= 40) {
        console.log("Setting button active:", data.exec - 1, data.value > 0);
        this.buttonController.setButtonActive(data.exec - 1, data.value > 0);
      }
    });

    // Setup WebSocket connection handling
    this.wss.on("connection", (ws) => {
      console.log("Client connected to WebSocket");

      // Send initial connection success message
      ws.send(JSON.stringify({ type: "connection", status: "connected" }));

      // Send current brightness values to new client
      ws.send(
        JSON.stringify({
          type: "brightness-values",
          data: this.brightnessSettings,
        })
      );

      // Handle client disconnection
      ws.on("close", () => {
        console.log("Client disconnected from WebSocket");
      });

      // Handle connection errors
      ws.on("error", (error) => {
        console.error("WebSocket connection error:", error);
      });

      // Handle incoming messages
      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());

          switch (message.type) {
            case "reload-executors":
              // Fetch names from MagicQ and broadcast to clients
              const magicqData = await this.magicq.fetchData();
              this.broadcast({
                type: "show-setup",
                data: magicqData,
              });
              if ("executors" in magicqData) {
                this.showLoaded = true;
                this.updateButtonColors(magicqData.executors);
                for (const exec of Object.values(magicqData.executors)) {
                  this.state[exec.number] = {
                    type: exec.number > 40 ? "fader" : exec.type,
                    value: this.state[exec.number]?.value || 0,
                  };
                }
              }
              break;

            case "exec":
              // Forward OSC messages to MagicQ
              try {
                if (message.address && message.value !== undefined) {
                  await this.magicqOsc.sendExecutorCommand(
                    message.address,
                    message.value
                  );
                }
              } catch (error) {
                console.error("Error sending OSC message:", error);
                ws.send(
                  JSON.stringify({
                    type: "error",
                    error: "Failed to send OSC message",
                  })
                );
              }
              break;

            case "set-brightness":
              // Update button controller brightness
              try {
                if (
                  message.data?.inactive !== undefined &&
                  message.data?.active !== undefined
                ) {
                  this.brightnessSettings = {
                    inactive: message.data.inactive,
                    active: message.data.active,
                  };
                  this.buttonController.setBrightness(
                    this.brightnessSettings.inactive,
                    this.brightnessSettings.active
                  );
                  this.saveBrightnessSettings();
                }
              } catch (error) {
                console.error("Error setting brightness:", error);
                ws.send(
                  JSON.stringify({
                    type: "error",
                    error: "Failed to set brightness",
                  })
                );
              }
              break;

            case "get-brightness":
              // Send current brightness values to client
              ws.send(
                JSON.stringify({
                  type: "brightness-values",
                  data: this.brightnessSettings,
                })
              );
              break;

            default:
              console.warn("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });
    });

    // Broadcast child process data
    this.childProcess.on("data", (data) => {
      if (!this.isShuttingDown) {
        this.broadcast({ type: "spl", data });
      }
    });

    // Start services
    if (existsSync("/home/keller/repos/gm1356/splread")) {
      this.childProcess.start("/home/keller/repos/gm1356/splread", [
        "-i 50",
        "-f",
      ]);
    }

    this.magicqOsc.start();
    this.buttonController.start();

    // Set initial brightness values
    this.buttonController.setBrightness(
      this.brightnessSettings.inactive,
      this.brightnessSettings.active
    );

    console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
  }

  /**
   * Updates button colors based on showfile data
   */
  private updateButtonColors(executors: Record<number, any>): void {
    console.log("Updating button colors", executors);
    for (const [exec, data] of Object.entries(executors)) {
      const button = Number(exec) - 1;
      if (button >= 0 && button < 40) {
        const color = data.color || "000";
        this.buttonController.setButtonColor(button, color);
      }
    }
  }

  /**
   * Handles executor commands from buttons and potentiometers
   */
  private handleExecutorCommand(execNumber: number, valueInput: number): void {
    const exec = this.state[execNumber] || {
      type: execNumber > 40 ? "fader" : "toggle",
      value: 0,
    };
    this.state[execNumber] = exec;

    const lastValue = exec.value;
    const type = exec.type;

    if (type === "fader") {
      exec.value = Math.min(valueInput / 255, 0.9999);
    } else if (type === "toggle" && valueInput > 0) {
      exec.value = lastValue === 0 ? 1 : 0;
    } else if (type === "toggle") {
      return; // ignore note off for toggle
    } else if (type === "flash" || type === "other") {
      exec.value = valueInput > 0 ? 1 : 0;
    }

    if (exec.type === "toggle") {
      console.log(
        "Setting button active (In Button Handler):",
        execNumber - 1,
        exec.value > 0
      );
      this.buttonController.setButtonActive(execNumber - 1, exec.value > 0);
    }

    this.magicqOsc.sendExecutorCommand(execNumber, exec.value);
    this.broadcast({
      type: "val",
      data: {
        number: execNumber,
        value: exec.value,
      },
    });
  }

  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error("Error sending message to client:", error);
        }
      }
    });
  }

  /**
   * Loads brightness settings from file or returns defaults
   */
  private loadBrightnessSettings(): { inactive: number; active: number } {
    try {
      if (existsSync(BRIGHTNESS_SETTINGS_PATH)) {
        const settings = JSON.parse(
          readFileSync(BRIGHTNESS_SETTINGS_PATH, "utf-8")
        );
        return {
          inactive: settings.inactive ?? DEFAULT_INACTIVE_BRIGHTNESS,
          active: settings.active ?? DEFAULT_ACTIVE_BRIGHTNESS,
        };
      }
    } catch (error) {
      console.error("Error loading brightness settings:", error);
    }
    return {
      inactive: DEFAULT_INACTIVE_BRIGHTNESS,
      active: DEFAULT_ACTIVE_BRIGHTNESS,
    };
  }

  /**
   * Saves brightness settings to file
   */
  private saveBrightnessSettings(): void {
    try {
      writeFileSync(
        BRIGHTNESS_SETTINGS_PATH,
        JSON.stringify(this.brightnessSettings, null, 2)
      );
    } catch (error) {
      console.error("Error saving brightness settings:", error);
    }
  }

  public async stop(): Promise<void> {
    console.log("Shutting down WebSocket service...");
    this.isShuttingDown = true;

    // Close all client connections first
    for (const client of this.wss.clients) {
      try {
        client.close();
      } catch (error) {
        console.error("Error closing client connection:", error);
      }
    }

    // Stop all services
    await Promise.all([
      this.childProcess.stop(),
      this.magicqOsc.stop(),
      this.buttonController.stop(),
    ]);

    // Close the WebSocket server
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          console.error("Error closing WebSocket server:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    console.log("WebSocket service shutdown complete");
  }
}

// Handle process termination
const wsService = new WebSocketService();

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  try {
    await wsService.stop();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

// Handle different termination signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGQUIT", () => shutdown("SIGQUIT"));
