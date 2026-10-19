# React Bits adaptations

Vana's `src/components/motion/FadeContent.tsx` and history timeline presentation
adapt the FadeContent reveal and AnimatedList selection patterns from
[DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), revision
`496968c4117e21278f13917201b7d615bc5e7450`.

Copyright (c) 2026 David Haz. The upstream MIT + Commons Clause license is retained
in [react-bits.md](react-bits.md). This is application use;
the components are not offered as a standalone component library.

The adaptations use existing React/CSS, native buttons, scoped arrow navigation
and reduced-motion support. They omit GSAP, hover selection and global keyboard
handlers so text selection and editor shortcuts remain predictable.

# Bundled letterpress fonts

The studio includes Ma Shan Zheng (“笔迹”) and ZCOOL XiaoWei (“书刻”), converted
from full Google Fonts TTF sources to WOFF2 without glyph subsetting. Both are
licensed under SIL Open Font License 1.1, distributed beside the font files:

- Ma Shan Zheng: [license](../fonts/MaShanZheng-OFL.txt),
  [source](https://github.com/google/fonts/tree/main/ofl/mashanzheng).
- ZCOOL XiaoWei: [license](../fonts/ZCOOLXiaoWei-OFL.txt),
  [source](https://github.com/google/fonts/tree/main/ofl/zcoolxiaowei).

See each license for its original copyright statement. “清晰” and “电码” use
system fonts. Material textures and effects are generated locally by Vana.
