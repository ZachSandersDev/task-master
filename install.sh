#!/bin/sh
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "export PATH=\$PATH:$SCRIPT_DIR" >> ~/.zprofile