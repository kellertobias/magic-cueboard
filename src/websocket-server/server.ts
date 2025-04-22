import { ChildProcess } from "./services/child-process";
import { type MagicQData, MagicQHttpService } from "./services/magicq-http";
import { MagicQOscService } from "./services/magicq-osc";
import { ButtonControllerService } from "./services/button-controller";
import { CommandExecutorService } from "./services/command-executor";
import { MQTTBrokerService } from "./services/mqtt-broker";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { systemCommands } from "@/system-commands";
import { WebSocketServer, WebSocket } from "ws";

export class WebSocketService {
  private wss: WebSocketServer;
  private childProcess: ChildProcess;
  private magicqHttp: MagicQHttpService;
  private magicqOsc: MagicQOscService;
  private buttonController: ButtonControllerService;
  private commandExecutor: CommandExecutorService;
  private mqttBroker: MQTTBrokerService;
  private brightnessSettings: { inactive: number; active: number };
  private brightnessSettingsPath: string;

  private state: Record<
    number,
    { type: "toggle" | "flash" | "fader" | "other"; value: number }
  > = {};
  private magicqData: MagicQData | { error: string } | null = null;

  // Store recent fader values for debouncing
  private faderValues: Record<number, { value: number; timestamp: number }[]> =
    {};

  private isShowLoadingAttemptInProgress = false;
  private showLoadingInterval: NodeJS.Timeout | null = null;
  private listenIp: string;

  // Map to store each client's message type preferences
  private clientMessageTypes: Map<WebSocket, string[]> = new Map();

  private timeInterval: NodeJS.Timeout | null = null;

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
    mqttHost,
    mqttPort,
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
    mqttHost: string;
    mqttPort: number;
  }) {
    this.listenIp = listenIp;
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
      | MQTT_HOST: ${mqttHost}            |
      | MQTT_PORT: ${mqttPort}            |
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
    this.commandExecutor = new CommandExecutorService();
    this.mqttBroker = new MQTTBrokerService({
      port: mqttPort,
      host: mqttHost,
    });

    // Setup event handlers
    this.setupButtonControllerEvents();
    this.setupMagicQOscEvents();
    this.setupWebSocketServer();
    this.setupCommandExecutorEvents();
    this.setupSPLMeterEvents();

    this.magicqOsc.start();
    this.buttonController.start();
    this.mqttBroker.start();

    // Start child process if available
    if (existsSync("/home/keller/repos/gm1356/splread")) {
      console.log("dB Meter Process Exists - Starting...");
      this.childProcess.start("/home/keller/repos/gm1356/splread", [
        "-i 50",
        "-f",
      ]);
    }

    // Start periodic show loading
    this.startPeriodicShowLoading();

    this.timeInterval = setInterval(() => {
      const time = new Date();
      this.mqttBroker.publish(
        "time",
        `${time.getHours().toString().padStart(2, "0")}:${time
          .getMinutes()
          .toString()
          .padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`
      );
    }, 1000);

    console.log("Server fully started");
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
      console.log("[OSC] Received message in server:", data);
      if (!this.state[data.exec]) {
        console.log("[OSC] No state for executor", data);
        return;
      }

      this.state[data.exec].value = data.value;

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

      // Initialize empty message types array for new client
      this.clientMessageTypes.set(ws, []);

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
        // Clean up client preferences
        this.clientMessageTypes.delete(ws);
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
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    data: any
  ): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "only":
          // Update client's message type preferences
          if (Array.isArray(message.types)) {
            this.clientMessageTypes.set(ws, message.types);
            console.log(
              `Client now only receiving messages of types: ${message.types.join(
                ", "
              )}`
            );
          }
          break;

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

        case "system-command":
          await this.handleSystemCommand(ws, message);
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
      this.magicqOsc.connected = true;
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
      data: { ...this.magicqData, ip: this.listenIp },
    });
  }

  /**
   * Handles the executor message
   */
  private async handleExecutorMessage(
    ws: WebSocket,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
   * Sets up event handlers for the command executor
   */
  private setupCommandExecutorEvents(): void {
    this.commandExecutor.on(
      "output",
      (output: { line: string; isError: boolean }) => {
        this.broadcast({
          type: "system-command-response",
          data: {
            command: output.line.startsWith("$ ") ? output.line.slice(2) : "",
            output: `${output.line}\n`,
            isError: output.isError,
          },
        });
      }
    );
  }

  /**
   * Handles system control commands
   */
  private async handleSystemCommand(
    ws: WebSocket,
    message: { command: string }
  ): Promise<void> {
    try {
      const { command } = message;
      if (command in systemCommands) {
        await this.commandExecutor.callCommand(
          systemCommands[command as keyof typeof systemCommands]
        );
      } else {
        console.error("Unknown system command:", command);
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Unknown system command",
          })
        );
      }
    } catch (error) {
      console.error("Error executing system command:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to execute system command",
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
   * Updates button colors based on showfile data
   */

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
   * Calculates a debounced value for a fader by averaging recent values within a 1-second window
   * @param faderNumber The number of the fader executor
   * @param newValue The new value to add to the history
   * @returns The debounced value
   */
  private getDebouncedValue(faderNumber: number, newValue: number): number {
    // Initialize fader values array if it doesn't exist
    if (!this.faderValues[faderNumber]) {
      this.faderValues[faderNumber] = [];
    }

    // Add new value with current timestamp
    this.faderValues[faderNumber].push({
      value: newValue,
      timestamp: Date.now(),
    });

    // Remove values older than 1 second
    const oneSecondAgo = Date.now() - 1000;
    this.faderValues[faderNumber] = this.faderValues[faderNumber].filter(
      (entry) => entry.timestamp >= oneSecondAgo
    );

    // Calculate average of recent values
    const average =
      this.faderValues[faderNumber].reduce(
        (sum, entry) => sum + entry.value,
        0
      ) / this.faderValues[faderNumber].length;

    // If value is 0 or > 0.99, return the exact value
    if (newValue <= 0.01) {
      return 0;
    }
    if (newValue >= 0.99) {
      return 0.999;
    }

    return average;
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
      exec.value = this.getDebouncedValue(
        execNumber,
        Math.round((valueInput / 255) * 100) / 100
      );

      if (exec.value === lastValue) {
        return;
      }
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

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          // Get client's message type preferences
          const allowedTypes = this.clientMessageTypes.get(client);

          // If client has no preferences (undefined or empty array) or message type is in preferences, send the message
          if (
            !allowedTypes ||
            allowedTypes.length === 0 ||
            allowedTypes.includes(data.type)
          ) {
            client.send(message);
          }
        } catch (error) {
          console.error("Error sending message to client:", error);
        }
      }
    }
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

  /**
   * Sets up event handlers for the SPL meter child process
   */
  private setupSPLMeterEvents(): void {
    this.childProcess.on(
      "data",
      (data: {
        measured: number;
        timestamp: string;
        mode: string;
        freqMode: string;
        range: string;
      }) => {
        // Broadcast SPL data to all connected clients
        this.broadcast({
          type: "spl",
          data: {
            measured: data.measured,
            timestamp: data.timestamp,
            mode: data.mode,
            freqMode: data.freqMode,
            range: data.range,
          },
        });

        // Publish SPL data to MQTT topics
        this.mqttBroker.publish("spl/value", data.measured);
        this.mqttBroker.publish("spl/mode", data.freqMode);
      }
    );
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
      this.mqttBroker.stop(),
    ]);

    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }

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
