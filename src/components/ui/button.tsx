import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-[-0.01em] ' +
  'transition-[transform,background-color,color,border-color,opacity] duration-150 ease-out select-none ' +
  'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'disabled:pointer-events-none disabled:opacity-40';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper shadow-[var(--shadow-raised)] hover:bg-ink-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunk',
  ghost: 'text-ink-soft hover:text-ink hover:bg-sunk',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-5 text-[0.95rem]',
  sm: 'h-9 px-3.5 text-[0.875rem]',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md'): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />
  );
}
