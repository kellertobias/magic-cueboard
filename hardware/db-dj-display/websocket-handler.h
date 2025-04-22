#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include <Arduino.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <functional>

// Forward declaration of WebSocket client
extern WebSocketsClient webSocket;

/**
 * @brief Callback function types for different WebSocket events
 */
typedef std::function<void(float value, const char *mode)> SPLCallback;
typedef std::function<void(const char *title, const char *message)> MessageCallback;
typedef std::function<void(bool connected)> ConnectionCallback;

/**
 * @brief Structure to hold all callbacks
 */
struct WebSocketCallbacks
{
    SPLCallback onSplChanged = nullptr;
    MessageCallback onMessageDisplay = nullptr;
    ConnectionCallback onConnectionChanged = nullptr;
};

/**
 * @brief Initializes the WebSocket connection
 * @param server The WebSocket server address
 * @param port The WebSocket server port
 * @param path The WebSocket server path
 * @param callbacks Structure containing optional callbacks for different events
 */
void initWebSocket(const char *server, uint16_t port, const char *path, const WebSocketCallbacks &callbacks);

/**
 * @brief Handles WebSocket events
 * @param type The type of WebSocket event
 * @param payload The received payload
 * @param length The length of the payload
 */
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);

#endif // WEBSOCKET_HANDLER_H