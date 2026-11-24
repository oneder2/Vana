import { useRef } from 'react';
import { usePresence } from './usePresence';

/** Retain the last payload only for a controlled panel's exit animation. */
export function useRetained<T>(value: T | null): T | null {
  const present = usePresence(value !== null), last = useRef(value);
  if (value !== null) last.current = value;
  return present ? value ?? last.current : null;
}
