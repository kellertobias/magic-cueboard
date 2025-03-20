export const systemCommands = {
  "restart-device": "sudo reboot",
  "restart-server": "sudo systemctl restart lightstrip.service",
  "update-software":
    "cd /home/keller/repos/lightstrip && git pull && npm run build && echo 'Software updated successfully - Please restart the server'",
};
