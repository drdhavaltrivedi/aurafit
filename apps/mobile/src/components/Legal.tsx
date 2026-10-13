import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { HeartPulse } from './icons';
import { siteUrl } from '../config/env';
import { HEALTH_DISCLAIMER, LEGAL_TITLES, legalUrl, type LegalDoc } from '../lib/legal';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, spacing } from '../theme/tokens';
import { AppIcon } from './AppIcon';

export const legalLinksAvailable = legalUrl(siteUrl, 'terms') !== null;

/** Opens a legal page in the in-app browser (SFSafariViewController / Custom Tabs). */
export async function openLegalPage(doc: LegalDoc): Promise<void> {
  const url = legalUrl(siteUrl, doc);
  if (!url) {
    Alert.alert(LEGAL_TITLES[doc], 'This page is not available in this build.');
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // No in-app browser available (rare): fall back to the system browser.
    Linking.openURL(url).catch(() => Alert.alert(LEGAL_TITLES[doc], `Open ${url} in your browser.`));
  }
}

/**
 * Sentence with inline Terms / Privacy links, e.g. "By creating an account you agree to the …".
 * Nested <Text> links are exposed as links to VoiceOver (rotor) and TalkBack.
 */
export function LegalAgreement({ prefix }: { prefix: string }) {
  const { colors } = useTheme();
  const link = (doc: LegalDoc, label: string) =>
    legalLinksAvailable ? (
      <Text
        accessibilityRole="link"
        accessibilityHint={`Opens the ${LEGAL_TITLES[doc]} in a browser`}
        onPress={() => void openLegalPage(doc)}
        style={[styles.inlineLink, { color: colors.primary }]}
        suppressHighlighting={false}
      >
        {label}
      </Text>
    ) : (
      label
    );
  return (
    <Text style={[styles.small, { color: colors.textMuted }]} maxFontSizeMultiplier={1.6}>
      {prefix} {link('terms', 'Terms of Service')} and {link('privacy', 'Privacy Policy')}.
    </Text>
  );
}

/** Standalone "Terms of Service · Privacy Policy" link row (renders nothing without a site URL). */
export function LegalLinks({ align = 'center' }: { align?: 'center' | 'flex-start' }) {
  const { colors } = useTheme();
  if (!legalLinksAvailable) return null;
  return (
    <View style={[styles.row, { justifyContent: align }]}>
      {(['terms', 'privacy'] as const).map((doc, i) => (
        <React.Fragment key={doc}>
          {i > 0 ? (
            <Text style={[styles.small, { color: colors.textMuted }]} accessible={false}>
              ·
            </Text>
          ) : null}
          <Pressable
            onPress={() => void openLegalPage(doc)}
            accessibilityRole="link"
            accessibilityLabel={LEGAL_TITLES[doc]}
            accessibilityHint="Opens in a browser"
            hitSlop={4}
            style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.small, styles.inlineLink, { color: colors.primary }]} maxFontSizeMultiplier={1.6}>
              {LEGAL_TITLES[doc]}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

export function HealthDisclaimer({ align = 'center' }: { align?: 'center' | 'left' }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.disclaimerRow, { justifyContent: align === 'center' ? 'center' : 'flex-start' }]}
      accessible
      accessibilityLabel={`Health notice: ${HEALTH_DISCLAIMER}`}
    >
      <View style={styles.disclaimerIcon}>
        <AppIcon icon={HeartPulse} size={fontSize.caption + 2} color={colors.textMuted} />
      </View>
      <Text
        style={[styles.small, styles.disclaimerText, { color: colors.textMuted, textAlign: align }]}
        maxFontSizeMultiplier={1.6}
      >
        {HEALTH_DISCLAIMER}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * 1.5,
    textAlign: 'center',
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  // Centres the icon on the first line of text (line height = caption * 1.5).
  disclaimerIcon: {
    height: fontSize.caption * 1.5,
    justifyContent: 'center',
  },
  disclaimerText: {
    flexShrink: 1,
  },
  inlineLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkBtn: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
});
