# Date, time, and phone chat

Open **Settings → Date and time**, select the date and time, and press **Save**. The selected value starts running when the host applies it. The input is in the browser's displayed time zone; the current clock uses the Qboard host's time zone. Every screen reads the same server clock, refreshed on connection and every 30 seconds.

Connect a phone to the Qboard's network and open `http://<Pi LAN address>:3000/phone`. Connecting or reconnecting automatically uses the phone's current time as the reference. **Sync clock with phone** repeats this explicitly. The phone page works in a mobile browser and uses its native keyboard. No app installation is needed. The Next.js web server and `/ws` proxy must be reachable from the phone; the phone does not need access to port 3001.

Choose **Technician** or **DJ** before sending a chat message. Both appear in the technician's conversation, with the phone sender and recipient shown, and trigger the existing incoming-message notification. Only DJ-addressed phone messages publish to the configured DJ message topic and `tosklight/dj/display-inbox`. Technician messages never publish to MQTT. Existing DJ MQTT clients and Qboard-to-DJ messages retain their existing routing. The shared chat displays the last 200 conversation entries. Sending is confirmed by the server; a disconnect disables sending and preserves the draft.

## Host clock setup

Clock writes run only on the Linux Qboard host. They disable network time with `timedatectl set-ntp false`, set the system clock using `date --set @<Unix seconds>`, and write an available `/dev/rtc0` or `/dev/rtc` using `hwclock --systohc --utc`. A phone reference advances by the command preparation time; a manually chosen value starts at Save. The app service user needs noninteractive sudo permission for these commands, including `timedatectl show --property=NTP --value` and `timedatectl set-ntp true` for restoring network time after a failed update. Configure permissions on the deployed Pi; they are not installed by the application. Linux without an RTC can set system time, but cannot preserve it through power loss independently of network time or another reference.

An error is shown if system time cannot be set. A failed RTC write reports that system time was set but hardware persistence failed. Successful manual or phone setting leaves network time disabled so it cannot override the selected value. To return to network time on the host, run `sudo timedatectl set-ntp true`. The server does not change the host time zone. Set the host time zone through the host's system configuration if needed.

The hardware write follows the documented [`hwclock --systohc` behavior](https://man7.org/linux/man-pages/man8/hwclock.8.html).

This uses the existing trusted local-network connection model; anyone able to connect to the Qboard can use phone chat and time synchronization. No production clock or RTC was changed during development. Automated tests mock privileged clock commands.
