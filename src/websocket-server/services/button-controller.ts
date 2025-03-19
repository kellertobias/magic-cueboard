import { EventEmitter } from "events";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const controllerToServer = new Map<number, number>();
const serverToController = new Map<number, number>();

for (let i = 0; i < 40; i++) {
  if (i < 20) {
    controllerToServer.set(i, (i % 5) + Math.floor(i / 5) * 10 + 1);
  } else if (i < 40) {
    controllerToServer.set(i, (i % 5) + Math.floor((i - 20) / 5) * 10 + 6);
  } else {
    controllerToServer.set(i, i + 1);
  }
}

serverToController.set(1, 1);
serverToController.set(2, 2);
serverToController.set(3, 3);
serverToController.set(4, 4);
serverToController.set(5, 5);
serverToController.set(6, 21);
serverToController.set(7, 22);
serverToController.set(8, 23);
serverToController.set(9, 24);
serverToController.set(10, 25);
serverToController.set(11, 6);
serverToController.set(12, 7);
serverToController.set(13, 8);
serverToController.set(14, 9);
serverToController.set(15, 10);
serverToController.set(16, 26);
serverToController.set(17, 27);
serverToController.set(18, 28);
serverToController.set(19, 29);
serverToController.set(20, 30);
serverToController.set(21, 11);
serverToController.set(22, 12);
serverToController.set(23, 13);
serverToController.set(24, 14);
serverToController.set(25, 15);
serverToController.set(26, 31);
serverToController.set(27, 32);
serverToController.set(28, 33);
serverToController.set(29, 34);
serverToController.set(30, 35);
serverToController.set(31, 16);
serverToController.set(32, 17);
serverToController.set(33, 18);
serverToController.set(34, 19);
serverToController.set(35, 20);
serverToController.set(36, 36);
serverToController.set(37, 37);
serverToController.set(38, 38);
serverToController.set(39, 39);
serverToController.set(40, 40);

/**
 * Service for handling communication with the button controller
 * Protocol:
 * Host to Device:
 * - Cxxx:rgb - Set color for button xxx (000-999) to rgb (hex)
 * - Axxx:1/0 - Set button xxx active/inactive
 * - Bii:aa   - Set brightness (ii=inactive, aa=active) in hex
 * - X        - Host connected signal
 *
 * Device to Host:
 * - Pxxx     - Button pressed (xxx=000-999)
 * - Rxxx     - Button released
 * - Vxx:yy   - Potentiometer value (xx=00-99, yy=hex value)
 */
