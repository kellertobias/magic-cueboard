/**
 * Light Assistant - Button Controller Firmware
 *
 * This firmware implements a 40-button controller with RGB LED feedback.
 * Features:
 * - 40 RGB LED backlit buttons in a matrix layout (8x5)
 * - Three button states: inactive, active, pressed
 * - Serial communication with host
 * - Configurable brightness levels
 * - Support for multiple simultaneous button presses
 * - 2 potentiometers for continuous control
 *
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

#include <Adafruit_NeoPixel.h>

// Hardware Configuration
#define LED_PIN 2          // Pin for WS2812b LEDs
#define NUM_LEDS 40        // Number of LEDs
#define NUM_BTNS 40        // Number of buttons
#define DEBOUNCE_DELAY 10  // Debounce delay in milliseconds
#define BLINK_INTERVAL 500 // Status LED blink interval in ms

// Matrix Configuration
// The button matrix uses 8 columns and 5 rows for a total of 40 buttons
// This is physically arranged as two 5x4 matrices side by side
const uint8_t colPins[8] = {10, 16, 14, 15, A0, A1, 8, 9}; // Column pins
const uint8_t rowPins[5] = {3, 4, 5, 6, 7};                // Row pins

// LED Mapping
// Maps logical button positions to physical LED positions on the WS2812B strip
// The strip is wired in a serpentine pattern, so this mapping ensures the LEDs
// light up in the correct positions relative to the buttons
const uint8_t ledMap[40] = {
    39, 38, 37, 36, 35, // First row
    34, 33, 32, 31, 30, // Second row
    29, 28, 27, 26, 25, // Third row
    24, 23, 22, 21, 20, // Fourth row
    4, 3, 2, 1, 0,      // Fifth row
    9, 8, 7, 6, 5,      // Sixth row
    14, 13, 12, 11, 10, // Seventh row
    19, 18, 17, 16, 15  // Eighth row
};

// Button Matrix Mapping
// Maps physical button positions in the matrix to logical button numbers
// This allows the buttons to be wired in any order while maintaining
// consistent button numbering for the host
const uint8_t btnMap[8][5] = {
    {0, 1, 2, 3, 4},      // Row 1
    {5, 6, 7, 8, 9},      // Row 2
    {10, 11, 12, 13, 14}, // Row 3
    {15, 16, 17, 18, 19}, // Row 4
    {39, 38, 37, 36, 35}, // Row 5
    {34, 33, 32, 31, 30}, // Row 6
    {29, 28, 27, 26, 25}, // Row 7
    {24, 23, 22, 21, 20}  // Row 8
};

// Potentiometer Configuration
#define POT1_PIN A2    // First potentiometer
#define POT2_PIN A3    // Second potentiometer
#define POT_DEADZONE 5 // Deadzone for potentiometer changes to reduce noise

// Global Objects and Variables
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800); // LED strip object
bool buttonStates[40] = {false};                                  // Current physical state of each button
bool buttonActive[40] = {false};                                  // Whether each button is in active state
uint32_t buttonColors[40] = {0};                                  // Current color for each button

// Brightness levels for different button states
uint8_t brightnessInactive = 25;       // Brightness for inactive buttons
uint8_t brightnessActive = 40;         // Brightness for active buttons
const uint8_t brightnessPressed = 255; // Brightness for pressed buttons (always full)

// Connection status and LED blinking
bool hostConnected = false;      // Whether the host is connected
unsigned long lastBlinkTime = 0; // Last time the status LED blinked
bool blinkState = false;         // Current state of the status LED

// Serial communication buffer
char serialBuffer[10];   // Buffer for incoming serial commands
uint8_t bufferIndex = 0; // Current position in the buffer

// Potentiometer tracking
uint16_t lastPotValues[2] = {0, 0};   // Last read raw potentiometer values
uint8_t lastScaledValues[2] = {0, 0}; // Last sent scaled values (0-255)

/**
 * Initial setup of the controller
 * - Initializes LED strip
 * - Configures pin modes for button matrix
 * - Sets up serial communication
 * - Initializes all LEDs to off
 */
