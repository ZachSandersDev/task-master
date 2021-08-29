#!/bin/sh
DIRNAME=`dirname "$0"`
deno run --unstable --allow-read --allow-write --allow-run --allow-env $DIRNAME/TaskMaster.ts "$@"