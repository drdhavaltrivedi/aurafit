import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Quest } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { ChevronRight, Flame, Users } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface DailyQuestHeroCardProps {
  quest?: Quest;
  onStartQuest?: (questId: string) => void;
}

export function DailyQuestHeroCard({ quest, onStartQuest }: DailyQuestHeroCardProps) {
  const { colors } = useTheme();

  const title = quest ? quest.title : 'Complete 5 Sets of Push Ups';
  const auraReward = quest ? quest.auraReward : 150;
  const progressText = quest ? (quest.completed ? '5/5' : '0/5') : '0/5';

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.bgSurface }]}>
      {/* Background artwork overlay */}
      <ImageBackground
        source={require('../../assets/hunter-avatar.jpg')}
        style={styles.bgImg}
        imageStyle={styles.bgImgStyle}
      >
        <View style={[styles.scrim, { backgroundColor: 'rgba(7, 10, 18, 0.88)' }]} />

        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={[styles.badge, { backgroundColor: 'rgba(139, 92, 246, 0.25)' }]}>
              <AppIcon icon={Users} size={13} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>DAILY QUEST</Text>
            </View>
            <View style={[styles.counterBadge, { backgroundColor: 'rgba(0, 0, 0, 0.65)', borderColor: colors.border }]}>
              <Text style={[styles.counterText, { color: colors.textPrimary }]}>{progressText}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

          <View style={styles.rewardRow}>
            <AppIcon icon={Flame} size={15} color={colors.primary} />
            <Text style={[styles.rewardText, { color: colors.primary }]}>
              +{auraReward} Aura Points
            </Text>
          </View>

          <Pressable
            onPress={() => quest && onStartQuest ? onStartQuest(quest.id) : null}
            accessibilityRole="button"
            accessibilityLabel={`Start quest: ${title}`}
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.startBtnText}>Start Quest</Text>
            <AppIcon icon={ChevronRight} size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  bgImg: {
    width: '100%',
    padding: spacing.lg,
  },
  bgImgStyle: {
    opacity: 0.25,
    resizeMode: 'cover',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    position: 'relative',
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  counterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    fontSize: fontSize.title + 1,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rewardText: {
    fontSize: fontSize.caption + 1,
    fontWeight: '800',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