void setup()
{
    // Setup LEDs
    strip.begin();
    strip.setBrightness(255);
    strip.show();

    // Setup matrix pins
    for (uint8_t i = 0; i < 5; i++)
    {
        pinMode(rowPins[i], OUTPUT);
        digitalWrite(rowPins[i], LOW);
    }
    for (uint8_t i = 0; i < 8; i++)
    {
        pinMode(colPins[i], INPUT);
    }

    // Initialize serial communication
    Serial.begin(115200);

    // Set all LEDs to off
    for (int i = 0; i < NUM_LEDS; i++)
    {
        strip.setPixelColor(i, 0);
    }
    strip.show();
}

/**
 * Main program loop
 * - Handles connection status LED blinking
 * - Processes incoming serial commands
 * - Scans button matrix for changes
 * - Scans potentiometers for changes
 */
void loop()
{
    // Handle connection status LED
    if (!hostConnected)
    {
        unsigned long now = millis();
        if (now - lastBlinkTime >= BLINK_INTERVAL)
        {
            blinkState = !blinkState;
            strip.setPixelColor(ledMap[0], blinkState ? strip.Color(255, 0, 0) : 0);
            strip.show();
            lastBlinkTime = now;
        }
    }

    // Process serial commands
    while (Serial.available() > 0)
    {
        char c = Serial.read();
        if (c == '\n')
        {
            serialBuffer[bufferIndex] = '\0';
            processCommand(serialBuffer);
            bufferIndex = 0;
        }
        else if (bufferIndex < 9)
        {
            serialBuffer[bufferIndex++] = c;
        }
    }

    // Scan button matrix
    scanButtons();

    // Scan potentiometers
    scanPotentiometers();

    // Small delay to reduce noise
    delay(DEBOUNCE_DELAY);
}

/**
 * Process incoming serial commands from the host
 * Commands:
 * - Cxxx:rgb - Set color for button xxx (000-999) to rgb (hex)
 * - Axxx:1/0 - Set button xxx active/inactive
 * - Bii:aa   - Set brightness (ii=inactive, aa=active) in hex
 * - X        - Host connected signal
 */
void processCommand(char *cmd)
{
    if (cmd[0] == 'X')
    {
        hostConnected = true;
        strip.setPixelColor(ledMap[4], 0);
        strip.show();
        return;
    }

    if (cmd[0] == 'C' && strlen(cmd) == 8)
    {
        // Color command (Cxxx:rgb)
        char numStr[4] = {cmd[1], cmd[2], cmd[3], '\0'};
        int button = atoi(numStr);
        if (button >= 0 && button < NUM_LEDS)
        {
            uint32_t color = parseColor(cmd + 5);
            buttonColors[button] = color;
            updateButtonLED(button);
        }
    }
    else if (cmd[0] == 'A' && strlen(cmd) == 6)
    {
        // Active state command (Axxx:1/0)
        char numStr[4] = {cmd[1], cmd[2], cmd[3], '\0'};
        int button = atoi(numStr);
        if (button >= 0 && button < NUM_LEDS)
        {
            buttonActive[button] = (cmd[5] == '1');
            updateButtonLED(button);
        }
    }
    else if (cmd[0] == 'B' && strlen(cmd) == 6)
    {
        // Brightness command (Bii:aa)
        brightnessInactive = parseHex(cmd + 1);
        brightnessActive = parseHex(cmd + 4);
        updateAllLEDs();
    }
}

/**
 * Parse a 3-digit hex color (RGB)
 * Each digit represents a color component (0-F)
 * Returns a 32-bit color value for the LED strip
 */
uint32_t parseColor(const char *hex)
{
    uint8_t r = parseHexDigit(hex[0]) * 17;
    uint8_t g = parseHexDigit(hex[1]) * 17;
    uint8_t b = parseHexDigit(hex[2]) * 17;
    return strip.Color(r, g, b);
}

