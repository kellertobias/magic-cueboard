import { ChildProcess } from "./services/child-process";
import { type MagicQData, MagicQHttpService } from "./services/magicq-http";
import { MagicQOscService } from "./services/magicq-osc";
import { ButtonControllerService, shouldStartLocalCueboard } from "./services/button-controller";
import { CommandExecutorService } from "./services/command-executor";
import { MQTTBrokerService } from "./services/mqtt-broker";
import {
  type ProgrammerData,
  MagicQProgrammerService,
} from "./services/magicq-programmer";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { systemCommands } from "@/system-commands";
import { WebSocketServer, WebSocket } from "ws";
import { WindowsMagicQService, type WindowsMagicQSnapshot } from "./services/windows-magicq";
import { SPLApiService, splPublications, type SPLMeasurement } from "./services/spl-source";
import { ToskLightApiService } from "./services/tosklight-api";

export class WebSocketService {
  private wss: WebSocketServer;
  private childProcess: ChildProcess;
  private magicqHttp: MagicQHttpService;
  private magicqOsc: MagicQOscService;
  private magicqProgrammer: MagicQProgrammerService;
  private buttonController: ButtonControllerService;
  private commandExecutor: CommandExecutorService;
  private mqttBroker: MQTTBrokerService;
  private brightnessSettings: { inactive: number; active: number };
  private brightnessSettingsPath: string;

