#!/bin/bash
if [ -z "$1" ] || [ "$1" == "parser" ]; then
  deno run --allow-write --allow-read --allow-run ./scripts/TestParser.ts test/**/*.bas
fi
if [ -z "$1" ] || [ "$1" == "interpreter" ]; then
  deno run --allow-write --allow-read --allow-run ./scripts/TestInterpreter.ts test/semantic/*.bas
fi