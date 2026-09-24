import dotenv from "dotenv";
import { WebSocketService } from "./server";
import { join } from "node:path";

dotenv.config();

const WS_PORT = Number(process.env.WS_PORT || 3001);
const LISTEN_IP = process.env.LISTEN_IP || "localhost";
const MAGICQ_IP = process.env.MAGICQ_IP || "localhost";
const MAGICQ_HTTP_PORT = Number(process.env.MAGICQ_HTTP_PORT || 8080);
const MAGICQ_OSC_RECEIVE_PORT = Number(
  process.env.MAGICQ_OSC_RECEIVE_PORT || 8000
);
const MAGICQ_OSC_SEND_PORT = Number(process.env.MAGICQ_OSC_SEND_PORT || 9000);
const MAGICQ_SOURCE = process.env.SURFACE_SOURCE || process.env.MAGICQ_SOURCE || "auto";
if (MAGICQ_SOURCE !== "auto" && MAGICQ_SOURCE !== "self" && MAGICQ_SOURCE !== "windows" && MAGICQ_SOURCE !== "tosklight") {
  throw new Error("SURFACE_SOURCE must be auto, self, windows or tosklight");
}
const WINDOWS_MAGICQ_WS_URL = process.env.WINDOWS_MAGICQ_WS_URL || "ws://192.168.42.127:47872/magicq";
const WINDOWS_MAGICQ_TOKEN = process.env.WINDOWS_MAGICQ_TOKEN || "tosklight-magicq-feed-v1";
const TOSKLIGHT_API_URL = process.env.TOSKLIGHT_API_URL || "http://192.168.42.127:5000";
const EXECUTOR_LAYOUT_RAW = process.env.EXECUTOR_LAYOUT || "legacy";
if (EXECUTOR_LAYOUT_RAW !== "legacy" && EXECUTOR_LAYOUT_RAW !== "new" && EXECUTOR_LAYOUT_RAW !== "compact") throw new Error("EXECUTOR_LAYOUT must be legacy or new");
const EXECUTOR_LAYOUT: "legacy" | "new" = EXECUTOR_LAYOUT_RAW === "compact" ? "new" : EXECUTOR_LAYOUT_RAW;
const SPL_API_URL = process.env.SPL_API_URL || null;
const SPL_API_INTERVAL_MS = Number(process.env.SPL_API_INTERVAL_MS || 250);
// Direct serial is opt-in; the Windows bridge owns the Cueboard by default.
const BUTTON_CONTROLLER_PORT = process.env.BUTTON_CONTROLLER_PORT || null;

// Default brightness values
const DEFAULT_INACTIVE_BRIGHTNESS = 25;
const DEFAULT_ACTIVE_BRIGHTNESS = 40;

// Path to store brightness settings
const BRIGHTNESS_SETTINGS_PATH = join(__dirname, "brightness-settings.json");

// MQTT configuration
const MQTT_HOST = process.env.MQTT_HOST || "0.0.0.0";
const MQTT_PORT = Number(process.env.MQTT_PORT || 1883);

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
  mqttHost: MQTT_HOST,
  mqttPort: MQTT_PORT,
  magicqSource: MAGICQ_SOURCE,
  windowsMagicqUrl: WINDOWS_MAGICQ_WS_URL,
  windowsMagicqToken: WINDOWS_MAGICQ_TOKEN,
  toskLightApiUrl: TOSKLIGHT_API_URL,
  layoutMode: EXECUTOR_LAYOUT,
  layoutSettingsPath: join(__dirname, "layout-settings.json"),
  sourceSettingsPath: join(__dirname, "source-settings.json"),
  splApiUrl: SPL_API_URL,
  splApiIntervalMilliseconds: SPL_API_INTERVAL_MS,
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
