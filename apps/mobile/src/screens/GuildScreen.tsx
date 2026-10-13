import React, { useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from '../components/AppIcon';
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  Flame,
  MessageSquare,
  Settings,
  Shield,
  Swords,
  Timer,
  Trophy,
  Users,
} from '../components/icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface GuildScreenProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
}

export function GuildScreen({ onBack, onOpenSettings }: GuildScreenProps) {
  const { colors } = useTheme();
  const [bossHp, setBossHp] = useState(68);
  const [damageDealt, setDamageDealt] = useState(2.4);
  const [raidAttacked, setRaidAttacked] = useState(false);

  const handleAttackBoss = () => {
    if (bossHp > 0) {
      setBossHp((prev) => Math.max(prev - 2, 0));
      setDamageDealt((prev) => +(prev + 0.1).toFixed(1));
      setRaidAttacked(true);
      setTimeout(() => setRaidAttacked(false), 800);
    }
  };

  const leaderboard = [
    { rank: 1, name: 'Shadow Reapers', aura: 48320, members: '24/30', medalColor: '#F59E0B' },
    { rank: 2, name: 'Iron Fangs', aura: 41205, members: '22/30', medalColor: '#94A3B8' },
    { rank: 3, name: 'Crimson Blades', aura: 36780, members: '20/30', medalColor: '#D97706' },
    { rank: 4, name: 'Nova Force', aura: 32410, members: '18/30', medalColor: '#64748B' },
    { rank: 5, name: 'Celestial Path', aura: 28960, members: '17/30', medalColor: '#64748B' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Screen Header */}
      <View style={styles.topHeader}>
        <View style={styles.titleWrap}>
          {onBack && (
            <Pressable hitSlop={8} onPress={onBack} style={styles.backBtn}>
              <AppIcon icon={ArrowLeft} size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <View>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Hunter Guild</Text>
            <Text style={[styles.screenSub, { color: colors.textSecondary }]}>Train Together. Raid Bigger.</Text>
          </View>
        </View>
        <View style={styles.headerIcons}>
          <Pressable style={[styles.iconCircle, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <AppIcon icon={Users} size={18} color={colors.textPrimary} />
          </Pressable>
          {onOpenSettings && (
            <Pressable
              onPress={onOpenSettings}
              style={[styles.iconCircle, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
            >
              <AppIcon icon={Settings} size={18} color={colors.textPrimary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Guild Hero Banner */}
      <View style={[styles.guildHero, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <ImageBackground
          source={require('../../assets/hunter-avatar.jpg')}
          style={styles.guildBg}
          imageStyle={styles.guildBgImg}
        >
          <View style={[styles.heroScrim, { backgroundColor: 'rgba(7, 10, 18, 0.88)' }]} />
          <View style={styles.guildHeroContent}>
            <View style={styles.guildBadgeRow}>
              <View style={[styles.crestIcon, { borderColor: colors.primary, backgroundColor: colors.primarySubtle }]}>
                <AppIcon icon={Crown} size={24} color={colors.primary} />
              </View>
              <View style={styles.guildNameCol}>
                <Text style={[styles.guildName, { color: colors.textPrimary }]}>Shadow Reapers</Text>
                <Text style={[styles.guildStats, { color: colors.textSecondary }]}>Lv. 5 • 24/30 Hunters</Text>
                <Text style={[styles.guildMotto, { color: colors.textMuted }]}>Stronger Together. Higher Forever.</Text>
              </View>
              <View style={[styles.guildAuraPill, { backgroundColor: colors.primarySubtle, borderColor: colors.primary }]}>
                <AppIcon icon={Flame} size={14} color={colors.primary} />
                <View>
                  <Text style={[styles.auraPillLabel, { color: colors.textSecondary }]}>Guild Aura</Text>
                  <Text style={[styles.auraPillVal, { color: colors.primary }]}>48,320</Text>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>
      </View>

      {/* Guild Action Buttons */}
      <View style={styles.actionGrid}>
        {[
          { label: 'Guild Raid', icon: Swords, color: colors.primary, bg: colors.primarySubtle },
          { label: 'Leaderboard', icon: Trophy, color: colors.blue, bg: colors.cyanSubtle },
          { label: 'Members', icon: Users, color: colors.pink, bg: colors.pinkSubtle },
          { label: 'Chat', icon: MessageSquare, color: colors.cyan, bg: colors.cyanSubtle },
        ].map((act, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [
              styles.actionBox,
              { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: act.bg }]}>
              <AppIcon icon={act.icon} size={20} color={act.color} strokeWidth={2.4} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{act.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* World Boss Raid Card */}
      <View style={[styles.bossCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <ImageBackground
          source={require('../../assets/hunter-avatar.jpg')}
          style={styles.bossBg}
          imageStyle={styles.bossBgImg}
        >
          <View style={[styles.heroScrim, { backgroundColor: 'rgba(9, 13, 24, 0.88)' }]} />
          <View style={styles.bossContent}>
            <View style={styles.bossTagRow}>
              <View style={[styles.raidBadge, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <Text style={[styles.raidBadgeText, { color: colors.danger }]}>WORLD BOSS RAID</Text>
              </View>
              <View style={styles.timerRow}>
                <AppIcon icon={Timer} size={13} color={colors.textSecondary} />
                <Text style={[styles.timerText, { color: colors.textSecondary }]}>Ends in 2d 14h</Text>
              </View>
            </View>

            <Text style={[styles.bossName, { color: colors.textPrimary }]}>The Shadow Monarch</Text>

            <View style={styles.bossBarSection}>
              <View style={[styles.bossBarTrack, { backgroundColor: colors.bgElevated }]}>
                <View style={[styles.bossBarFill, { width: `${bossHp}%`, backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.damageRow}>
                <Text style={[styles.damageLabel, { color: colors.textSecondary }]}>
                  Your Guild Damage: {damageDealt}M / 3.5M
                </Text>
                <Text style={[styles.damagePct, { color: colors.primary }]}>{bossHp}%</Text>
              </View>
            </View>

            <Pressable
              onPress={handleAttackBoss}
              style={({ pressed }) => [
                styles.raidBtn,
                { backgroundColor: colors.primary, opacity: pressed || raidAttacked ? 0.75 : 1 },
              ]}
            >
              <Text style={styles.raidBtnText}>{raidAttacked ? 'CRITICAL HIT! -100K HP' : 'Join Raid'}</Text>
              <AppIcon icon={ChevronRight} size={16} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </View>
        </ImageBackground>
      </View>

      {/* Guild Leaderboard */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Guild Leaderboard</Text>
        <Pressable style={styles.viewAllRow}>
          <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>View All</Text>
          <AppIcon icon={ChevronRight} size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.leaderboardList}>
        {leaderboard.map((item) => (
          <View
            key={item.rank}
            style={[styles.leaderboardRow, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
          >
            <View style={[styles.rankBadgeNum, { backgroundColor: item.rank === 1 ? colors.primarySubtle : colors.bgElevated }]}>
              <Text style={[styles.rankNumText, { color: item.medalColor }]}>#{item.rank}</Text>
            </View>

            <Image source={require('../../assets/hunter-avatar.jpg')} style={styles.leaderAvatar} />

            <View style={styles.guildInfoCol}>
              <Text style={[styles.guildRowName, { color: colors.textPrimary }]}>{item.name}</Text>
              <View style={styles.auraRow}>
                <AppIcon icon={Flame} size={13} color={colors.danger} />
                <Text style={[styles.auraScore, { color: colors.textSecondary }]}>{item.aura.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.membersCol}>
              <AppIcon icon={Users} size={14} color={colors.textMuted} />
              <Text style={[styles.membersText, { color: colors.textMuted }]}>{item.members}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Guild Chat Snippet */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Guild Chat</Text>
        <AppIcon icon={ChevronRight} size={14} color={colors.textSecondary} />
      </View>

      <View style={[styles.chatSnippet, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <Image source={require('../../assets/hunter-avatar.jpg')} style={styles.chatAvatar} />
        <View style={styles.chatBubbleCol}>
          <View style={styles.chatMetaRow}>
            <Text style={[styles.chatSender, { color: colors.textPrimary }]}>Rohan_07</Text>
            <View style={[styles.leaderBadge, { backgroundColor: colors.primarySubtle }]}>
              <Text style={[styles.leaderBadgeText, { color: colors.primary }]}>Leader</Text>
            </View>
            <Text style={[styles.chatTime, { color: colors.textMuted }]}>2h ago</Text>
          </View>
          <Text style={[styles.chatMsg, { color: colors.textSecondary }]}>Let's finish the raid tonight! 🔥</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 24,
    gap: spacing.lg,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    padding: 4,
  },
  screenTitle: {
    fontSize: fontSize.title + 2,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guildHero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  guildBg: {
    padding: spacing.md + 2,
  },
  guildBgImg: {
    opacity: 0.35,
    resizeMode: 'cover',
  },
  heroScrim: {
    ...StyleSheet.absoluteFill,
  },
  guildHeroContent: {
    position: 'relative',
  },
  guildBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  crestIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guildNameCol: {
    flex: 1,
    gap: 2,
  },
  guildName: {
    fontSize: fontSize.title,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  guildStats: {
    fontSize: 11,
    fontWeight: '800',
  },
  guildMotto: {
    fontSize: 10,
    fontWeight: '600',
  },
  guildAuraPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  auraPillLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  auraPillVal: {
    fontSize: 13,
    fontWeight: '900',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBox: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  bossCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bossBg: {
    padding: spacing.lg,
  },
  bossBgImg: {
    opacity: 0.3,
    resizeMode: 'cover',
  },
  bossContent: {
    position: 'relative',
    gap: spacing.sm,
  },
  bossTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  raidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  raidBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bossName: {
    fontSize: fontSize.title + 1,
    fontWeight: '900',
  },
  bossBarSection: {
    gap: 4,
    marginTop: 4,
  },
  bossBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bossBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  damageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  damageLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  damagePct: {
    fontSize: 12,
    fontWeight: '900',
  },
  raidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  raidBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.title - 1,
    fontWeight: '800',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  leaderboardList: {
    gap: spacing.sm,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm + 2,
  },
  rankBadgeNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumText: {
    fontSize: 12,
    fontWeight: '900',
  },
  leaderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  guildInfoCol: {
    flex: 1,
    gap: 2,
  },
  guildRowName: {
    fontSize: 14,
    fontWeight: '800',
  },
  auraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  auraScore: {
    fontSize: 12,
    fontWeight: '700',
  },
  membersCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chatSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
  },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  chatBubbleCol: {
    flex: 1,
    gap: 3,
  },
  chatMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatSender: {
    fontSize: 13,
    fontWeight: '800',
  },
  leaderBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leaderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  chatTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  chatMsg: {
    fontSize: 13,
    fontWeight: '600',
  },
});
