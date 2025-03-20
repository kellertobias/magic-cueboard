export const systemCommands = {
  "restart-device": "sudo reboot",
  "restart-server": "sudo systemctl restart lightstrip.service",
  "update-software":
    "cd /home/keller/repos/lightmonitorstrip && git pull && npm run build && echo 'Software updated successfully - Please restart the server'",
  "flash-firmware":
    "cd /home/keller/repos/lightmonitorstrip/hardware/firmware && arduino-cli upload -p /dev/ttyACM0 -b arduino:avr:leonardo .",
};
