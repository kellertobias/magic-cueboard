#include "websocket-handler.h"
#include "credentials.h"

// Global WebSocket client instance
WebSocketsClient webSocket;

// JSON buffer for parsing messages
StaticJsonDocument<256> doc;

// Callback structure
static WebSocketCallbacks callbacks;

void initWebSocket(const char *server, uint16_t port, const char *path, const WebSocketCallbacks &cb)
{
    callbacks = cb;

    // Configure WebSocket client
    webSocket.begin(server, port, path);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000); // Try to reconnect every 5 seconds
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
    DeserializationError error;
    float measured;
    const char *mode;

    switch (type)
    {
    case WStype_DISCONNECTED:
        Serial.println("WebSocket Disconnected!");
        if (callbacks.onConnectionChanged)
        {
            callbacks.onConnectionChanged(false);
        }
        break;

    case WStype_CONNECTED:
        Serial.println("WebSocket Connected!");
        if (callbacks.onConnectionChanged)
        {
            callbacks.onConnectionChanged(true);
        }
        // Request to receive SPL and SMS messages
        if (webSocket.sendTXT("{\"type\":\"only\",\"types\":[\"spl\",\"sms\"]}"))
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

        // Handle different message types
        if (doc["type"] == "spl" && doc["data"].containsKey("measured"))
        {
            measured = doc["data"]["measured"];
            mode = doc["data"]["freqMode"] | "dbA"; // Default to dbA if not specified

            if (callbacks.onSplChanged)
            {
                callbacks.onSplChanged(measured, mode);
            }
        }
        else if (doc["type"] == "sms" && doc["data"].containsKey("message") && doc["data"].containsKey("title"))
        {
            const char *title = doc["data"]["title"];
            const char *message = doc["data"]["message"];

            if (callbacks.onMessageDisplay)
            {
                callbacks.onMessageDisplay(title, message);
            }
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