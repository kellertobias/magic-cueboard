# SPL and DJ display MQTT contract

Click the SPL display on the Qboard to set separate average and peak thresholds. A reading below **Green begins** is blue; readings at or above the next thresholds are green, yellow, and red. The highest severity from average and peak controls every displayed number. Continuous red changes to `red-blink` after the configured delay. Settings and six message presets are saved in `src/websocket-server/spl-settings.json` on the Qboard host.

The embedded broker publishes retained SPL values and DJ display settings:

| Topic | Value |
| --- | --- |
| `tosklight/spl/color` | `"blue"`, `"green"`, `"yellow"`, `"red"`, or `"red-blink"` |
| `tosklight/spl/level` | Rolling average dB number |
| `tosklight/spl/average` | Same rolling average dB number |
| `tosklight/spl/peak` | Rolling peak dB number |
| `tosklight/dj/message-topic` | Configured topic as plain text |
| `tosklight/dj/preset/1` through `/6` | Configured message labels as plain text, including empty strings |
| `tosklight/dj/display-inbox` | Incoming message for the DJ display as plain text; not retained |

The older `spl/value` topic remains the raw meter reading. The DJ display firmware subscribes to the new state and preset topics. Its **Send message** screen publishes the chosen nonempty preset as plain text on the configured message topic, then returns to SPL. The Qboard has its own six preset slots, initially **You are too loud** and **You are too quiet** and four empty slots, plus a custom message composer with a wider on-screen keyboard on the right, including numbers and punctuation. The six presets form a two-column, three-row grid on the left; empty slots show `[empty]` in gray. The conversation occupies the center and scrolls to the newest message when opened or when a message arrives, while allowing manual scrolling. A short tap sends a preset; holding one for 650 ms saves the current custom message to it. The Pi presets and the last 200 sent and received messages are saved in `src/websocket-server/pi-messages.json`. The conversation shows send and receive times. These Pi presets do not change the DJ display's six configurable presets. The Qboard shows messages published by MQTT clients on the configured topic as toasts and in the conversation. Qboard-originated messages appear as sent messages without a toast. Messages sent by the Qboard or another MQTT client are forwarded to the DJ display inbox, except messages originating from the DJ display itself. An unread message makes the display blink in its current SPL color and shows an envelope with **Click to show message**; tapping it opens the message and stops the blink.

The DJ display firmware is in `hardware/dj-spl-meter/dj-spl-meter.yaml`. It still needs to be compiled and flashed onto the ESP32 display after changing this file.