/**
 * Parse a 2-digit hex number
 * Returns a byte value (0-255)
 */
uint8_t parseHex(const char *hex)
{
    return (parseHexDigit(hex[0]) << 4) | parseHexDigit(hex[1]);
}

/**
 * Convert a hex digit to its numeric value
 * Handles both uppercase and lowercase hex digits
 */
uint8_t parseHexDigit(char hex)
{
    if (hex >= '0' && hex <= '9')
        return hex - '0';
    if (hex >= 'a' && hex <= 'f')
        return hex - 'a' + 10;
    if (hex >= 'A' && hex <= 'F')
        return hex - 'A' + 10;
    return 0;
}

/**
 * Update the LED for a specific button
 * Handles three states:
 * 1. Pressed: White at full brightness
 * 2. Active: Assigned color at active brightness
 * 3. Inactive: Assigned color at inactive brightness
 */
void updateButtonLED(uint8_t button)
{
    if (buttonStates[button])
    {
        // Button is pressed - show white at max brightness
        strip.setPixelColor(ledMap[button], strip.Color(255, 255, 255));
    }
    else
    {
        // Button is not pressed - show assigned color at appropriate brightness
        uint32_t color = buttonColors[button];
        uint8_t brightness = buttonActive[button] ? brightnessActive : brightnessInactive;

        uint8_t r = ((color >> 16) & 0xFF) * brightness / 255;
        uint8_t g = ((color >> 8) & 0xFF) * brightness / 255;
        uint8_t b = (color & 0xFF) * brightness / 255;

        strip.setPixelColor(ledMap[button], strip.Color(r, g, b));
    }
    strip.show();
}

/**
 * Update all LEDs
 * Called when brightness levels change
 */
void updateAllLEDs()
{
    for (uint8_t i = 0; i < NUM_LEDS; i++)
    {
        updateButtonLED(i);
    }
}

/**
 * Scan the button matrix for changes
 * Uses row-column scanning to detect button presses
 * Sends button state changes to the host
 */
void scanButtons()
{
    for (uint8_t row = 0; row < 5; row++)
    {
        digitalWrite(rowPins[row], HIGH);
        delayMicroseconds(10);

        for (uint8_t col = 0; col < 8; col++)
        {
            bool currentState = digitalRead(colPins[col]);
            int button = btnMap[col][row];

            if (currentState != buttonStates[button])
            {
                buttonStates[button] = currentState;
                updateButtonLED(button);

                // Send button state to host (Pxxx or Rxxx)
                Serial.print(currentState ? "P" : "R");
                if (button < 100)
                    Serial.print("0");
                if (button < 10)
                    Serial.print("0");
                Serial.println(button);
            }
        }
        digitalWrite(rowPins[row], LOW);
    }
}

/**
 * Scan potentiometers for changes
 * Sends potentiometer values to host only when the scaled byte value changes
 * Uses a deadzone to reduce noise
 * Values are scaled from 0-1023 to 0-255
 */
void scanPotentiometers()
{
    uint16_t potValues[2] = {analogRead(POT1_PIN), analogRead(POT2_PIN)};

    for (uint8_t i = 0; i < 2; i++)
    {
        // Scale to 0-255
        uint8_t scaledValue = map(potValues[i], 0, 1023, 0, 255);

        // Only send if the scaled value has changed
        if (scaledValue != lastScaledValues[i])
        {
            lastScaledValues[i] = scaledValue;
            lastPotValues[i] = potValues[i];

            // Send potentiometer value to host (format: Vxx:yy where xx is pot number, yy is hex value)
            Serial.print("V");
            if (i < 10)
                Serial.print("0");
            Serial.print(i);
            Serial.print(":");
            if (scaledValue < 16)
                Serial.print("0");
            Serial.println(String(scaledValue, HEX));
        }
    }
}