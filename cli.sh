#!/bin/bash

# Wrapper to run the CLI inside the Docker container
# 1. Determine container name
# If no argument provided, try to find a running container that looks like elo-server
if [ -z "$1" ]; then
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep "elo-server" | head -n 1)
    if [ -z "$CONTAINER_NAME" ]; then
        # Default fallback name if none running
        CONTAINER_NAME="elo-server"
    fi
else
    CONTAINER_NAME=$1
fi

echo "Targeting container: $CONTAINER_NAME..."

# 2. Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
    echo "Error: Container '$CONTAINER_NAME' is not running."
    echo "Tips:"
    echo "  1. Start services:  docker-compose up -d"
    echo "  2. Check status:    docker ps"
    exit 1
fi

# 3. Execute the Python script inside the container
docker exec -it "$CONTAINER_NAME" python src/scripts/cli.py
