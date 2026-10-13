# React Bits adaptations

Vana's `src/components/motion/FadeContent.tsx` and history timeline presentation
adapt the FadeContent reveal and AnimatedList selection patterns from
[DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), revision
`496968c4117e21278f13917201b7d615bc5e7450`.

Copyright (c) 2026 David Haz. The upstream MIT + Commons Clause license is retained
in [licenses/react-bits.md](licenses/react-bits.md). This is application use;
the components are not offered as a standalone component library.

The adaptations use existing React/CSS, native buttons, scoped arrow navigation
and reduced-motion support. They omit GSAP, hover selection and global keyboard
handlers so text selection and editor shortcuts remain predictable.
