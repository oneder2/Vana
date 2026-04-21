#!/bin/bash
# 等待本地前端开发服务器启动
echo "Waiting for frontend dev server to start..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Frontend dev server is ready!"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "Frontend dev server did not start in time"
exit 1
