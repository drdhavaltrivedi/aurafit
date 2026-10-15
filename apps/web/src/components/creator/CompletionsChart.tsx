'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CreatorAnalyticsPoint } from '@aurafit/shared';
import { formatNumber } from '@/lib/format';

interface CompletionsChartProps {
  series: CreatorAnalyticsPoint[];
  /** Visible heading, also the chart's accessible name. */
  title: string;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
};

/** Smallest "nice" even axis maximum >= value (1, 2, 4, 6, 8 x 10^n, at least 4) so the mid tick is a whole number. */
function niceMax(value: number): number {
  const v = Math.max(4, value);
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/** Bar with a 4px rounded top, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Daily completions as an SVG bar chart: one series (accent colour from theme tokens, so it follows
 * light/dark), recessive grid, hover tooltip, and a data-table alternative for screen readers / keyboard.
 */
export function CompletionsChart({ series, title }: CompletionsChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stats = useMemo(() => {
    const total = series.reduce((s, p) => s + p.completions, 0);
    const peak = series.reduce<CreatorAnalyticsPoint | null>((best, p) => (!best || p.completions > best.completions ? p : best), null);
    return { total, peak, max: niceMax(peak?.completions ?? 0) };
  }, [series]);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = series.length ? plotW / series.length : plotW;
  const gap = 2;
  const barW = Math.max(2, Math.min(28, slot - gap));
  const y = (v: number) => PAD.top + plotH - (v / stats.max) * plotH;
  const ticks = [0, stats.max / 2, stats.max];
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotW / 56))));

  const summary =
    stats.total === 0
      ? `No completions between ${dayLabel(series[0]?.date ?? '')} and ${dayLabel(series[series.length - 1]?.date ?? '')}.`
      : `${formatNumber(stats.total)} completions over ${series.length} days. Busiest day: ${dayLabel(stats.peak!.date)} with ${formatNumber(stats.peak!.completions)}.`;

  const hovered = hover !== null ? series[hover] : null;

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart__title">
        {title}
      </figcaption>
      <p id={descId} className="chart__summary">
        {summary}
      </p>
      <div ref={wrapRef} className="chart__plot" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${titleId} ${descId}`} className="chart__svg">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart__baseline' : 'chart__grid'} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart__tick">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {series.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const top = y(p.completions);
            return (
              <g key={p.date}>
                <path d={barPath(x, top, barW, PAD.top + plotH - top)} className={hover === i ? 'chart__bar chart__bar--active' : 'chart__bar'} />
                {/* Hit target taller and wider than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  aria-hidden="true"
                />
                {i % labelEvery === 0 || i === series.length - 1 ? (
                  <text x={PAD.left + i * slot + slot / 2} y={HEIGHT - 8} textAnchor="middle" className="chart__tick">
                    {dayLabel(p.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null ? (
          <div
            className="chart__tooltip"
            role="presentation"
            style={{
              left: Math.min(width - 120, Math.max(0, PAD.left + hover * slot + slot / 2 - 60)),
              top: Math.max(0, y(hovered.completions) - 52),
            }}
          >
            <span className="chart__tooltip-date">{dayLabel(hovered.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="chart__tooltip-value">
              {formatNumber(hovered.completions)} {hovered.completions === 1 ? 'completion' : 'completions'}
            </span>
          </div>
        ) : null}
      </div>
      <details className="chart__table">
        <summary>Show as table</summary>
        <table className="data-table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day (UTC)</th>
              <th scope="col" className="num">
                Completions
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <th scope="row">{dayLabel(p.date, { weekday: 'short', month: 'short', day: 'numeric' })}</th>
                <td className="num">{formatNumber(p.completions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
