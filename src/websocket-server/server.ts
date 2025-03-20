import { WebSocketServer, WebSocket } from "ws";
import { ChildProcess } from "./services/child-process";
import { MagicQData, MagicQHttpService } from "./services/magicq-http";
import { MagicQOscService } from "./services/magicq-osc";
import { ButtonControllerService } from "./services/button-controller";
import { existsSync, readFileSync, writeFileSync } from "fs";

export class WebSocketService {
  private wss: WebSocketServer;
  private childProcess: ChildProcess;
  private magicqHttp: MagicQHttpService;
  private magicqOsc: MagicQOscService;
  private buttonController: ButtonControllerService;
  private brightnessSettings: { inactive: number; active: number };
  private brightnessSettingsPath: string;

  private state: Record<
    number,
    { type: "toggle" | "flash" | "fader" | "other"; value: number }
  > = {};
  private magicqData: MagicQData | { error: string } | null = null;

  private isShowLoadingAttemptInProgress: boolean = false;
  private showLoadingInterval: NodeJS.Timeout | null = null;

  constructor({
    listenIp,
    magicqIp,
    magicqHttpPort,
    magicqOscReceivePort,
    magicqOscSendPort,
    buttonControllerPort,
    inactiveBrightness,
    activeBrightness,
    brightnessSettingsPath,
    wsPort,
  }: {
    listenIp: string;
    magicqIp: string;
    magicqHttpPort: number;
    magicqOscReceivePort: number;
    magicqOscSendPort: number;
    buttonControllerPort: string | null;
    inactiveBrightness: number;
    activeBrightness: number;
    brightnessSettingsPath: string;
    wsPort: number;
  }) {
    // Load brightness settings from file or use defaults
    this.brightnessSettingsPath = brightnessSettingsPath;
    this.brightnessSettings = this.loadBrightnessSettings(
      inactiveBrightness,
      activeBrightness
    );

    console.log(`
      +----------------------------------+
      | LISTEN_IP: ${listenIp}            |
      | MAGICQ_IP: ${magicqIp}            |
      | MAGICQ_HTTP_PORT: ${magicqHttpPort} |
      | MAGICQ_OSC_RECEIVE_PORT: ${magicqOscReceivePort} |
      | MAGICQ_OSC_SEND_PORT: ${magicqOscSendPort} |
      | BUTTON_CONTROLLER_PORT: ${buttonControllerPort} |
      | INACTIVE_BRIGHTNESS: ${inactiveBrightness} |
      | ACTIVE_BRIGHTNESS: ${activeBrightness} |
      +----------------------------------+
      `);

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ port: wsPort });

    // Initialize other services
    this.childProcess = new ChildProcess();
    this.magicqHttp = new MagicQHttpService(
      `http://${magicqIp}:${magicqHttpPort}`
    );
    this.magicqOsc = new MagicQOscService({
      receivePort: magicqOscReceivePort,
      sendPort: magicqOscSendPort,
      receiveAddress: listenIp,
      sendAddress: magicqIp,
    });
    this.buttonController = new ButtonControllerService(buttonControllerPort);

    // Setup event handlers
    this.setupButtonControllerEvents();
    this.setupMagicQOscEvents();

    this.setupWebSocketServer();
    this.startServices();
  }

  /**
   * Sets up event handlers for the button controller
   */
  private setupButtonControllerEvents(): void {
    this.buttonController.on("connected", () => {
      this.buttonController.setBrightness(
        this.brightnessSettings.inactive,
        this.brightnessSettings.active
      );
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
  }

  /**
   * Sets up event handlers for the MagicQ OSC service
   */
  private setupMagicQOscEvents(): void {
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
  }

  /**
   * Sets up the WebSocket server and its event handlers
   */
  private setupWebSocketServer(): void {
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

      // send show setup
      this.sendShowSetup();

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
        await this.handleWebSocketMessage(ws, data);
      });
    });
  }

  /**
   * Handles incoming WebSocket messages
   */
  private async handleWebSocketMessage(
    ws: WebSocket,
    data: any
  ): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "reload-executors":
          await this.handleReloadExecutors();
          break;

        case "exec":
          await this.handleExecutorMessage(ws, message);
          break;

        case "set-brightness":
          await this.handleSetBrightness(ws, message);
          break;

        case "get-brightness":
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
  }

  /**
   * Handles the reload-executors message
   */
  private async handleReloadExecutors(): Promise<void> {
    this.magicqData = await this.magicqHttp.fetchData();
    this.sendShowSetup();
    if (this.magicqData && "executors" in this.magicqData) {
      for (const exec of Object.values(this.magicqData.executors)) {
        this.state[exec.number] = {
          type: exec.number > 40 ? "fader" : exec.type,
          value: this.state[exec.number]?.value || 0,
        };
      }
      this.updateButtonColors(this.magicqData.executors);
    }
  }

  private async sendShowSetup(): Promise<void> {
    this.broadcast({
      type: "show-setup",
      data: this.magicqData,
    });
  }

  /**
   * Handles the executor message
   */
  private async handleExecutorMessage(
    ws: WebSocket,
    message: any
  ): Promise<void> {
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
  }

  /**
   * Handles the set-brightness message
   */
  private async handleSetBrightness(
    ws: WebSocket,
    message: any
  ): Promise<void> {
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
  }

  /**
   * Attempts to load the show data and updates the state
   * @returns Promise that resolves when the show is loaded or rejects with an error
   */
  private async attemptLoadShow(): Promise<void> {
    if (this.isShowLoadingAttemptInProgress) {
      console.log("Show loading attempt already in progress, skipping...");
      return;
    }

    if (
      this.magicqData &&
      "showName" in this.magicqData &&
      this.magicqData.showName
    ) {
      console.log("Show already loaded, aborting...");
      if (this.showLoadingInterval) {
        clearInterval(this.showLoadingInterval);
        this.showLoadingInterval = null;
      }
      return;
    }

    this.isShowLoadingAttemptInProgress = true;
    try {
      console.log("~~~ Attempting to load show data...");
      this.handleReloadExecutors();
      if (
        !this.magicqData ||
        "error" in this.magicqData ||
        !this.magicqData.showName
      ) {
        console.log("~~~ No show data available yet");
        return;
      }
      console.log("~~~ Show data loaded successfully", this.magicqData);

      // Clear the interval since we successfully loaded the show
      if (this.showLoadingInterval) {
        clearInterval(this.showLoadingInterval);
        this.showLoadingInterval = null;
      }
    } catch (error) {
      console.error("Error loading show:", String(error));
    } finally {
      this.isShowLoadingAttemptInProgress = false;
    }
  }

  /**
   * Starts periodic show loading attempts
   */
  private startPeriodicShowLoading(): void {
    // Initial attempt
    this.attemptLoadShow();

    // Set up interval for subsequent attempts
    this.showLoadingInterval = setInterval(() => {
      this.attemptLoadShow();
    }, 15000); // 15 seconds
  }

  /**
   * Starts all required services
   */
  private startServices(): void {
    // Start child process if available
    if (existsSync("/home/keller/repos/gm1356/splread")) {
      this.childProcess.start("/home/keller/repos/gm1356/splread", [
        "-i 50",
        "-f",
      ]);
    }

    // Start other services
    this.magicqOsc.start();
    this.buttonController.start();

    // Start periodic show loading
    this.startPeriodicShowLoading();

    console.log(`WebSocket server running`);
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
      const nextValue = Math.min(
        Math.round((valueInput / 255) * 100) / 100,
        0.9999
      );

      if (nextValue === exec.value) {
        return;
      }
      exec.value = nextValue;
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
  private loadBrightnessSettings(
    inactiveBrightness: number,
    activeBrightness: number
  ): { inactive: number; active: number } {
    try {
      if (existsSync(this.brightnessSettingsPath)) {
        const settings = JSON.parse(
          readFileSync(this.brightnessSettingsPath, "utf-8")
        );
        return {
          inactive: settings.inactive ?? inactiveBrightness,
          active: settings.active ?? activeBrightness,
        };
      }
    } catch (error) {
      console.error("Error loading brightness settings:", error);
    }
    return {
      inactive: inactiveBrightness,
      active: activeBrightness,
    };
  }

  /**
   * Saves brightness settings to file
   */
  private saveBrightnessSettings(): void {
    try {
      writeFileSync(
        this.brightnessSettingsPath,
        JSON.stringify(this.brightnessSettings, null, 2)
      );
    } catch (error) {
      console.error("Error saving brightness settings:", error);
    }
  }

  public async stop(): Promise<void> {
    console.log("Shutting down WebSocket service...");

    // Clear show loading interval
    if (this.showLoadingInterval) {
      clearInterval(this.showLoadingInterval);
      this.showLoadingInterval = null;
    }

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
