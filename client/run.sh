#!/bin/bash
set -e

# Print startup message
echo "Starting nginx server..."

# Run nginx in foreground mode
nginx -g "daemon off;"