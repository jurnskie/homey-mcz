#!/bin/bash
set -e

echo "Building Docker image (without host network)..."
docker build -t mcz-bridge:latest .

echo "Stopping any existing container..."
docker-compose down 2>/dev/null || true

echo "Starting service with host network mode..."
docker-compose up -d

echo "Waiting for service to start..."
sleep 3

echo "Checking logs..."
docker-compose logs --tail=20

echo ""
echo "Bridge service deployed!"
echo "Test with: curl http://10.0.0.39:3000/health"
