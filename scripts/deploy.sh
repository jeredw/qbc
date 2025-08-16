#!/bin/bash
read -p "stop dev server" ok
npm run build
read -p "push?" ok
if [ "$ok" = "y" ]; then
(cp -a www/* ~/qbasic-run/public &&
  cd ~/qbasic-run &&
  git add . &&
  git commit -m "deploy" &&
  git push &&
  npx wrangler deploy)
fi