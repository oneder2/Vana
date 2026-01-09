#!/bin/bash
# 创建一个简单的 PNG 图标（使用 ImageMagick 或 fallback 到 base64）
if command -v convert &> /dev/null; then
  convert -size 512x512 xc:'#05040a' icon.png
elif command -v magick &> /dev/null; then
  magick -size 512x512 xc:'#05040a' icon.png
else
  # 创建一个最小的有效 PNG 文件（1x1 像素，黑色）
  echo -ne '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82' > icon.png
fi
