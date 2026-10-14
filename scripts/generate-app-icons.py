#!/usr/bin/env python3
"""Export desktop and Android launcher assets from the reviewed Vana mark.

Requires Pillow. Android uses a 108 dp transparent foreground over an opaque
background; the launcher supplies the mask, never a pre-rounded bitmap tile.
"""
from pathlib import Path
from math import hypot

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'src-tauri/icons'
RES = ROOT / 'src-tauri/gen/android/app/src/main/res'
BACKGROUND = '#243145'
ANDROID_NS = 'http://schemas.android.com/apk/res/android'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def save_xml(relative, content):
    path = RES / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<?xml version="1.0" encoding="utf-8"?>\n' + content + '\n')


def main():
    mark = Image.open(ROOT / 'assets/branding/vana-icon-mark.png').convert('RGBA')
    bbox = mark.getbbox()
    if not bbox:
        raise ValueError('Icon mark is empty')
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    # Fit every visible pixel inside a 60 dp circle, with 3 dp clearance from
    # the 66 dp adaptive icon safe circle, including antialiasing after resize.
    radius = max(hypot(x - cx, y - cy)
                 for y in range(bbox[1], bbox[3])
                 for x in range(bbox[0], bbox[2])
                 if mark.getpixel((x, y))[3])
    scale = (1024 * 30 / 108) / radius
    cropped = mark.crop(bbox)
    cropped = cropped.resize((round(cropped.width * scale), round(cropped.height * scale)),
                             Image.Resampling.LANCZOS)
    foreground = Image.new('RGBA', (1024, 1024))
    foreground.alpha_composite(cropped, ((1024 - cropped.width) // 2,
                                        (1024 - cropped.height) // 2))
    adaptive = Image.new('RGBA', foreground.size, BACKGROUND)
    adaptive.alpha_composite(foreground)
    # The visible viewport of a 108 dp adaptive icon is 72 dp.
    legacy = adaptive.crop((171, 171, 853, 853)).resize((1024, 1024), Image.Resampling.LANCZOS)
    legacy.save(ROOT / 'public/VanaIcon.png')
    for size, name in [(32, '32x32.png'), (128, '128x128.png'),
                       (256, '128x128@2x.png'), (512, 'icon.png')]:
        legacy.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / name)
    legacy.save(ICONS / 'icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    legacy.save(ICONS / 'icon.icns', format='ICNS')
    for density, factor in DENSITIES.items():
        path = RES / f'mipmap-{density}'
        path.mkdir(parents=True, exist_ok=True)
        side = round(48 * factor)
        flat = legacy.resize((side, side), Image.Resampling.LANCZOS)
        flat.save(path / 'ic_launcher.png')
        # Round legacy fallback only. API 26+ uses the same adaptive icon for
        # icon and roundIcon; rounding twice would reintroduce an outer ring.
        mask = Image.new('L', (side * 4, side * 4))
        ImageDraw.Draw(mask).ellipse((0, 0, side * 4 - 1, side * 4 - 1), fill=255)
        flat.putalpha(mask.resize(flat.size, Image.Resampling.LANCZOS))
        flat.save(path / 'ic_launcher_round.png')
        layer = foreground.resize((round(108 * factor), round(108 * factor)), Image.Resampling.LANCZOS)
        layer.save(path / 'ic_launcher_foreground.png')
        mono = Image.new('RGBA', layer.size, 'white')
        mono.putalpha(layer.getchannel('A'))
        mono.save(path / 'ic_launcher_monochrome.png')
    save_xml('drawable/ic_launcher_background.xml',
             f'<shape xmlns:android="{ANDROID_NS}" android:shape="rectangle">\n'
             f'    <solid android:color="{BACKGROUND}" />\n</shape>')
    for version in (26, 33):
        mono = '\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />' if version == 33 else ''
        xml = (f'<adaptive-icon xmlns:android="{ANDROID_NS}">\n'
               '    <background android:drawable="@drawable/ic_launcher_background" />\n'
               f'    <foreground android:drawable="@mipmap/ic_launcher_foreground" />{mono}\n'
               '</adaptive-icon>')
        for name in ('ic_launcher', 'ic_launcher_round'):
            save_xml(f'mipmap-anydpi-v{version}/{name}.xml', xml)
    # Remove the unused Android Studio sample robot so it cannot be selected
    # accidentally in a future manifest/adaptive-icon change.
    (RES / 'drawable-v24/ic_launcher_foreground.xml').unlink(missing_ok=True)
    print('Generated desktop, legacy Android, adaptive and themed icons.')


if __name__ == '__main__':
    main()
