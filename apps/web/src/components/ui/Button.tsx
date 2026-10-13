import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Square icon-only button. Requires an `aria-label`. */
  icon?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  leadingIcon,
  trailingIcon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', icon && 'btn--icon', className)}
      {...rest}
    >
      {leadingIcon && <span className="btn__icon" aria-hidden="true">{leadingIcon}</span>}
      {children}
      {trailingIcon && <span className="btn__icon" aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
}
