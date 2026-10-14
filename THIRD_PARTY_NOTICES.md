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

The Vana download website's `website/effects.js` adapts the Aurora WebGL shader
and SpotlightCard pointer-centered light from the same revision. It uses a
native DOM lifecycle with a bounded canvas resolution, offscreen/visibility
pausing, reduced-motion and a user pause control. The license is also distributed
with the generated website at `/licenses/react-bits.md`.
