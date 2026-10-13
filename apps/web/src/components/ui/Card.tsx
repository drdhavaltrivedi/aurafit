import type { HTMLAttributes, ElementType } from 'react';
import { cx } from '@/lib/cx';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: 'default' | 'feature' | 'highlight';
  interactive?: boolean;
}

export function Card({ as: Tag = 'div', variant = 'default', interactive, className, ...rest }: CardProps) {
  return <Tag className={cx('card', `card--${variant}`, interactive && 'card--interactive', className)} {...rest} />;
}

interface CardHeaderProps {
  title: React.ReactNode;
  titleId?: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  level?: 2 | 3;
}

export function CardHeader({ title, titleId, subtitle, eyebrow, action, level = 2 }: CardHeaderProps) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="card-header">
      <div className="card-header__text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <H id={titleId} className="card-header__title">
          {title}
        </H>
        {subtitle && <p className="card-header__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="card-header__action">{action}</div>}
    </div>
  );
}
