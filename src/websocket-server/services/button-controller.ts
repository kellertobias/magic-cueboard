import { EventEmitter } from "events";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

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
      this.sendCommand(`C${button.toString().padStart(3, "0")}:${color}`);
    }

    // Send all button states
    for (const [button, state] of this.buttonStates) {
      this.sendCommand(
        `A${button.toString().padStart(3, "0")}:${state ? "1" : "0"}`
      );
    }
  }

  /**
   * Sets the color for a button
   */
  public setButtonColor(button: number, color: string): void {
    if (!this.isConnected) return;
    this.buttonColors.set(button, color);
    this.sendCommand(`C${button.toString().padStart(3, "0")}:${color}`);
  }

  /**
   * Sets the active state for a button
   */
  public setButtonActive(button: number, active: boolean): void {
    if (!this.isConnected) return;
    this.buttonStates.set(button, active);
    this.sendCommand(
      `A${button.toString().padStart(3, "0")}:${active ? "1" : "0"}`
    );
  }

  /**
   * Sets the brightness levels for inactive and active states
   */
  public setBrightness(inactive: number, active: number): void {
    if (!this.isConnected) return;
    this.brightnessInactive = inactive;
    this.brightnessActive = active;
    this.sendCommand(
      `B${inactive.toString(16).padStart(2, "0")}:${active
        .toString(16)
        .padStart(2, "0")}`
    );
  }

  /**
   * Handles incoming messages from the device
   */
  private handleMessage(message: string): void {
    if (message.startsWith("P")) {
      // Button pressed
      const button = parseInt(message.slice(1), 10);
      this.emit("buttonPressed", button);
    } else if (message.startsWith("R")) {
      // Button released
      const button = parseInt(message.slice(1), 10);
      this.emit("buttonReleased", button);
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
    this.port.write(command + "\n");
  }

  /**
   * Returns whether the device is connected
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
