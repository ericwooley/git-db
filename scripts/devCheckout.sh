#!/usr/bin/env bash

export DEBUG='git-db:*'
npx ts-node ./src/index.ts checkout "$@"
