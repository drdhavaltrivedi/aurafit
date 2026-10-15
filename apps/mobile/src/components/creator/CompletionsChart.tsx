import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CreatorAnalyticsPoint } from '@aurafit/shared';
import { barLabel, bucketSeries, chartSummary, niceMax, utcDayLabel } from '../../lib/creator';
import { useTheme } from '../../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../../theme/tokens';

const PLOT_HEIGHT = 140;
const AXIS_WIDTH = 32;
/** Minimum horizontal space per bar before days are grouped. */
const MIN_SLOT = 9;

interface Props {
  series: CreatorAnalyticsPoint[];
  title: string;
}

/**
 * Daily completions as a bar chart built from Views (no chart library): theme accent bars, a recessive
 * 0 / mid / max grid, tap a bar for its value, and a text list alternative for screen readers.
 */
export function CompletionsChart({ series, title }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);

  const plotW = Math.max(0, width - AXIS_WIDTH);
  const bars = useMemo(() => bucketSeries(series, plotW > 0 ? Math.floor(plotW / MIN_SLOT) : series.length), [series, plotW]);
  const max = niceMax(bars.reduce((m, b) => Math.max(m, b.completions), 0));
  const summary = chartSummary(series);
  const slot = bars.length ? plotW / bars.length : plotW;
  const barW = Math.max(3, Math.min(22, slot - 3));
  const sel = selected !== null ? bars[selected] : null;
  const labelEvery = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(plotW / 56))));

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.summary, { color: colors.textSecondary }]}>{summary}</Text>

      <View
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${title}. ${summary}`}
        style={styles.chart}
      >
        {/* Y axis + grid */}
        {[max, max / 2, 0].map((t, i) => (
          <View key={t} style={[styles.gridRow, { top: (i * PLOT_HEIGHT) / 2 - 7 }]} pointerEvents="none">
            <Text style={[styles.tick, { color: colors.textMuted }]}>{t.toLocaleString('en-US')}</Text>
            <View style={[styles.gridLine, { backgroundColor: i === 2 ? colors.textMuted : colors.border }]} />
          </View>
        ))}
        <View style={[styles.plot, { left: AXIS_WIDTH, height: PLOT_HEIGHT }]}>
          {bars.map((b, i) => {
            const h = max > 0 ? Math.round((b.completions / max) * PLOT_HEIGHT) : 0;
            const active = selected === i;
            return (
              <Pressable
                key={b.from}
                onPress={() => setSelected(active ? null : i)}
                accessible={false}
                importantForAccessibility="no"
                style={[styles.slot, { width: slot }]}
              >
                <View
                  style={{
                    width: barW,
                    height: b.completions > 0 ? Math.max(2, h) : 0,
                    backgroundColor: active ? colors.pink : colors.primary,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[styles.xAxis, { marginLeft: AXIS_WIDTH }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {bars.map((b, i) => (
          <View key={b.from} style={{ width: slot }}>
            {i % labelEvery === 0 ? (
              <Text numberOfLines={1} style={[styles.xLabel, { color: colors.textMuted, width: 56 }]}>
                {utcDayLabel(b.from)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {sel ? (
        <View accessibilityLiveRegion="polite" style={[styles.callout, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          <Text style={[styles.calloutText, { color: colors.textPrimary }]}>
            {barLabel(sel)}: {sel.completions.toLocaleString('en-US')} {sel.completions === 1 ? 'completion' : 'completions'}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setShowList((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showList ? 'Hide daily completions list' : 'Show daily completions as a list'}
        accessibilityState={{ expanded: showList }}
        hitSlop={8}
        style={styles.listToggle}
      >
        <Text style={[styles.listToggleText, { color: colors.primary }]}>{showList ? 'Hide list' : 'Show as list'}</Text>
      </Pressable>
      {showList ? (
        <View style={styles.list}>
          {series.map((p) => (
            <View key={p.date} accessible style={[styles.listRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.listCell, { color: colors.textSecondary }]}>
                {utcDayLabel(p.date, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.listCell, styles.num, { color: colors.textPrimary }]}>{p.completions.toLocaleString('en-US')}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: '800' },
  summary: { fontSize: fontSize.caption + 1 },
  chart: { height: PLOT_HEIGHT, marginTop: spacing.sm, position: 'relative' },
  gridRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', height: 14 },
  tick: { width: AXIS_WIDTH - 6, textAlign: 'right', fontSize: 10, marginRight: 6 },
  gridLine: { flex: 1, height: StyleSheet.hairlineWidth },
  plot: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-end' },
  slot: { height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  xAxis: { flexDirection: 'row', height: 16, overflow: 'visible' },
  xLabel: { fontSize: 10 },
  callout: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.sm, borderWidth: 1 },
  calloutText: { fontSize: fontSize.caption + 1, fontWeight: '700' },
  listToggle: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  listToggleText: { fontSize: fontSize.caption + 1, fontWeight: '800' },
  list: { gap: 0 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  listCell: { fontSize: fontSize.caption + 1 },
  num: { fontWeight: '800' },
});
