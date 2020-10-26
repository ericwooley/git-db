#!/usr/bin/env bash

export DEBUG='git-db:*'
rm -rf .db/ &&
  docker-compose down &&
  docker-compose up -d &&
  sleep 5 &&
  npm run initDb &&
  npx ts-node ./src/index.ts commit dev "$@"
