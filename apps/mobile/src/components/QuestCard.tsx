import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from './icons';
import type { Quest } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';

/** `#RRGGBB` + alpha → `#RRGGBBAA`; other colour formats are returned unchanged. */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

interface QuestCardProps {
  quest: Quest;
  canComplete: boolean;
  onComplete: (questId: string) => void;
}

export const QuestCard = memo(function QuestCard({ quest, canComplete, onComplete }: QuestCardProps) {
  const { colors } = useTheme();
  const done = quest.completed;
  const stat = quest.statReward.stat.toUpperCase();
  const accent = /^#[0-9a-f]{6}$/i.test(quest.accentColor) ? quest.accentColor : colors.primary;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: done ? colors.emeraldSubtle : colors.bgSurface,
          borderColor: done ? colors.emerald : colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconTile, { backgroundColor: withAlpha(accent, 0.15), borderColor: withAlpha(accent, 0.3) }]}>
          <AppIcon name={quest.icon} size={22} color={accent} strokeWidth={2.25} />
        </View>
        <View
          style={styles.textWrap}
          accessible
          accessibilityLabel={`${quest.title}. ${quest.subtitle}. Reward ${quest.auraReward} aura and ${quest.statReward.amount} ${stat}.${done ? ' Completed.' : ''}`}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>{quest.title}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{quest.subtitle}</Text>
          <View style={styles.badges}>
            <Text style={[styles.badge, { color: colors.primary, backgroundColor: colors.primarySubtle }]}>
              +{quest.auraReward} AURA
            </Text>
            <Text style={[styles.badge, { color: colors.textSecondary, backgroundColor: colors.bgElevated }]}>
              +{quest.statReward.amount} {stat}
            </Text>
          </View>
        </View>
        {done ? (
          <View
            style={[styles.doneCircle, { backgroundColor: colors.emeraldSubtle, borderColor: colors.emerald }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            testID={`quest-done-${quest.id}`}
          >
            <AppIcon icon={Check} size={18} color={colors.emerald} strokeWidth={3} />
          </View>
        ) : canComplete ? (
          <AppButton
            testID={`quest-claim-${quest.id}`}
            label="Lock In"
            accessibilityLabel={`Complete quest: ${quest.title}`}
            onPress={() => onComplete(quest.id)}
          />
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md + 2,
    padding: spacing.md + 2,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  sub: {
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    fontSize: fontSize.caption - 1,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  doneCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
