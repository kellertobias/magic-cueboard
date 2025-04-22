#include "credentials.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>

// Display configuration
#define TFT_WIDTH 480
#define TFT_HEIGHT 480
#define TFT_CS 39
#define TFT_DC 18
#define TFT_RST -1
#define TFT_BL 38
#define TFT_SCK 36
#define TFT_MOSI 35
#define TFT_MISO -1 // Not used for this display

/* More Arduino_GFX initialization */
Arduino_DataBus *bus = new Arduino_ESP32SPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_MISO);
Arduino_GFX *gfx = new Arduino_ST7701_RGBPanel(
    bus, TFT_RST, 0 /* rotation */,
    true /* IPS */, TFT_WIDTH, TFT_HEIGHT,
    0 /* hsync_polarity */, 8 /* hsync_front_porch */, 4 /* hsync_pulse_width */, 8 /* hsync_back_porch */,
    0 /* vsync_polarity */, 8 /* vsync_front_porch */, 4 /* vsync_pulse_width */, 8 /* vsync_back_porch */,
    16 /* pclk_active_neg */, 16000000 /* prefer_speed */, true /* auto_flush */
);

// Color definitions
#define COLOR_BLACK 0x0000
#define COLOR_RED 0xF800
#define COLOR_WHITE 0xFFFF

// WebSocket client instance
WebSocketsClient webSocket;

// JSON buffer
StaticJsonDocument<256> doc;

/**
 * @brief Set the display backlight brightness
 * @param brightness Brightness value (0-255)
 */
void setBacklight(uint8_t brightness)
{
    // Use digitalWrite since the pin doesn't support PWM
    digitalWrite(TFT_BL, brightness > 0 ? LOW : HIGH);
}

/**
 * @brief Initialize the display
 * @return true if successful, false otherwise
 */
bool initDisplay()
{
    Serial.println("Initializing display...");

    // Initialize backlight first
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);
    delay(100); // Give the backlight time to stabilize

    Serial.println("Initializing display bus and panel...");

    // Initialize the display
    if (!gfx->begin())
    {
        Serial.println("Display initialization failed!");
        return false;
    }
    Serial.println("Display initialized successfully");

    // Basic display test
    Serial.println("Testing display...");
    gfx->fillScreen(COLOR_BLACK);
    Serial.println("Black screen drawn");
    delay(100);
    gfx->fillScreen(COLOR_RED);
    Serial.println("Red screen drawn");
    delay(100);
    gfx->fillScreen(COLOR_BLACK);
    Serial.println("Black screen drawn again");

    // Set text properties
    Serial.println("Setting text properties...");
    gfx->setTextColor(COLOR_WHITE);
    gfx->setTextSize(2);

    Serial.println("Display setup complete");
    return true;
}

/**
 * @brief Update the SPL value on the display
 * @param value The SPL value to display
 */
void updateSPLDisplay(float value)
{
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "SPL: %.1f dB", value);

    // Clear previous text
    gfx->fillScreen(COLOR_BLACK);

    // Calculate text position for center
    int16_t x = TFT_WIDTH / 2;
    int16_t y = TFT_HEIGHT / 2;

    // Draw new text centered
    gfx->setTextColor(COLOR_WHITE);
    int16_t x1, y1;
    uint16_t w, h;
    gfx->getTextBounds(buffer, 0, 0, &x1, &y1, &w, &h);
    gfx->setCursor(x - w / 2, y - h / 2);
    gfx->print(buffer);
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
    DeserializationError error;
    float measured;

    switch (type)
    {
    case WStype_DISCONNECTED:
        Serial.println("WebSocket Disconnected!");
        break;
    case WStype_CONNECTED:
        Serial.println("WebSocket Connected!");
        // Request to only receive SPL messages
        if (webSocket.sendTXT("{\"type\":\"only\",\"types\":[\"spl\"]}"))
        {
            Serial.println("Filter request sent");
        }
        else
        {
            Serial.println("Failed to send filter request");
        }
        break;
    case WStype_TEXT:
        if (length == 0)
        {
            Serial.println("Received empty message");
            return;
        }

        // Parse JSON message
        error = deserializeJson(doc, payload, length);

        if (error)
        {
            Serial.print("JSON parsing failed: ");
            Serial.println(error.c_str());
            return;
        }

        // Check if message is of type "spl"
        if (doc["type"] == "spl" && doc["data"].containsKey("measured"))
        {
            measured = doc["data"]["measured"];
            Serial.print("SPL Value: ");
            Serial.println(measured);
            updateSPLDisplay(measured);
        }
        break;
    case WStype_ERROR:
        Serial.println("WebSocket Error!");
        break;
    case WStype_BIN:
        Serial.println("Received binary data (ignored)");
        break;
    case WStype_FRAGMENT_TEXT_START:
    case WStype_FRAGMENT_BIN_START:
    case WStype_FRAGMENT:
    case WStype_FRAGMENT_FIN:
        Serial.println("Received fragmented data (ignored)");
        break;
    }
}

void setup()
{
    // Initialize Serial
    Serial.begin(SERIAL_BAUD_RATE);
    delay(1000); // Give time for Serial to initialize
    Serial.println("Starting Guition480 ESP32-S3...");
    Serial.println("Free heap: " + String(ESP.getFreeHeap()));

    // Initialize display
    if (!initDisplay())
    {
        Serial.println("Display initialization failed. Halting.");
        while (1)
        {
            digitalWrite(TFT_BL, HIGH); // Turn off backlight
            delay(500);
            digitalWrite(TFT_BL, LOW); // Turn on backlight
            delay(500);
        }
    }

    // Show initial text
    const char *initialText = "Waiting for SPL...";
    int16_t x1, y1;
    uint16_t w, h;
    gfx->getTextBounds(initialText, 0, 0, &x1, &y1, &w, &h);
    gfx->setCursor(TFT_WIDTH / 2 - w / 2, TFT_HEIGHT / 2 - h / 2);
    gfx->print(initialText);
    Serial.println("Initial text drawn");

    // Configure WiFi with static IP
    WiFi.config(localIP, gateway, subnet);

    // Connect to WiFi
    Serial.print("Connecting to WiFi...");
    WiFi.begin(ssid, password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20)
    {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("\nFailed to connect to WiFi. Halting.");
        gfx->drawString("WiFi Failed", TFT_WIDTH / 2, TFT_HEIGHT / 2);
        while (1)
        {
            delay(1000);
        }
    }

    Serial.println("\nWiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    // Configure WebSocket client
    webSocket.begin(WEBSOCKET_SERVER, WEBSOCKET_PORT, WEBSOCKET_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000); // Try to reconnect every 5 seconds
}

void loop()
{
    // Handle WebSocket
    webSocket.loop();
}