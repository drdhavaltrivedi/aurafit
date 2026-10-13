import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Dumbbell, House, ScrollText, User, Users } from './icons';
import { fontSize, spacing } from '../theme/tokens';

export type MainTabKey = 'home' | 'quests' | 'workouts' | 'guild' | 'profile';

interface BottomTabBarProps {
  activeTab: MainTabKey;
  onSelectTab: (tab: MainTabKey) => void;
}

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps) {
  const { colors } = useTheme();

  const tabs = [
    { key: 'home' as const, label: 'Home', icon: House },
    { key: 'quests' as const, label: 'Quests', icon: ScrollText },
    { key: 'workouts' as const, label: 'Workouts', icon: Dumbbell },
    { key: 'guild' as const, label: 'Guild', icon: Users },
    { key: 'profile' as const, label: 'Profile', icon: User },
  ];

  return (
    <View style={[styles.bar, { backgroundColor: colors.bgSurface, borderTopColor: colors.border }]}>
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        const color = isActive ? colors.primary : colors.textMuted;

        return (
          <Pressable
            key={t.key}
            onPress={() => onSelectTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t.label}
            style={styles.tabItem}
          >
            <View style={styles.iconWrap}>
              <AppIcon icon={t.icon} size={22} color={color} strokeWidth={isActive ? 2.5 : 2} />
              {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
            </View>
            <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '800' : '600' }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 64,
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  tabLabel: {
    fontSize: fontSize.caption - 1,
  },
});