export class ButtonControllerService extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private isConnected = false;
  private buttonColors: Map<number, string> = new Map();
  private buttonStates: Map<number, boolean> = new Map();
  private brightnessInactive = 25;
  private brightnessActive = 40;

  constructor(private portPath: string) {
    super();
  }

  /**
   * Starts the serial connection to the button controller
   */
  public start(): void {
    if (this.port) {
      console.warn("Button controller already connected");
      return;
    }

    this.port = new SerialPort({
      path: this.portPath,
      baudRate: 115200,
    });

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

    this.port.on("open", () => {
      console.log("Connected to button controller");
      this.isConnected = true;
      this.emit("connected");
      this.initializeDevice();
    });

    this.port.on("error", (err: Error) => {
      console.error("Button controller error:", err);
      this.isConnected = false;
      this.emit("disconnected");
    });

    this.port.on("close", () => {
      console.log("Button controller disconnected");
      this.isConnected = false;
      this.emit("disconnected");
    });

    this.parser.on("data", (line: string) => {
      this.handleMessage(line);
    });
  }

  /**
   * Stops the serial connection
   */
  public stop(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
      this.parser = null;
      this.isConnected = false;
      this.emit("disconnected");
    }
  }

  /**
   * Initializes the device with current state
   */
  private initializeDevice(): void {
    if (!this.isConnected) return;

    // Send connection signal
    this.sendCommand("X");

    // Set brightness levels
    this.sendCommand(
      `B${this.brightnessInactive
        .toString(16)
        .padStart(2, "0")}:${this.brightnessActive
        .toString(16)
        .padStart(2, "0")}`
    );

    // Send all button colors
    for (const [button, color] of this.buttonColors) {
      this.sendCommand(
        `C${this.externalToInternalButton(button)
          .toString()
          .padStart(3, "0")}:${color}`
      );
    }

    // Send all button states
    for (const [button, state] of this.buttonStates) {
      this.sendCommand(
        `A${this.externalToInternalButton(button)
          .toString()
          .padStart(3, "0")}:${state ? "1" : "0"}`
      );
    }
  }

  /**
   * Sets the color for a button
   */
  public setButtonColor(button: number, color: string): void {
    if (!this.isConnected) return;
    this.buttonColors.set(button, color);
    this.sendCommand(
      `C${this.externalToInternalButton(button)
        .toString()
        .padStart(3, "0")}:${color}`
    );
  }

  /**
   * Sets the active state for a button
   */
  public setButtonActive(button: number, active: boolean): void {
    if (!this.isConnected) return;
    this.buttonStates.set(button, active);
    this.sendCommand(
      `A${this.externalToInternalButton(button).toString().padStart(3, "0")}:${
        active ? "1" : "0"
      }`
    );
  }

  /**
   * Sets the brightness levels for inactive and active states
   */
  private lastBrightnessUpdate = 0;
  private pendingBrightness: { inactive: number; active: number } | null = null;
  private readonly BRIGHTNESS_THROTTLE_MS = 500; // 500ms = max 2 calls per second

  /**
   * Sets the brightness levels for inactive and active states
   * Rate limited to max 2 calls per second, will use most recent values
   */
  public setBrightness(inactive: number, active: number): void {
    if (!this.isConnected) return;

    const now = Date.now();
    this.pendingBrightness = { inactive, active };

    if (now - this.lastBrightnessUpdate >= this.BRIGHTNESS_THROTTLE_MS) {
      // Enough time has passed, update immediately
      this.updateBrightness();
    } else if (!this.pendingBrightness) {
      // Schedule update for when throttle period ends
      setTimeout(() => {
        this.updateBrightness();
      }, this.BRIGHTNESS_THROTTLE_MS - (now - this.lastBrightnessUpdate));
    }
  }

  /**
   * Actually sends the brightness update command with the most recent values
   */
  private updateBrightness(): void {
    if (!this.pendingBrightness) return;

    const { inactive, active } = this.pendingBrightness;
    this.brightnessInactive = inactive;
    this.brightnessActive = active;
    this.sendCommand(
      `B${inactive.toString(16).padStart(2, "0")}:${active
        .toString(16)
        .padStart(2, "0")}`
    );

    this.lastBrightnessUpdate = Date.now();
    this.pendingBrightness = null;
  }

  /**
   * Handles incoming messages from the device
   */
  private handleMessage(message: string): void {
    console.log("Received message:", message);
    if (message.startsWith("P")) {
      // Button pressed
      const button = parseInt(message.slice(1), 10);
      this.emit("buttonPressed", this.internalToExternalButton(button));
    } else if (message.startsWith("R")) {
      // Button released
      const button = parseInt(message.slice(1), 10);
      this.emit("buttonReleased", this.internalToExternalButton(button));
    } else if (message.startsWith("V")) {
      // Potentiometer value
      const [pot, value] = message.slice(1).split(":");
      const potNumber = parseInt(pot, 10);
      const potValue = parseInt(value, 16);
      this.emit("potValue", potNumber, potValue);
    }
  }

  /**
   * Sends a command to the device
   */
  private sendCommand(command: string): void {
    if (!this.isConnected || !this.port) return;
    console.log("Sending command:", command);
    this.port.write(command + "\n");
  }

  /**
   * Returns whether the device is connected
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Converts internal button numbers (0-39) to external button numbers (1-40)
   * Internal numbers are arranged in 5x8 grid, external in 10x4 grid
   */
  private internalToExternalButton(button: number): number {
    return controllerToServer.get(button)!;
  }

  /**
   * Converts external button numbers (1-40) to internal button numbers (0-39)
   * External numbers are arranged in 10x4 grid, internal in 5x8 grid
   */
  private externalToInternalButton(button: number): number {
    console.log("External to internal button:", button);
    return serverToController.get(button + 1)! - 1;
  }
}
