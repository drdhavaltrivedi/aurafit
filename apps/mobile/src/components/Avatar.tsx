import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/** Up to two initials from a display name ("Shadow Hunter" → "SH", "neo" → "N"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];
  return letters.join('').toUpperCase();
}

interface AvatarProps {
  name: string;
  /** Remote https image; falls back to initials when missing or failing to load. */
  url?: string | null;
  size?: number;
  /** Ring colour; defaults to the theme primary. */
  ringColor?: string;
}

/** The user's own photo when set, otherwise an initials avatar (never stock art). */
export function Avatar({ name, url, size = 48, ringColor }: AvatarProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!url && /^https:\/\//.test(url) && !failed;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, dim, { borderColor: ringColor ?? colors.primary, backgroundColor: colors.primarySubtle }]}
    >
      {showImage ? (
        <Image source={{ uri: url! }} style={styles.img} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <Text style={[styles.initials, { color: colors.primary, fontSize: Math.round(size * 0.38) }]} maxFontSizeMultiplier={1}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontWeight: '900',
  },
});
