#!/bin/bash
# 从 public/VanaIcon.png 生成所有 Tauri 所需的图标文件

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_ICON="$PROJECT_ROOT/public/VanaIcon.png"
ICONS_DIR="$SCRIPT_DIR"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    exit 1
fi

echo "Generating icons from $SOURCE_ICON..."

# 使用 Python PIL 生成所有图标
python3 << EOF
from PIL import Image
import os
import sys

try:
    img = Image.open("$SOURCE_ICON")
    print(f"Source image: {img.size}, mode={img.mode}")
    
    # 确保是 RGBA 模式
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
        print("Converted to RGBA mode")
    
    os.chdir("$ICONS_DIR")
    
    # 生成 PNG 图标
    sizes = [
        (32, 32, '32x32.png'),
        (128, 128, '128x128.png'),
        (256, 256, '128x128@2x.png'),
        (512, 512, 'icon.png')
    ]
    
    for width, height, filename in sizes:
        resized = img.resize((width, height), Image.Resampling.LANCZOS)
        resized.save(filename, 'PNG')
        print(f"Generated {filename}: {resized.size}, mode={resized.mode}")
    
    # 生成 Windows ICO（多尺寸）
    ico_sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]
    ico_images = []
    for size in ico_sizes:
        resized = img.resize(size, Image.Resampling.LANCZOS)
        ico_images.append(resized)
    
    ico_images[0].save('icon.ico', format='ICO', sizes=[(s.width, s.height) for s in ico_images])
    print(f"Generated icon.ico with {len(ico_sizes)} sizes")
    
    # ICNS 占位符（Linux 上无法生成真正的 ICNS，需要 macOS iconutil）
    icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save('icon.icns', format='PNG')
    print("Created icon.icns placeholder (PNG format)")
    print("Note: For macOS builds, proper ICNS should be generated on macOS using:")
    print("  iconutil -c icns icons.iconset")
    
    print("\nAll icons generated successfully!")
    
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()
    sys.exit(1)
EOF

echo ""
echo "Icon generation complete!"
echo "Files generated in: $ICONS_DIR"

