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
    <View style={[styles.card, { borderColor: colors.border }]}>
      {/* Background artwork overlay */}
      <ImageBackground
        source={require('../../assets/hunter-avatar.jpg')}
        style={styles.bgImg}
        imageStyle={styles.bgImgStyle}
      >
        {/* Solid dark gradient backing scrim ensuring 100% readability */}
        <View style={styles.scrim} />

        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.badge}>
              <AppIcon icon={Users} size={13} color="#C4B5FD" />
              <Text style={styles.badgeText}>DAILY QUEST</Text>
            </View>
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{progressText}</Text>
            </View>
          </View>

          {/* Guaranteed crisp white title with subtle shadow */}
          <Text style={styles.title}>{title}</Text>

          <View style={styles.rewardRow}>
            <AppIcon icon={Flame} size={16} color="#A78BFA" />
            <Text style={styles.rewardText}>
              +{auraReward} Aura Points
            </Text>
          </View>

          <Pressable
            onPress={() => (quest && onStartQuest ? onStartQuest(quest.id) : null)}
            accessibilityRole="button"
            accessibilityLabel={`Start quest: ${title}`}
            style={({ pressed }) => [
              styles.startBtn,
              { opacity: pressed ? 0.85 : 1 },
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
    backgroundColor: '#0A0F1D',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
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
    backgroundColor: 'rgba(6, 10, 20, 0.90)',
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
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
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
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    backgroundColor: '#7C3AED',
    marginTop: 6,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
