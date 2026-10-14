/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text -- Satori (next/og) markup, not DOM. */
import type { CSSProperties, ReactElement } from 'react';
import type { RankCardData, RankCardFormat } from '@aurafit/shared';

/**
 * Satori markup for the shareable rank card (rendered by next/og ImageResponse).
 * Satori supports a flexbox subset of CSS: every element with more than one child needs
 * display:flex, and there is no grid. Icons are inline Lucide SVG paths (ISC licence).
 */

const C = {
  page: '#070A12',
  surface: 'rgba(19, 27, 46, 0.72)',
  border: 'rgba(255, 255, 255, 0.10)',
  track: 'rgba(255, 255, 255, 0.08)',
  text: '#FFFFFF',
  secondary: '#A5B4CB',
  muted: '#8391A7',
  violet: '#7C3AED',
  violetFg: '#A78BFA',
  orange: '#FB923C',
};

const ICONS = {
  zap: ['M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z'],
  flame: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'],
  crown: [
    'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    'M5 21h14',
  ],
} as const;

function Icon({ name, size, color }: { name: keyof typeof ICONS; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const row = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', ...extra });
const col = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'column', ...extra });

function Background({ card }: { card?: RankCardData }) {
  const glow = card?.theme.glow ?? 'rgba(139, 92, 246, 0.4)';
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        backgroundColor: C.page,
        backgroundImage: [
          'radial-gradient(70% 45% at 50% 0%, rgba(124, 58, 237, 0.55), rgba(124, 58, 237, 0) 100%)',
          `radial-gradient(60% 40% at 100% 100%, ${glow}, rgba(0, 0, 0, 0) 100%)`,
          'radial-gradient(50% 35% at 0% 70%, rgba(37, 99, 235, 0.22), rgba(0, 0, 0, 0) 100%)',
        ].join(', '),
      }}
    />
  );
}

