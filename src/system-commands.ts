export const systemCommands = {
  "restart-device": "echo 'Rebooting device...' && sleep 1 && sudo reboot",
  "restart-server":
    "echo 'Restarting server...' && sleep 1 && sudo systemctl restart lightstrip.service",
  "update-software":
    "sudo -u keller /bin/bash /home/keller/repos/lightmonitorstrip/build.sh",
  "flash-firmware":
    "cd /home/keller/repos/lightmonitorstrip/hardware/firmware && arduino-cli upload -p /dev/ttyACM0 -b arduino:avr:leonardo .",
};