  private state: Record<
    number,
    { type: "toggle" | "flash" | "solo" | "fader" | "other"; value: number; region?: number }
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
  private magicqSource: "self" | "windows" | "tosklight";
  private sourceSelection: "auto" | "self" | "windows" | "tosklight";
  private activeSurfaceMode: "idle" | "magicq" | "tosklight" = "idle";
  private windowsMagicq: WindowsMagicQService;
  private toskLightApi: ToskLightApiService;
  private layoutMode: "legacy" | "new";
  private layoutSettingsPath: string;
  private splApi: SPLApiService;
  private sourceSettingsPath: string;
  private localHardwareConnected = false;
  private localControllerEnabled = false;
  private remoteSurfaceConnected = false;
  private remoteHardwareAvailable = false;
  private heldPhysicalButtons = new Map<number, { source: "self" | "windows" | "tosklight"; type: "toggle" | "flash" | "solo" | "fader" | "other" }>();
  private ignoredPhysicalReleases = new Set<number>();

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
    magicqSource,
    windowsMagicqUrl,
    windowsMagicqToken,
    toskLightApiUrl,
    layoutMode,
    layoutSettingsPath,
    splApiUrl,
    splApiIntervalMilliseconds,
    sourceSettingsPath,
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
    magicqSource: "auto" | "self" | "windows" | "tosklight";
    windowsMagicqUrl: string;
    windowsMagicqToken: string;
    toskLightApiUrl: string;
    layoutMode: "legacy" | "new";
    layoutSettingsPath: string;
    splApiUrl: string | null;
    splApiIntervalMilliseconds: number;
    sourceSettingsPath: string;
  }) {
    this.listenIp = listenIp;
    this.sourceSettingsPath = sourceSettingsPath;
    this.sourceSelection = this.loadSurfaceSource(magicqSource);
    this.magicqSource = this.sourceSelection === "auto" ? "windows" : this.sourceSelection;
    this.activeSurfaceMode = this.sourceSelection === "auto" ? "idle" : this.magicqSource === "tosklight" ? "tosklight" : "magicq";
    this.layoutSettingsPath = layoutSettingsPath;
    this.layoutMode = this.loadLayoutMode(layoutMode);
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
      | MAGICQ_SOURCE: ${magicqSource}     |
      | WINDOWS_MAGICQ_WS_URL: ${windowsMagicqUrl} |
      +----------------------------------+
      `);

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ port: wsPort });

    // Initialize other services
    this.childProcess = new ChildProcess();
    this.magicqHttp = new MagicQHttpService(`http://${magicqIp}:${magicqHttpPort}`, this.layoutMode);
    this.magicqOsc = new MagicQOscService({
      receivePort: magicqOscReceivePort,
      sendPort: magicqOscSendPort,
      receiveAddress: listenIp,
      sendAddress: magicqIp,
    }, this.layoutMode);
    this.magicqProgrammer = new MagicQProgrammerService(
      `http://${magicqIp}:${magicqHttpPort}`
    );
    this.buttonController = new ButtonControllerService(buttonControllerPort);
    this.commandExecutor = new CommandExecutorService();
    this.mqttBroker = new MQTTBrokerService({
      port: mqttPort,
      host: mqttHost,
    });
    this.windowsMagicq = new WindowsMagicQService(windowsMagicqUrl, windowsMagicqToken);
    this.toskLightApi = new ToskLightApiService(toskLightApiUrl);
    this.splApi = new SPLApiService(splApiUrl, splApiIntervalMilliseconds);

    // Register all source adapters once so the touchscreen can switch APIs.
    this.setupButtonControllerEvents();
    this.setupMagicQOscEvents();
    this.setupMagicQProgrammerEvents();
    this.setupWindowsMagicQEvents();
    this.setupToskLightApiEvents();
    this.setupWebSocketServer();
    this.setupCommandExecutorEvents();
    this.setupSPLMeterEvents();
    this.splApi.on("data", (data: SPLMeasurement) => this.publishSPL(data));
    this.splApi.on("warning", (error: Error) => console.warn("[SPL API]", error.message));
    this.mqttBroker.on("warning", (error: Error) => console.warn("[MQTT]", error.message));

    // The Cueboard lives on the Pi. Linux discovers only the Leonardo USB ID;
    // Windows leaves serial ownership to its hardware bridge by default.
    this.localControllerEnabled = shouldStartLocalCueboard(process.platform, buttonControllerPort);
    if (this.localControllerEnabled) this.buttonController.start();
    this.windowsMagicq.start();
    if (this.magicqSource === "self") {
      this.magicqOsc.start();
      // Note: magicqProgrammer starts conditionally when clients request programmer data
    } else if (this.magicqSource === "tosklight") {
      this.toskLightApi.start();
    }
    this.mqttBroker.start();

    // Start child process if available
    if (splApiUrl) {
      console.log(`External SPL API: ${splApiUrl}`);
      this.splApi.start();
    } else if (existsSync("/home/keller/repos/gm1356/splread")) {
      console.log("dB Meter Process Exists - Starting...");
      this.childProcess.start("/home/keller/repos/gm1356/splread", [
        "-i 50",
        "-f",
      ]);
    }

    // Start periodic show loading
    if (this.magicqSource === "self") this.startPeriodicShowLoading();

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
    this.buttonController.on("connecting", () => this.broadcastHardwareConnection());
    this.buttonController.on("connected", () => {
      this.localHardwareConnected = true;
      this.buttonController.setBrightness(
        this.brightnessSettings.inactive,
        this.brightnessSettings.active
      );
      this.syncLocalButtonHardware();
      this.broadcastHardwareConnection();
    });

    this.buttonController.on("disconnected", () => {
      this.releaseHeldPhysicalButtons();
      this.localHardwareConnected = false;
      this.broadcastHardwareConnection();
    });

    this.buttonController.on("buttonPressed", (button) => {
      this.handlePhysicalExecutor(button, 1, "press");
    });

    this.buttonController.on("buttonReleased", (button) => {
      this.handlePhysicalExecutor(button, 0, "release");
    });

    this.buttonController.on("potValue", (pot, value) => {
      this.handlePhysicalExecutor(41 + pot, value / 255, "level");
    });
  }

  private handlePhysicalExecutor(number: number, value: number, phase: "press" | "release" | "level"): void {
    if (number <= 40 && phase === "press") {
      if (this.heldPhysicalButtons.has(number)) return;
      this.ignoredPhysicalReleases.delete(number);
      this.heldPhysicalButtons.set(number, { source: this.magicqSource, type: this.state[number]?.type || "toggle" });
    }
    const held = number <= 40 ? this.heldPhysicalButtons.get(number) : undefined;
    if (number <= 40 && phase === "release") {
      if (this.ignoredPhysicalReleases.delete(number)) return;
      if (!held) return;
      this.heldPhysicalButtons.delete(number);
      if (held.source !== this.magicqSource) return;
    }
    if (this.magicqSource === "self") {
      this.handleExecutorCommand(number, phase === "level" ? value * 255 : value);
      return;
    }
    const type = held?.type || this.state[number]?.type || (number > 40 ? "fader" : "toggle");
    const effectivePhase = phase === "level" ? "level" : type === "flash" ? phase : phase === "release" ? "click" : null;
    if (!effectivePhase) return;
    const effectiveValue = effectivePhase === "click" ? 1 : value;
    if (number <= 40) {
      if (type === "flash") this.previewLocalButton(number, phase === "press");
      else if (effectivePhase === "click") this.previewLocalButton(number, type === "solo" || !(this.state[number]?.value > 0), type === "solo");
    }
    this.windowsMagicq.sendExecutor(number, effectiveValue, effectivePhase);
  }

  private releaseHeldPhysicalButtons(): void {
    for (const [number, held] of this.heldPhysicalButtons) {
      this.ignoredPhysicalReleases.add(number);
      if (held.type !== "flash") continue;
      this.previewLocalButton(number, false);
      if (held.source === "self") this.handleExecutorCommand(number, 0);
      else this.windowsMagicq.sendExecutor(number, 0, "release");
    }
    this.heldPhysicalButtons.clear();
  }

  /**
   * Sets up event handlers for the MagicQ OSC service
   */
  private setupMagicQOscEvents(): void {
    this.magicqOsc.on("osc", (data) => {
      if (this.magicqSource !== "self") return;
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
      // Note: Configuration messages are already filtered out by the OSC service
      if (data.exec <= 40) {
        console.log("Setting button active:", data.exec - 1, data.value > 0);
        this.buttonController.setButtonActive(data.exec - 1, data.value > 0);
      }
    });
  }

  private setupWindowsMagicQEvents(): void {
    this.windowsMagicq.on("connection", (connected: boolean) => {
      this.remoteSurfaceConnected = connected;
      if (!connected) this.remoteHardwareAvailable = false;
      if (connected) {
        if (!this.localHardwareConnected) this.windowsMagicq.setBrightness(this.brightnessSettings.inactive, this.brightnessSettings.active);
        if (this.magicqSource === "windows") this.windowsMagicq.setLayout(this.layoutMode);
      }
      if (this.magicqSource === "windows") this.broadcast({ type: "magicq-connection", data: { connected, source: "windows" } });
      this.broadcastHardwareConnection();
    });
    this.windowsMagicq.on("warning", (error: Error) => {
      console.warn("[Windows MagicQ]", error.message);
    });
    this.windowsMagicq.on("snapshot", (snapshot: WindowsMagicQSnapshot) => { void this.handleWindowsSnapshot(snapshot); });
  }

  private async handleWindowsSnapshot(snapshot: WindowsMagicQSnapshot): Promise<void> {
      const snapshotSource = snapshot.source ?? "magicq";
      this.remoteHardwareAvailable = snapshot.hardware
        ? snapshot.hardware.cueboardPresent === true || snapshot.hardware.cueboardConnected
        : this.remoteSurfaceConnected;
      this.broadcastHardwareConnection();
      if (this.sourceSelection === "auto") {
        this.activeSurfaceMode = snapshotSource;
        this.broadcast({ type: "source-values", data: { source: this.sourceSelection, activeSource: this.activeSurfaceMode } });
        if (snapshotSource === "tosklight") { await this.activateRuntimeSource("tosklight"); return; }
        if (snapshotSource === "idle") {
          await this.activateRuntimeSource("windows");
          this.magicqData = null; this.state = {}; await this.sendShowSetup();
          this.broadcast({ type: "magicq-connection", data: { connected: false, source: "idle" } });
          return;
        }
        await this.activateRuntimeSource("windows");
      }
      if (this.magicqSource !== "windows") return;
      const executors: MagicQData["executors"] = {};
      this.state = {};
      for (const [key, executor] of Object.entries(snapshot.executors)) {
        const number = Number(key);
        executors[number] = {
          number,
          name: executor.name,
          type: executor.type,
          color: executor.color,
          defaultColor: executor.defaultColor,
          dotColor: executor.dotColor,
          mode: executor.mode ?? undefined,
          region: executor.region,
        };
        this.state[number] = { type: executor.type, value: executor.value, region: executor.region };
      }
      this.magicqData = { showName: snapshot.showName, executors };
      this.syncLocalButtonHardware();
      this.sendShowSetup();
      for (const [number, value] of Object.entries(this.state)) {
        this.broadcast({ type: "val", data: { number: Number(number), value: value.value } });
      }
      this.broadcast({ type: "magicq-connection", data: { connected: snapshot.connected, source: "windows" } });
  }

  private applyExternalSnapshot(snapshot: WindowsMagicQSnapshot): void {
    const executors: MagicQData["executors"] = {};
    this.state = {};
    for (const [key, executor] of Object.entries(snapshot.executors)) {
      const number = Number(key);
      executors[number] = { number, name: executor.name, type: executor.type, color: executor.color, defaultColor: executor.defaultColor, dotColor: executor.dotColor, mode: executor.mode ?? undefined, region: executor.region };
      this.state[number] = { type: executor.type, value: executor.value, region: executor.region };
    }
    this.magicqData = { showName: snapshot.showName, executors };
    this.syncLocalButtonHardware();
    void this.sendShowSetup();
    for (const [number, value] of Object.entries(this.state)) this.broadcast({ type: "val", data: { number: Number(number), value: value.value } });
  }

  private setupToskLightApiEvents(): void {
    this.toskLightApi.on("connection", (connected: boolean) => { if (this.magicqSource === "tosklight") this.broadcast({ type: "magicq-connection", data: { connected, source: "tosklight" } }); });
    this.toskLightApi.on("warning", (error: Error) => console.warn("[ToskLight API]", error.message));
    this.toskLightApi.on("snapshot", (snapshot: WindowsMagicQSnapshot) => { if (this.magicqSource === "tosklight") this.applyExternalSnapshot(snapshot); });
  }

  private loadSurfaceSource(fallback: "auto" | "self" | "windows" | "tosklight"): "auto" | "self" | "windows" | "tosklight" {
    try {
      const value = JSON.parse(readFileSync(this.sourceSettingsPath, "utf-8"));
      if (value.source === "auto") return "auto";
      // Automatic operation is now the deployment default. Old persisted
      // manual choices must not pin an upgraded Pi to one desk forever.
      if (fallback !== "auto" && (value.source === "self" || value.source === "windows" || value.source === "tosklight")) return value.source;
    } catch { /* First run uses the environment default. */ }
    return fallback;
  }

  private async activateRuntimeSource(source: "self" | "windows" | "tosklight"): Promise<void> {
    if (source === this.magicqSource) return;
    this.releaseHeldPhysicalButtons();
    const previous = this.magicqSource;
    if (previous === "self") {
      if (this.showLoadingInterval) clearInterval(this.showLoadingInterval);
      this.showLoadingInterval = null;
      await Promise.all([Promise.resolve(this.magicqOsc.stop()), this.magicqProgrammer.stop()]);
    }
    if (previous === "tosklight") this.toskLightApi.stop();
    this.magicqSource = source;
    this.magicqData = null;
    this.state = {};
    if (source === "self") { this.magicqOsc.start(); this.startPeriodicShowLoading(); }
    if (source === "tosklight") this.toskLightApi.start();
    if (this.sourceSelection !== "auto") this.activeSurfaceMode = source === "tosklight" ? "tosklight" : "magicq";
    this.broadcast({ type: "source-values", data: { source: this.sourceSelection, activeSource: this.activeSurfaceMode } });
    await this.sendShowSetup();
  }

  private async activateSurfaceSource(source: "auto" | "self" | "windows" | "tosklight"): Promise<void> {
    this.sourceSelection = source;
    writeFileSync(this.sourceSettingsPath, JSON.stringify({ source }, null, 2));
    if (source === "auto") { await this.activateRuntimeSource("windows"); this.windowsMagicq.requestSnapshot(); }
    else await this.activateRuntimeSource(source);
    this.broadcast({ type: "source-values", data: { source: this.sourceSelection, activeSource: this.activeSurfaceMode } });
  }

  /**
   * Sets up event handlers for the MagicQ Programmer service
   */
  private setupMagicQProgrammerEvents(): void {
    this.magicqProgrammer.on("programmerUpdate", (data: ProgrammerData) => {
      console.log("[MagicQ Programmer] Data updated, broadcasting to clients");
      // Broadcast programmer data to all connected clients
      this.broadcast({
        type: "programmer-update",
        data: data,
      });
    });

    this.magicqProgrammer.on("error", (error: Error) => {
      console.error("[MagicQ Programmer] Service error:", error);

      // Broadcast error to clients
      this.broadcast({
        type: "programmer-error",
        data: { error: error.message },
      });
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
      ws.send(JSON.stringify({ type: "layout-values", data: { mode: this.layoutMode } }));
      ws.send(JSON.stringify({ type: "source-values", data: { source: this.sourceSelection, activeSource: this.activeSurfaceMode } }));
      ws.send(JSON.stringify(this.hardwareConnectionMessage()));

      // Programmer data is sent only when explicitly requested

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

        case "get-layout":
          ws.send(JSON.stringify({ type: "layout-values", data: { mode: this.layoutMode } }));
          break;

        case "get-source":
          ws.send(JSON.stringify({ type: "source-values", data: { source: this.sourceSelection, activeSource: this.activeSurfaceMode } }));
          break;

        case "set-source":
          if (message.data?.source !== "auto" && message.data?.source !== "self" && message.data?.source !== "windows" && message.data?.source !== "tosklight") {
            ws.send(JSON.stringify({ type: "error", error: "Surface source must be automatic, self, windows or tosklight." }));
            break;
          }
          await this.activateSurfaceSource(message.data.source);
          break;

        case "set-layout":
          if (message.data?.mode !== "legacy" && message.data?.mode !== "new" && message.data?.mode !== "compact") {
            ws.send(JSON.stringify({ type: "error", error: "Layout mode must be legacy or new." }));
            break;
          }
          this.layoutMode = message.data.mode === "compact" ? "new" : message.data.mode;
          this.saveLayoutMode();
          this.magicqHttp.setLayout(this.layoutMode);
          this.magicqOsc.setLayout(this.layoutMode);
          if (this.magicqSource === "windows") this.windowsMagicq.setLayout(this.layoutMode);
          else await this.handleReloadExecutors();
          this.broadcast({ type: "layout-values", data: { mode: this.layoutMode } });
          break;

        case "get-programmer":
          if (this.magicqSource !== "self") {
            ws.send(JSON.stringify({ type: "programmer-error", data: { error: "Programmer data is unavailable in Windows source mode." } }));
            break;
          }
          this.clientMessageTypes.set(ws, ["programmer-update"]);
          this.magicqProgrammer.requestUpdate();
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
    if (this.magicqSource === "windows") {
      this.windowsMagicq.requestSnapshot();
      return;
    }
    if (this.magicqSource === "tosklight") return;
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
      if (this.magicqSource === "windows") {
        const number = Number(message.address);
        const value = Number(message.value);
        const phase = message.phase === "press" || message.phase === "release" || message.phase === "click" || message.phase === "level"
          ? message.phase
          : "level";
        if (!this.windowsMagicq.sendExecutor(number, value, phase)) ws.send(JSON.stringify({ type: "error", error: "Windows surface API is not connected." }));
        return;
      }
      if (this.magicqSource === "tosklight") {
        const number = Number(message.address), value = Number(message.value);
        const phase = message.phase === "press" || message.phase === "release" || message.phase === "click" || message.phase === "level" ? message.phase : "level";
        if (!await this.toskLightApi.sendExecutor(number, value, phase)) ws.send(JSON.stringify({ type: "error", error: "ToskLight API is not connected." }));
        return;
      }
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
        const inactive = Number(message.data.inactive);
        const active = Number(message.data.active);
        if (!Number.isInteger(inactive) || inactive < 0 || inactive > 255 || !Number.isInteger(active) || active < 0 || active > 255) {
          throw new Error("Brightness values must be integers from 0 through 255.");
        }
        if (this.localHardwareConnected) this.buttonController.setBrightness(inactive, active);
        else if (!this.windowsMagicq.setBrightness(inactive, active)) throw new Error("Neither local nor remote Cueboard hardware is connected.");
        this.brightnessSettings = { inactive, active };
        this.saveBrightnessSettings();
        this.broadcast({ type: "brightness-values", data: this.brightnessSettings });
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
        const updateScript = `/bin/bash '${resolve(__dirname, "../../build.sh").replaceAll("'", "'\\''")}'`;
        const shellCommand = command === "update-software"
          ? `if [ "$(id -un)" = keller ]; then ${updateScript}; else sudo -n -u keller ${updateScript}; fi`
          : systemCommands[command as keyof typeof systemCommands];
        await this.commandExecutor.callCommand(
          shellCommand
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
        const rawColor = data.defaultColor ? "fc8" : data.color || "000";
        const color = rawColor.length === 6 ? `${rawColor[0]}${rawColor[2]}${rawColor[4]}` : rawColor;
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
    } else if ((type === "toggle" || type === "solo") && valueInput > 0) {
      exec.value = lastValue === 0 ? 1 : 0;
      if (type === "solo") exec.value = 1;
    } else if (type === "toggle" || type === "solo") {
      return; // ignore note off for toggle
    } else if (type === "flash" || type === "other") {
      exec.value = valueInput > 0 ? 1 : 0;
    }

    if (execNumber <= 40) {
      console.log(
        "Setting button active (In Button Handler):",
        execNumber - 1,
        exec.value > 0
      );
      this.buttonController.setButtonActive(execNumber - 1, exec.value > 0);
      if (exec.type === "solo") this.previewLocalButton(execNumber, true, true);
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

  private previewLocalButton(number: number, active: boolean, solo = false): void {
    const target = this.state[number];
    if (!target) return;
    if (solo) {
      const region = target.region || 0;
      for (const [key, peer] of Object.entries(this.state)) {
        const peerNumber = Number(key);
        if (peerNumber > 40 || peer.type !== "solo") continue;
        const sameGroup = region ? peer.region === region : Math.floor((peerNumber - 1) / 10) === Math.floor((number - 1) / 10);
        if (sameGroup) { peer.value = peerNumber === number ? 1 : 0; this.buttonController.setButtonActive(peerNumber - 1, peer.value > 0); }
      }
      return;
    }
    target.value = active ? 1 : 0;
    this.buttonController.setButtonActive(number - 1, active);
  }

  private syncLocalButtonHardware(): void {
    if (!this.localHardwareConnected || !this.magicqData || !("executors" in this.magicqData)) return;
    this.updateButtonColors(this.magicqData.executors);
    for (let number = 1; number <= 40; number++) this.buttonController.setButtonActive(number - 1, (this.state[number]?.value || 0) > 0);
  }

  private hardwareConnectionMessage() {
    if (this.localHardwareConnected) return { type: "hardware-connection", data: { status: "connected", transport: "local", detail: "Cueboard connected directly to this display." } };
    if (this.remoteSurfaceConnected && this.remoteHardwareAvailable) return { type: "hardware-connection", data: { status: "connected", transport: "remote", detail: "Cueboard connected through the Windows hardware bridge." } };
    if (this.remoteSurfaceConnected) return { type: "hardware-connection", data: { status: "connecting", transport: null, detail: "Windows bridge connected. Waiting for Cueboard hardware…" } };
    return { type: "hardware-connection", data: { status: "connecting", transport: null, detail: this.localControllerEnabled ? "Looking for the Cueboard on this Pi and connecting to Windows…" : "Connecting to the Windows Cueboard bridge…" } };
  }

  private broadcastHardwareConnection(): void {
    this.broadcast(this.hardwareConnectionMessage());
  }

  private loadLayoutMode(fallback: "legacy" | "new"): "legacy" | "new" {
    try {
      if (existsSync(this.layoutSettingsPath)) {
        const value = JSON.parse(readFileSync(this.layoutSettingsPath, "utf-8"));
        if (value.mode === "legacy" || value.mode === "new") return value.mode;
        if (value.mode === "compact") return "new";
      }
    } catch (error) { console.warn("Cannot load layout settings:", error); }
    return fallback;
  }

  private saveLayoutMode(): void {
    try { writeFileSync(this.layoutSettingsPath, JSON.stringify({ mode: this.layoutMode }, null, 2)); }
    catch (error) { console.error("Cannot save layout settings:", error); }
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
        this.publishSPL(data);
      }
    );
  }

  private publishSPL(data: SPLMeasurement): void {
    this.broadcast({ type: "spl", data });
    for (const publication of splPublications(data)) {
      this.mqttBroker.publish(publication.topic, publication.value, publication.retain);
    }
  }

  public async stop(): Promise<void> {
    console.log("Shutting down WebSocket service...");
    this.releaseHeldPhysicalButtons();
    this.splApi.stop();
    this.mqttBroker.publish("tosklight/spl/availability", "offline", true);

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
      this.magicqSource === "self" ? this.magicqOsc.stop() : Promise.resolve(),
      this.magicqSource === "self" ? this.magicqProgrammer.stop() : Promise.resolve(),
      Promise.resolve(this.buttonController.stop()),
      this.windowsMagicq.stop(),
      this.magicqSource === "tosklight" ? Promise.resolve(this.toskLightApi.stop()) : Promise.resolve(),
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
