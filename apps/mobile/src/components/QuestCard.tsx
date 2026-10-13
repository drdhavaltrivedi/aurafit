import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Quest } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';
import { AppButton } from './AppButton';

interface QuestCardProps {
  quest: Quest;
  canComplete: boolean;
  onComplete: (questId: string) => void;
}

export const QuestCard = memo(function QuestCard({ quest, canComplete, onComplete }: QuestCardProps) {
  const { colors } = useTheme();
  const done = quest.completed;
  const stat = quest.statReward.stat.toUpperCase();

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
        <Text style={styles.icon} accessible={false} importantForAccessibility="no">
          {quest.icon}
        </Text>
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
          >
            <Text style={[styles.doneText, { color: colors.emerald }]}>✓</Text>
          </View>
        ) : canComplete ? (
          <AppButton
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
  icon: {
    fontSize: 22,
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
  doneText: {
    fontWeight: '900',
    fontSize: fontSize.body,
  },
});
