import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius, space, toneColors, type Tone } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Pill({ tone, icon, label }: { tone: Tone; icon?: IconName; label: string }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {icon && <Ionicons name={icon} size={14} color={c.fg} />}
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, icon, title, children }: { tone: Tone; icon: IconName; title: string; children?: ReactNode }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.fg + '33' }]} accessibilityRole="alert">
      <Ionicons name={icon} size={20} color={c.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: c.fg }]}>{title}</Text>
        {children ? <Text style={[styles.bannerBody, { color: colors.text }]}>{children}</Text> : null}
      </View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: '#FFFFFF', border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primaryDark, border: colors.border },
    danger: { bg: colors.surface, fg: colors.danger, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primaryDark, border: 'transparent' },
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={palette.fg} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: font.small, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: space.md,
  },
  bannerTitle: { fontSize: 14, fontWeight: '700' },
  bannerBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  button: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
