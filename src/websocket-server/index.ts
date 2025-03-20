import dotenv from "dotenv";
import { WebSocketService } from "./server";
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
  process.env.BUTTON_CONTROLLER_PORT ||
  ((): string | null => {
    const { readdirSync } = require("fs");
    const devices = readdirSync("/dev");
    const usbDevices = devices
      .filter(
        (device: string) =>
          device.startsWith("cu.usb") ||
          device.startsWith("ttyUSB") ||
          device.startsWith("ttyACM")
      )
      .map((device: string) => `/dev/${device}`);

    if (usbDevices.length === 0) {
      console.warn("No USB devices found in /dev/");
      return null; // Fallback to default
    }

    const usedDevice = usbDevices[0];
    const remainingDevices = usbDevices.slice(1, -1);
    console.log(
      `   Found USB devices:\n   - ${usedDevice} (selected)\n${remainingDevices
        .map((x: string) => `    - ${x}`)
        .join("\n")}`
    );
    return usedDevice;
  })();

// Default brightness values
const DEFAULT_INACTIVE_BRIGHTNESS = 25;
const DEFAULT_ACTIVE_BRIGHTNESS = 40;

// Path to store brightness settings
const BRIGHTNESS_SETTINGS_PATH = join(__dirname, "brightness-settings.json");

// Handle process termination
const wsService = new WebSocketService({
  listenIp: LISTEN_IP,
  magicqIp: MAGICQ_IP,
  magicqHttpPort: MAGICQ_HTTP_PORT,
  magicqOscReceivePort: MAGICQ_OSC_RECEIVE_PORT,
  magicqOscSendPort: MAGICQ_OSC_SEND_PORT,
  buttonControllerPort: BUTTON_CONTROLLER_PORT,
  inactiveBrightness: DEFAULT_INACTIVE_BRIGHTNESS,
  activeBrightness: DEFAULT_ACTIVE_BRIGHTNESS,
  brightnessSettingsPath: BRIGHTNESS_SETTINGS_PATH,
  wsPort: WS_PORT,
});

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
