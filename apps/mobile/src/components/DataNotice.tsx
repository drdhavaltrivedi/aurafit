import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

/** Small pill marking seed/demo figures so they are never mistaken for real data. */
export function SampleDataTag() {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Sample data. These figures are examples, not real activity."
      style={[styles.tag, { backgroundColor: colors.orangeSubtle, borderColor: colors.orange }]}
    >
      <Text style={[styles.tagText, { color: colors.orange }]} maxFontSizeMultiplier={1.4}>
        SAMPLE DATA
      </Text>
    </View>
  );
}

/** Honest placeholder for features whose real data is not available yet. */
export function ComingSoonCard({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. Coming soon. ${body}`}
      style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
        <View style={[styles.tag, { backgroundColor: colors.primarySubtle, borderColor: colors.primary }]}>
          <Text style={[styles.tagText, { color: colors.primary }]} maxFontSizeMultiplier={1.4}>
            COMING SOON
          </Text>
        </View>
      </View>
      <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tagText: {
    fontSize: fontSize.caption - 1,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
    flexShrink: 1,
  },
  cardBody: {
    fontSize: fontSize.caption + 1,
  },
});
