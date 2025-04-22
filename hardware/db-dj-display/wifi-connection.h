#include "credentials.h"
#include <Arduino.h>
#include <WiFi.h>

#ifndef WIFI_CONNECTION_H
#define WIFI_CONNECTION_H

// WiFi connection parameters
const int MAX_WIFI_RECONNECT_ATTEMPTS = 20;
const int WIFI_RECONNECT_DELAY = 5000; // 5 seconds between reconnection attempts

/**
 * Attempts to connect to WiFi with the given credentials
 * @return true if connection successful, false otherwise
 */
bool connectToWiFi()
{
    Serial.print("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < MAX_WIFI_RECONNECT_ATTEMPTS)
    {
        delay(250);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("\nFailed to connect to WiFi.");
        return false;
    }

    Serial.println("\nWiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    return true;
}

#endif // WIFI_CONNECTION_H