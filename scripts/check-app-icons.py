#!/usr/bin/env python3
"""Guard launcher resource selection, safe-zone fit and opaque edge coverage."""
from math import hypot
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'src-tauri/gen/android/app/src/main/res'
ATTR = '{http://schemas.android.com/apk/res/android}'
BACKGROUND = (36, 49, 69)


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def main():
    app = ET.parse(RES.parent / 'AndroidManifest.xml').getroot().find('application')
    require(app.get(ATTR + 'icon') == '@mipmap/ic_launcher', 'Unexpected manifest icon')
    require(app.get(ATTR + 'roundIcon') == '@mipmap/ic_launcher_round', 'Missing roundIcon')
    background = ET.parse(RES / 'drawable/ic_launcher_background.xml').getroot()
    require(background.tag == 'shape' and background.get(ATTR + 'shape') == 'rectangle',
            'Adaptive background must cover the full rectangular layer')
    require(background.find('solid').get(ATTR + 'color').upper() == '#243145',
            'Unexpected launcher background color')
    for version in (26, 33):
        for name in ('ic_launcher', 'ic_launcher_round'):
            xml = ET.parse(RES / f'mipmap-anydpi-v{version}/{name}.xml').getroot()
            require(xml.tag == 'adaptive-icon', f'{name} must select adaptive-icon on API {version}')
            expected = {'background': '@drawable/ic_launcher_background',
                        'foreground': '@mipmap/ic_launcher_foreground'}
            if version == 33:
                expected['monochrome'] = '@mipmap/ic_launcher_monochrome'
            for tag, reference in expected.items():
                element = xml.find(tag)
                require(element is not None and element.get(ATTR + 'drawable') == reference,
                        f'Incorrect {tag} reference in {name} API {version}')
    require(not (RES / 'drawable-v24/ic_launcher_foreground.xml').exists(),
            'Unused Android sample foreground must not return')
    for density, factor in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        path = RES / f'mipmap-{density}'
        flat = Image.open(path / 'ic_launcher.png').convert('RGBA')
        require(flat.size == (round(48 * factor),) * 2, f'Incorrect legacy size: {density}')
        require(flat.getchannel('A').getextrema() == (255, 255), f'Transparent legacy border: {density}')
        # All outer-edge pixels must be the app background, not a baked-in white tile.
        w, h = flat.size
        border = [(x, y) for x in range(w) for y in (0, h - 1)]
        border += [(x, y) for y in range(h) for x in (0, w - 1)]
        require(all(flat.getpixel(p)[:3] == BACKGROUND for p in border),
                f'Unexpected legacy edge color: {density}')
        layer = Image.open(path / 'ic_launcher_foreground.png').convert('RGBA')
        require(layer.size == (round(108 * factor),) * 2, f'Incorrect adaptive layer size: {density}')
        alpha = layer.getchannel('A')
        require(alpha.getbbox() is not None, f'Empty adaptive foreground: {density}')
        cx, cy = layer.width / 2, layer.height / 2
        radius = max(hypot(x + .5 - cx, y + .5 - cy)
                     for y in range(layer.height) for x in range(layer.width)
                     if alpha.getpixel((x, y)))
        require(radius <= 33 * factor, f'Artwork outside 66 dp safe circle: {density}')
        mono = Image.open(path / 'ic_launcher_monochrome.png').convert('RGBA')
        require(mono.size == layer.size and mono.getchannel('A').tobytes() == alpha.tobytes(),
                f'Incorrect themed icon alpha: {density}')
        require(all(r == g == b == 255 for r, g, b, a in mono.getdata() if a),
                f'Themed icon is not a monochrome silhouette: {density}')
        rounded = Image.open(path / 'ic_launcher_round.png').convert('RGBA')
        require(rounded.size == flat.size and rounded.getpixel((0, 0))[3] == 0,
                f'Incorrect legacy round fallback: {density}')
    ico = Image.open(ROOT / 'src-tauri/icons/icon.ico')
    require({(16, 16), (32, 32), (48, 48), (256, 256)} <= ico.ico.sizes(),
            'ICO is missing embedded resolutions')
    with Image.open(ROOT / 'src-tauri/icons/icon.icns') as icns:
        require(icns.format == 'ICNS', 'ICNS is a mislabeled placeholder')
        icns.load()
    print('PASS: manifest, adaptive/themed resources, 5 densities, safe circle, opaque borders, ICO and ICNS')


if __name__ == '__main__':
    main()
