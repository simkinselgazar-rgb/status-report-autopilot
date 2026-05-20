import type { CSSProperties } from 'react';

/** Sets the `--i` custom property used by the staggered-entrance CSS. */
export function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}