function Brand({ logo, size, card }: { logo: string; size: number; card?: RankCardData }) {
  return (
    <div style={row({ justifyContent: 'space-between', width: '100%' })}>
      <div style={row({ gap: size * 0.22 })}>
        <img src={logo} width={size} height={size} style={{ borderRadius: size * 0.24, border: `2px solid ${C.border}` }} />
        <div style={col({ gap: 2 })}>
          <div style={{ fontSize: size * 0.46, fontWeight: 900, color: C.text, letterSpacing: -1 }}>AuraFit</div>
          <div style={{ fontSize: size * 0.2, fontWeight: 700, color: C.violetFg, letterSpacing: size * 0.05 }}>HUNTER CARD</div>
        </div>
      </div>
      {card ? (
        <div
          style={row({
            gap: 10,
            padding: `${size * 0.12}px ${size * 0.26}px`,
            borderRadius: 999,
            border: `2px solid ${C.border}`,
            backgroundColor: C.surface,
            fontSize: size * 0.24,
            fontWeight: 800,
            color: C.text,
          })}
        >
          <span style={{ color: C.muted, fontWeight: 700 }}>LV</span>
          <span>{card.level}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Gradient ring with the rank glyph ("S", or "MONARCH") in rank-coloured gradient text. */
function RankSeal({ card, size }: { card: RankCardData; size: number }) {
  const monarch = card.rank === 'MONARCH';
  const ring = Math.max(6, Math.round(size * 0.022));
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: size,
        padding: ring,
        backgroundImage: `linear-gradient(140deg, ${card.theme.from}, ${card.theme.to} 55%, ${C.violet})`,
        boxShadow: `0 0 ${size * 0.22}px ${card.theme.glow}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flex: 1,
          borderRadius: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'radial-gradient(circle at 50% 30%, #1A2240, #0A0F1E 70%)',
        }}
      >
        {monarch ? (
          <div style={col({ alignItems: 'center', gap: size * 0.02 })}>
            <Icon name="crown" size={size * 0.24} color={card.theme.from} />
            <div
              style={{
                fontSize: size * 0.125,
                fontWeight: 900,
                letterSpacing: size * 0.006,
                backgroundImage: `linear-gradient(180deg, #FFFFFF, ${card.theme.from} 45%, ${card.theme.to})`,
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              MONARCH
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: size * 0.62,
              fontWeight: 900,
              lineHeight: 1,
              marginTop: -size * 0.04,
              backgroundImage: `linear-gradient(180deg, #FFFFFF 10%, ${card.theme.from} 50%, ${card.theme.to})`,
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {card.rankGlyph}
          </div>
        )}
      </div>
    </div>
  );
}

function RankPill({ card, fontSize }: { card: RankCardData; fontSize: number }) {
  return (
    <div
      style={row({
        alignSelf: 'flex-start',
        gap: fontSize * 0.4,
        padding: `${fontSize * 0.35}px ${fontSize * 0.8}px`,
        borderRadius: 999,
        border: `2px solid ${card.theme.from}`,
        backgroundColor: 'rgba(7, 10, 18, 0.55)',
        color: card.theme.from,
        fontSize,
        fontWeight: 900,
        letterSpacing: fontSize * 0.12,
      })}
    >
      {`${card.rank} HUNTER`}
    </div>
  );
}

function Bar({ percent, height, from, to }: { percent: number; height: number; from: string; to: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ display: 'flex', width: '100%', height, borderRadius: height, backgroundColor: C.track }}>
      {pct > 0 ? (
        <div
          style={{
            display: 'flex',
            width: `${Math.max(pct, 3)}%`,
            height: '100%',
            borderRadius: height,
            backgroundImage: `linear-gradient(90deg, ${from}, ${to})`,
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({ icon, color, value, label, scale }: { icon: keyof typeof ICONS; color: string; value: string; label: string; scale: number }) {
  return (
    <div
      style={row({
        flex: 1,
        gap: 22 * scale,
        padding: `${26 * scale}px ${30 * scale}px`,
        borderRadius: 28 * scale,
        border: `2px solid ${C.border}`,
        backgroundColor: C.surface,
      })}
    >
      <div
        style={{
          display: 'flex',
          width: 76 * scale,
          height: 76 * scale,
          borderRadius: 22 * scale,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
        }}
      >
        <Icon name={icon} size={44 * scale} color={color} />
      </div>
      <div style={col({ gap: 2 })}>
        <div style={{ fontSize: 50 * scale, fontWeight: 900, color: C.text, letterSpacing: -1 }}>{value}</div>
        <div style={{ fontSize: 22 * scale, fontWeight: 700, color: C.muted, letterSpacing: 3 * scale }}>{label}</div>
      </div>
    </div>
  );
}

function Progress({ card, scale }: { card: RankCardData; scale: number }) {
  return (
    <div style={col({ gap: 16 * scale, width: '100%' })}>
      <div style={row({ justifyContent: 'space-between' })}>
        <div style={{ fontSize: 28 * scale, fontWeight: 700, color: C.secondary, letterSpacing: 2 * scale }}>RANK PROGRESS</div>
        <div style={{ fontSize: 32 * scale, fontWeight: 900, color: card.theme.from }}>{card.progressLabel}</div>
      </div>
      <Bar percent={card.progressPercent} height={26 * scale} from={card.theme.from} to={card.theme.to} />
      <div style={row({ justifyContent: 'space-between', fontSize: 24 * scale, fontWeight: 700, color: C.muted })}>
        <span>{card.rankLabel}</span>
        <span>{card.progressDetail}</span>
      </div>
    </div>
  );
}

function StatRow({ stat, scale }: { stat: RankCardData['stats'][number]; scale: number }) {
  return (
    <div style={row({ gap: 26 * scale, width: '100%' })}>
      <div style={{ display: 'flex', width: 96 * scale, fontSize: 32 * scale, fontWeight: 900, color: stat.color, letterSpacing: 1 }}>{stat.label}</div>
      <div style={{ display: 'flex', flex: 1 }}>
        <Bar percent={stat.percent} height={20 * scale} from={stat.color} to={stat.color} />
      </div>
      <div style={{ display: 'flex', width: 84 * scale, justifyContent: 'flex-end', fontSize: 34 * scale, fontWeight: 900, color: C.text }}>
        {String(stat.value)}
      </div>
    </div>
  );
}

function Footer({ host, size }: { host: string; size: number }) {
  return (
    <div
      style={row({
        justifyContent: 'center',
        width: '100%',
        gap: 14,
        paddingTop: size * 0.9,
        borderTop: `2px solid ${C.border}`,
        fontSize: size,
        fontWeight: 700,
        color: C.secondary,
      })}
    >
      <span>Level up with</span>
      <span style={{ color: C.text, fontWeight: 900 }}>AuraFit</span>
      <span style={{ color: C.muted }}>·</span>
      <span style={{ color: C.violetFg }}>{host}</span>
    </div>
  );
}

/** Story names stay on one line where possible: shrink long names instead of wrapping. */
const storyNameSize = (name: string): number => (name.length <= 14 ? 92 : name.length <= 20 ? 76 : 58);

const frame = (width: number, height: number, padding: number): CSSProperties => ({
  width,
  height,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  padding,
  fontFamily: 'Inter',
  color: C.text,
  backgroundColor: C.page,
});

/** 1080x1920 (story) or 1080x1080 (square) card for a public profile. */
export function RankCardImage({ card, format, logo, host }: { card: RankCardData; format: RankCardFormat; logo: string; host: string }): ReactElement {
  if (format === 'square') {
    return (
      <div style={frame(1080, 1080, 64)}>
        <Background card={card} />
        <Brand logo={logo} size={84} card={card} />
        <div style={row({ gap: 52, marginTop: 44 })}>
          <RankSeal card={card} size={320} />
          <div style={col({ flex: 1, gap: 14, minWidth: 0 })}>
            <RankPill card={card} fontSize={24} />
            <div style={{ fontSize: card.displayName.length > 16 ? 54 : 66, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.08, marginTop: 6 }}>
              {card.displayName}
            </div>
            <div style={{ fontSize: 32, fontWeight: 500, color: C.secondary }}>{card.handle}</div>
            <div style={row({ gap: 30, marginTop: 12 })}>
              <div style={row({ gap: 10 })}>
                <Icon name="zap" size={34} color={C.violetFg} />
                <span style={{ fontSize: 40, fontWeight: 900 }}>{card.auraLabel}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.muted, letterSpacing: 2, marginTop: 8 }}>AURA</span>
              </div>
              <div style={row({ gap: 10 })}>
                <Icon name="flame" size={34} color={C.orange} />
                <span style={{ fontSize: 40, fontWeight: 900 }}>{String(card.streakDays)}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.muted, letterSpacing: 2, marginTop: 8 }}>DAY STREAK</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 48 }}>
          <Progress card={card} scale={0.9} />
        </div>
        <div
          style={row({
            flexWrap: 'wrap',
            rowGap: 26,
            columnGap: 56,
            marginTop: 40,
            padding: '30px 36px',
            borderRadius: 28,
            border: `2px solid ${C.border}`,
            backgroundColor: C.surface,
          })}
        >
          {card.stats.map((s) => (
            <div key={s.key} style={{ display: 'flex', width: 404 }}>
              <StatRow stat={s} scale={0.86} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flex: 1 }} />
        <Footer host={host} size={26} />
      </div>
    );
  }

  return (
    <div style={frame(1080, 1920, 80)}>
      <Background card={card} />
      <Brand logo={logo} size={112} card={card} />
      <div style={col({ alignItems: 'center', marginTop: 64 })}>
        <RankSeal card={card} size={460} />
      </div>
      <div style={col({ alignItems: 'center', marginTop: 48, gap: 12 })}>
        <div style={{ display: 'flex' }}>
          <RankPill card={card} fontSize={30} />
        </div>
        <div
          style={{
            fontSize: storyNameSize(card.displayName),
            fontWeight: 900,
            letterSpacing: -2,
            marginTop: 14,
            textAlign: 'center',
            lineHeight: 1.05,
          }}
        >
          {card.displayName}
        </div>
        <div style={{ fontSize: 42, fontWeight: 500, color: C.secondary }}>{card.handle}</div>
      </div>
      <div style={row({ gap: 28, marginTop: 52, width: '100%' })}>
        <Tile icon="zap" color={C.violetFg} value={card.auraLabel} label="AURA POINTS" scale={1} />
        <Tile icon="flame" color={C.orange} value={String(card.streakDays)} label="DAY STREAK" scale={1} />
      </div>
      <div style={{ display: 'flex', marginTop: 52 }}>
        <Progress card={card} scale={1} />
      </div>
      <div
        style={col({
          gap: 26,
          marginTop: 48,
          padding: '34px 44px',
          borderRadius: 32,
          border: `2px solid ${C.border}`,
          backgroundColor: C.surface,
        })}
      >
        {card.stats.map((s) => (
          <StatRow key={s.key} stat={s} scale={1} />
        ))}
      </div>
      <div style={{ display: 'flex', flex: 1 }} />
      <Footer host={host} size={32} />
    </div>
  );
}

/** Brand card for unknown / invalid handles, so link unfurlers still get an image. */
export function FallbackCardImage({ format, logo, host, title, subtitle }: { format: RankCardFormat; logo: string; host: string; title: string; subtitle: string }): ReactElement {
  const square = format === 'square';
  return (
    <div style={frame(1080, square ? 1080 : 1920, square ? 64 : 80)}>
      <Background />
      <div style={col({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 })}>
        <img src={logo} width={square ? 220 : 300} height={square ? 220 : 300} style={{ borderRadius: square ? 52 : 72, border: `2px solid ${C.border}` }} />
        <div style={{ fontSize: square ? 72 : 96, fontWeight: 900, letterSpacing: -2, marginTop: 20 }}>{title}</div>
        <div style={{ fontSize: square ? 34 : 44, fontWeight: 500, color: C.secondary, textAlign: 'center', maxWidth: 860 }}>{subtitle}</div>
      </div>
      <Footer host={host} size={square ? 26 : 32} />
    </div>
  );
}
