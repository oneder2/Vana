// Adapted from React Bits FadeContent (David Haz, 2026).
// See THIRD_PARTY_NOTICES.md and licenses/react-bits.md.
import type { HTMLAttributes } from 'react';

/** A short reveal for mounted tool panels. CSS keeps content available without
 * observers/GSAP and honors the user's reduced-motion preference. */
export function FadeContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`vana-fade-content ${className}`} />;
}
