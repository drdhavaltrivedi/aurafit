import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Quest } from '@aurafit/shared';
import { AppIcon } from './AppIcon';
import { Check, ChevronRight, Flame, ScrollText } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface DailyQuestHeroCardProps {
  /** Next open daily quest; when undefined all of today's quests are done (or none exist). */
  quest?: Quest;
  canComplete: boolean;
  /** Completed / total quests today. */
  doneCount: number;
  totalCount: number;
  onCompleteQuest: (questId: string) => void;
  /** Opens the Quests tab. */
  onOpenQuests: () => void;
}

/** Highlights the next open quest (always dark artwork, so colours are fixed for contrast). */
export function DailyQuestHeroCard({ quest, canComplete, doneCount, totalCount, onCompleteQuest, onOpenQuests }: DailyQuestHeroCardProps) {
  const allDone = !quest;
  const title = quest ? quest.title : totalCount > 0 ? 'All quests done for today' : 'No quests today';
  const counter = quest ? `${quest.currentCount}/${quest.targetCount} ${quest.unit}`.trim() : `${doneCount}/${totalCount}`;

  return (
    <View style={styles.card}>
      {/* Decorative artwork only (not anyone's photo). */}
      <ImageBackground
        source={require('../../assets/hunter-avatar.jpg')}
        style={styles.bgImg}
        imageStyle={styles.bgImgStyle}
        accessible={false}
      >
        <View style={styles.scrim} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.badge}>
              <AppIcon icon={ScrollText} size={13} color="#C4B5FD" />
              <Text style={styles.badgeText}>{allDone ? 'DAILY QUESTS' : 'NEXT QUEST'}</Text>
            </View>
            <View style={styles.counterBadge}>
              <Text style={styles.counterText} testID="daily-quest-counter">{counter}</Text>
            </View>
          </View>

          <Text style={styles.title} testID="daily-quest-title">{title}</Text>
          {quest ? (
            <View style={styles.rewardRow}>
              <AppIcon icon={Flame} size={16} color="#A78BFA" />
              <Text style={styles.rewardText}>
                +{quest.auraReward} aura • +{quest.statReward.amount} {quest.statReward.stat.toUpperCase()}
              </Text>
            </View>
          ) : (
            <Text style={styles.rewardText}>
              {totalCount > 0 ? `${doneCount} of ${totalCount} completed. New quests tomorrow.` : 'Check back tomorrow.'}
            </Text>
          )}

          <View style={styles.btnRow}>
            {quest && canComplete ? (
              <Pressable
                onPress={() => onCompleteQuest(quest.id)}
                testID="daily-quest-start"
                accessibilityRole="button"
                accessibilityLabel={`Complete quest: ${quest.title}`}
                style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
              >
                <AppIcon icon={Check} size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.primaryBtnText}>Mark complete</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onOpenQuests}
              testID="daily-quest-all"
              accessibilityRole="button"
              accessibilityLabel="See all quests"
              style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.secondaryBtnText}>All quests</Text>
              <AppIcon icon={ChevronRight} size={16} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    overflow: 'hidden',
    backgroundColor: '#0A0F1D',
  },
  bgImg: {
    width: '100%',
    padding: spacing.lg,
  },
  bgImgStyle: {
    opacity: 0.35,
    resizeMode: 'cover',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 20, 0.88)',
  },
  content: {
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: 'rgba(124, 58, 237, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  badgeText: {
    color: '#DDD6FE',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  counterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexShrink: 1,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: fontSize.title + 2,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rewardText: {
    color: '#C4B5FD',
    fontSize: fontSize.caption + 2,
    fontWeight: '800',
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    backgroundColor: '#7C3AED',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
