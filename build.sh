#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$repo_dir"

if [[ "$(git rev-parse --show-toplevel)" != "$repo_dir" ]]; then
  echo "Update script must run from the Magic Qboard checkout." >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != main ]]; then
  echo "Update script requires the main branch." >&2
  exit 1
fi

remote_url='https://github.com/kellertobias/magic-cueboard.git'
echo 'Pulling Magic Qboard changes from the public GitHub mirror'
git -c credential.helper= -c core.askPass= -c credential.interactive=never pull --ff-only "$remote_url" main

echo 'Installing locked dependencies'
if [[ -x /home/keller/.nvm/nvm-exec ]]; then
  NODE_VERSION=20 /home/keller/.nvm/nvm-exec npm ci
  echo 'Building Magic Qboard'
  NODE_VERSION=20 /home/keller/.nvm/nvm-exec npm run build
else
  npm ci
  echo 'Building Magic Qboard'
  npm run build
fi

echo 'Software updated successfully. Restart the server to use the new build.'
