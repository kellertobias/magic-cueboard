#include <Arduino.h>
#include "credentials.h"
#include "wifi-connection.h"
#include "websocket-handler.h"

// Callback functions for WebSocket events
void handleSplChanged(float value, const char *mode)
{
    Serial.print("SPL changed: ");
    Serial.print(value);
    Serial.print(" ");
    Serial.println(mode);
    // Add your SPL handling code here
}

void handleMessageDisplay(const char *title, const char *message)
{
    Serial.print("SMS Message - Title: ");
    Serial.print(title);
    Serial.print(", Message: ");
    Serial.println(message);
    // Add your message display handling code here
}

void handleConnectionChanged(bool connected)
{
    Serial.print("Connection state changed: ");
    Serial.println(connected ? "connected" : "disconnected");
    // Add your connection state handling code here
}

// Initialize WebSocket with callbacks
WebSocketCallbacks wsCallbacks = {
    .onSplChanged = handleSplChanged,
    .onMessageDisplay = handleMessageDisplay,
    .onConnectionChanged = handleConnectionChanged};

void connectNetwork(bool waitReconnect)
{
    // Check WiFi connection status and reconnect if necessary
    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("No WiFi connection. Attempting to connect...");
        if (connectToWiFi())
        {
            initWebSocket(WEBSOCKET_SERVER, WEBSOCKET_PORT, WEBSOCKET_PATH, wsCallbacks);
        }
        else if (waitReconnect)
        {
            Serial.println("WiFi reconnection failed. Will retry in next loop iteration.");
            delay(WIFI_RECONNECT_DELAY);
        }
    }
}

void setup()
{
    // Initialize Serial
    Serial.begin(SERIAL_BAUD_RATE);
    delay(1000); // Give time for Serial to initialize
    Serial.println("Starting Guition480 ESP32-S3...");
    Serial.println("Free heap: " + String(ESP.getFreeHeap()));

    // Configure WiFi with static IP
    WiFi.config(LOCAL_IP, GATEWAY_IP, SUBNET_MASK);

    connectNetwork(false);
}

void loop()
{
    connectNetwork(true);
    // Handle WebSocket
    webSocket.loop();
}