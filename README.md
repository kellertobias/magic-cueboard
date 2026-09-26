# Light Assistant

This tool is used in combination with a MagicQ light control desk to extend the amount of physical buttons on the desk.

It communicates via OSC to MagicQ and uses its HTTP API to update the available executors. It also interfaces with a gm1356 based SPL meter to display a little graph of how much the current DJ destroys your ears.

! This project is written by AI in large parts (as an experiment how far you can push it). That's why the code might not be super clean. The project however is fully functional and has been used to control lights for a few events.

![Project Screenshot](docs/example-render.png)

## Project Layout:

```
light-assistant/
├── hardware/ # Hardware specific code and PCB schematics
├── src/
│ ├── app/ # NextJS frontend code
│ ├── components/ # React components
│ ├── contexts/ # React contexts
│ ├── hooks/ # React hooks
│ ├── mocks/ # Mock implementations of the interfacing systems to test against
│ ├── websocket-server/ # The Server to interface with the external systems
```

## Setup and running the project:

### Setup of Webserver & GUI:

- Run `npm install` to install the dependencies
- If you want to add the SPL meter, you need to install splread from here: https://github.com/pvachon/gm1356/tree/master
- Run `npm run dev` to start the development server(s)

You might want to run this on a raspberry PI and set it up so that it automatically starts when the pi starts and then opens the browser to the local webserver.

### MagicQ Setup

- Enable OSC (tx & rx) in the setup
- Enable the http server in the setup
- Create a grid of 10x10 executors on the MagicQ executor window (! only page 1 is supported)
- Each first line is the actual executor that will be controlled (contains the name of the executor)
- Each second line contains the color of the button in the grid, the type (Flash/ Toggle) and the color of the icon (e.g. `AAA,T,FF0` for a gray toggle button with a yellow icon)

### MagicQ data source

The Raspberry Pi server also accepts the original MagicQ source setting for compatibility:

```bash
# Local MagicQ compatibility: the Pi reads MagicQ directly and discovers its
# attached Cueboard by USB ID.
MAGICQ_SOURCE=self

# Windows mode: the ToskLight Windows hardware bridge owns MagicQ and the USB board.
MAGICQ_SOURCE=windows
WINDOWS_MAGICQ_WS_URL=ws://10.99.0.1:47872/surface
WINDOWS_MAGICQ_TOKEN=tosklight-magicq-feed-v1
```

`auto` is the default. In `windows` mode the Pi keeps serving its local UI, SPL meter, and MQTT data, while executor names, colours, types, and live values come from Windows. The dot colour is inferred from whole colour words in the MagicQ executor name, including Red, Orange, Yellow, Green, Blue, Cyan, CTO, White, Amber, Magenta, Purple, Pink, and UV.

The preferred deployment now uses a selectable surface source:

```bash
# Automatic mode (default): the Windows bridge selects MagicQ whenever it is
# running, otherwise ToskLight, otherwise the waiting screen.
SURFACE_SOURCE=auto

# MagicQ on the Windows show computer. Buttons travel back over the same
# authenticated WebSocket and Windows uses MagicQ Remote (CHWP), not OSC.
SURFACE_SOURCE=windows
WINDOWS_MAGICQ_WS_URL=ws://10.99.0.1:47872/surface
WINDOWS_MAGICQ_TOKEN=tosklight-magicq-feed-v1

# ToskLight on the Windows show computer. The Pi reads page/show metadata
# through its operator session and sends physical Cueboard actions to the bridge.
SURFACE_SOURCE=tosklight
TOSKLIGHT_API_URL=http://10.99.0.1:5000
WINDOWS_MAGICQ_WS_URL=ws://10.99.0.1:47872/surface
```

`MAGICQ_SOURCE=self|windows` remains accepted for existing installations. `SURFACE_SOURCE` takes precedence and supports `auto|self|windows|tosklight`. In automatic mode the Pi can boot before the Windows computer; both the Windows surface connection and the ToskLight API retry after boot, disconnects, and restarts. MagicQ always has priority.

### External SPL meter API

Set `SPL_API_URL` to a JSON endpoint to display a network SPL meter instead of the local `splread` binary. Native `{ "measured": 91.2, "freqMode": "dBA" }`, simple `{ "value": 91.2 }`, and Home Assistant `{ "state": "91.2", "attributes": { "unit_of_measurement": "dBA" } }` responses are accepted. `SPL_API_INTERVAL_MS` controls polling and defaults to 250 ms.

Every reading is also published by the Pi's MQTT broker on port 1883. Existing consumers can continue using retained `spl/value` and `spl/mode`. New consumers should subscribe to retained `tosklight/spl` for the complete JSON measurement, or `tosklight/spl/value`, `tosklight/spl/unit`, `tosklight/spl/timestamp`, and `tosklight/spl/availability` for individual fields. Availability is `online` while readings are being published and changes to `offline` during a clean shutdown.

The executor layout can be changed in the on-screen Settings panel and is persisted across restarts. `EXECUTOR_LAYOUT=legacy|new` selects the initial value on a new installation (`compact` remains accepted as an alias for `new`):

- `legacy`: buttons use MagicQ rows 1, 3, 5, and 7; rows 2, 4, 6, and 8 contain each button's colour/type configuration; the two potentiometers use items 81 and 82.
- `new`: buttons use every row and take their colour, Toggle/Flash/Solo type, region, active state, and fader metadata directly from Execute Page 1. The two potentiometers control the first two fader items on the page.
In both layouts the live Remote grid supplies button text and active state. Legacy mode preserves the existing paired name/configuration rows; New mode gets colour, button type, region and fader properties directly from the selected API or MagicQ Remote metadata.

The Cueboard is attached to the Raspberry Pi. On Linux, Magic Qboard discovers only its Leonardo USB ID `2341:8037`, so the SPL meter or another serial device cannot be mistaken for the board. `BUTTON_CONTROLLER_PORT` can pin a known port if needed. On Windows, local serial discovery stays off unless a port is explicitly set. All physical Cueboard button and fader actions travel from the Pi through the authenticated Windows bridge, which routes them to MagicQ or ToskLight according to its current owner. MagicQ feed and ToskLight API snapshots provide live values and colours to drive the Pi board LEDs. The UI remains visible while the board or Windows reconnects.

### Setup of the Hardware:

- compile the arduino file (either the USB MIDI file or the USB Custom file)
- buy the PCB and solder it together
- upload the compiled arduino file to the microcontroller
- connect it via USB to this project

Alternatively the PCB also supports Hardware MIDI out (not tested yet) or DMX out (tested and works)

when you have flashed the USB Midi version and press the top left button while powering it up, you can select the
colors and brightness of the buttons' backlight. In the USB Custom version, the buttons' backlights are controlled by the server application and the DMX out of the board is disabled. In this mode it only interfaces with this project.

## AI Experiment

This project was an experiment to see how far you could push an AI to write an entire application. It started from an empty folder and the following prompt:

## Debugging

### Sending OSC Messages:

Install https://github.com/yoggy/sendosc

and then

```
sendosc 192.168.42.147 8000 /exec/1/12 f 0.6
```
