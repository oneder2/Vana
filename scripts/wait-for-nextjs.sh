#!/bin/bash
# 等待 Next.js 开发服务器启动
echo "Waiting for Next.js to start..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Next.js is ready!"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "Next.js did not start in time"
exit 1

