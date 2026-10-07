#!/usr/bin/env sh
# Runs `firebase emulators:*` with the Functions emulator in one shared worker
# on developer machines: the default starts a ~180 MB Node process per
# function (~6 GB for test:functions), which the 7 GB workstation cannot hold.
# CI keeps the default per-function workers: there is memory for them, and a
# trigger that resets its worker cannot fail other functions' requests there.
set -e
if [ "${CI:-}" = "true" ]; then
  exec firebase "$@"
fi
exec firebase "$@" --inspect-functions 9229
