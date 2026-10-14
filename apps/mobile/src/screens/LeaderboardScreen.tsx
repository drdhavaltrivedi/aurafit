import React, { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { FormMessage } from '../components/AuthLayout';
import { SampleDataTag } from '../components/DataNotice';
import { ScreenFrame } from '../components/ScreenFrame';
import type { PublicHunter } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, spacing } from '../theme/tokens';
import { HunterRow } from './AdminScreen';

export interface LeaderboardData {
  hunters: PublicHunter[];
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  refetch: () => void;
  /** Demo mode: seed hunters, labelled as sample data. */
  sample: boolean;
}

interface Props {
  data: LeaderboardData;
  currentUserId: string;
  onBack: () => void;
}

/** Global top hunters by aura (GET /api/v1/leaderboard in signed-in mode). */
export function LeaderboardScreen({ data, currentUserId, onBack }: Props) {
  const { colors } = useTheme();
  const { hunters, loading, error, refetch, sample } = data;
  const yourIndex = hunters.findIndex((h) => h.id === currentUserId);

  // Aura changes all the time; refresh whenever the board is opened.
  useEffect(() => {
    if (!sample) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenFrame
      title="Top rankings"
      subtitle={sample ? 'Sample leaderboard' : 'Live global leaderboard by aura'}
      onBack={onBack}
      backLabel="Close leaderboard"
      testID="leaderboard-screen"
      refreshControl={
        sample ? undefined : (
          <RefreshControl refreshing={!!data.refreshing} onRefresh={refetch} tintColor={colors.primary} />
        )
      }
    >
      {sample ? <SampleDataTag /> : null}
      {error ? (
        <>
          <FormMessage tone="error" message={error} />
          <AppButton label="Try again" variant="secondary" onPress={refetch} />
        </>
      ) : null}
      {!error && loading && hunters.length === 0 ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading leaderboard" />
      ) : null}
      {!error && !loading && hunters.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No hunters on the board yet.</Text>
      ) : null}
      {hunters.length > 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]} testID="leaderboard-your-position">
          {yourIndex >= 0 ? `You're #${yourIndex + 1} of ${hunters.length} shown.` : `You're not in the top ${hunters.length} yet — keep earning aura.`}
        </Text>
      ) : null}
      <View style={styles.list}>
        {hunters.map((h, i) => (
          <HunterRow key={h.id} hunter={h} position={i + 1} isYou={h.id === currentUserId} />
        ))}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  muted: {
    fontSize: fontSize.body,
  },
});
