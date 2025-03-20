export const systemCommands = {
  "restart-device": "echo 'Rebooting device...' && sleep 1 && sudo reboot",
  "restart-server":
    "echo 'Restarting server...' && sleep 1 && sudo systemctl restart lightstrip.service",
  "update-software":
    "cd /home/keller/repos/lightmonitorstrip && sudo -u keller git pull && sudo -u keller npm run build && echo 'Software updated successfully - Please restart the server'",
  "flash-firmware":
    "cd /home/keller/repos/lightmonitorstrip/hardware/firmware && arduino-cli upload -p /dev/ttyACM0 -b arduino:avr:leonardo .",
};
