cd /home/keller/repos/lightmonitorstrip

echo "Pulling latest changes"
git pull
echo ""
echo ""

echo "Building"
NODE_VERSION=20 /home/keller/.nvm/nvm-exec npm run build

echo ""
echo ""

echo 'Software updated successfully - Please restart the server'
