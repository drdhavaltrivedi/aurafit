import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';

interface ProgressBarProps {
  /** 0-100 */
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const anim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (reducedMotion) {
      anim.stopAnimation();
      anim.setValue(clamped);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: clamped,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      // width cannot use the native driver
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [anim, clamped, reducedMotion]);

  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: colors.primaryStrong }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
