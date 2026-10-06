import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, R } from '@/constants/theme';

/* ───────────── Typography ───────────── */

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[s.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/* ───────────── Layout ───────────── */

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  padded = true,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  onRefresh?: () => void | Promise<unknown>;
  refreshing?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const [pulling, setPulling] = useState(false);
  const handleRefresh = onRefresh
    ? async () => {
        setPulling(true);
        try {
          await onRefresh();
        } finally {
          setPulling(false);
        }
      }
    : undefined;
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={[padded && s.screenPad, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          handleRefresh ? (
            <RefreshControl refreshing={refreshing || pulling} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} />
          ) : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={s.pageHeader}>
      <View style={{ flex: 1 }}>
        <H1>{title}</H1>
        {subtitle ? <Muted style={{ marginTop: 4 }}>{subtitle}</Muted> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function IconBox({ icon: Icon, color = C.primary, bg, size = 40, iconSize = 20, radius = R.md }: {
  icon: LucideIcon;
  color?: string;
  bg?: string;
  size?: number;
  iconSize?: number;
  radius?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg ?? `${color}15`, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={iconSize} color={color} />
    </View>
  );
}

/* ───────────── Button ───────────── */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  size = 'md',
  style,
  full,
}: {
  title?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const v = buttonVariants[variant];
  const pad = size === 'sm' ? { paddingVertical: 7, paddingHorizontal: 12 } : size === 'lg' ? { paddingVertical: 14, paddingHorizontal: 24 } : { paddingVertical: 11, paddingHorizontal: 18 };
  const fontSize = size === 'sm' ? 12 : 14;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.btn,
        pad,
        { backgroundColor: pressed && !isDisabled ? v.pressed : v.bg, borderColor: v.border },
        full && { alignSelf: 'stretch' },
        isDisabled && { opacity: 0.5 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : Icon ? <Icon size={fontSize + 2} color={v.fg} /> : null}
      {title ? <Text style={[s.btnText, { color: v.fg, fontSize }]}>{title}</Text> : null}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: C.primary, pressed: C.primaryHover, fg: C.white, border: C.primary },
  outline: { bg: C.white, pressed: C.gray50, fg: C.gray700, border: C.gray200 },
  ghost: { bg: 'transparent', pressed: C.gray100, fg: C.gray600, border: 'transparent' },
  danger: { bg: C.red50, pressed: C.red200, fg: C.red600, border: C.red200 },
  success: { bg: C.white, pressed: C.emerald50, fg: C.emerald600, border: C.emerald200 },
};

/* ───────────── Badge / Progress ───────────── */

export function Badge({ label, color = C.gray500, bg = C.white, border = C.gray200, style }: { label: string; color?: string; bg?: string; border?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.badge, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[s.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, height = 6, color = C.primary, track = C.gray100 }: { value: number; height?: number; color?: string; track?: string }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

/* ───────────── Inputs ───────────── */

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.gray400}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[s.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, focused && s.inputFocused, style]}
      />
    </View>
  );
}

export function Select<T extends string>({ value, options, onChange, icon: Icon, style }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[s.select, style]}>
        {Icon ? <Icon size={15} color={C.gray400} /> : null}
        <Text style={s.selectText} numberOfLines={1}>
          {current?.label}
        </Text>
        <ChevronDown size={15} color={C.gray400} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            style={({ pressed }) => [s.option, pressed && { backgroundColor: C.gray50 }]}>
            <Text style={[s.optionText, o.value === value && { color: C.primary, fontWeight: '600' }]}>{o.label}</Text>
            {o.value === value ? <Check size={18} color={C.primary} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </>
  );
}

export function BottomSheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.sheetHandle} />
        {title ? <Text style={[s.h2, { paddingHorizontal: 20, marginBottom: 8 }]}>{title}</Text> : null}
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ───────────── Tabs (shadcn TabsList look) ───────────── */

export function SegmentedTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ marginBottom: 16 }}>
      <View style={s.tabs}>
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <Pressable
              key={t.value}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(t.value);
              }}
              style={[s.tab, active && s.tabActive]}>
              <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ───────────── Composite ───────────── */

export function StatCard({ title, value, icon, color = C.primary, style }: { title: string; value: string | number; icon: LucideIcon; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[{ flex: 1, padding: 16 }, style]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.statTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.statValue}>{value}</Text>
        </View>
        <IconBox icon={icon} color={color} size={36} iconSize={18} />
      </Row>
    </Card>
  );
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: { icon?: LucideIcon; title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      {icon ? <IconBox icon={icon} color={C.gray300} bg={C.gray50} size={64} iconSize={28} radius={R.lg} /> : null}
      <Text style={[s.h2, { fontSize: 18, marginTop: 18, textAlign: 'center' }]}>{title}</Text>
      {description ? <Muted style={{ textAlign: 'center', marginTop: 4, maxWidth: 300 }}>{description}</Muted> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={{ marginTop: 20 }} /> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = R.md, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: C.gray100, opacity }, style]} />;
}

export function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'dashboard' | 'detail' }) {
  return (
    <Screen>
      <Skeleton height={28} width="60%" />
      <Skeleton height={14} width="40%" style={{ marginTop: 10, marginBottom: 24 }} />
      {variant === 'dashboard' ? (
        <View style={{ gap: 12, marginBottom: 24 }}>
          <Row gap={12}>
            <Skeleton height={86} style={{ flex: 1 }} width={undefined as any} radius={R.lg} />
            <Skeleton height={86} style={{ flex: 1 }} width={undefined as any} radius={R.lg} />
          </Row>
          <Row gap={12}>
            <Skeleton height={86} style={{ flex: 1 }} width={undefined as any} radius={R.lg} />
            <Skeleton height={86} style={{ flex: 1 }} width={undefined as any} radius={R.lg} />
          </Row>
        </View>
      ) : null}
      {variant === 'detail' ? <Skeleton height={200} radius={R.lg} style={{ marginBottom: 16 }} /> : null}
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={variant === 'detail' ? 60 : 220} radius={R.lg} style={{ marginBottom: 14 }} />
      ))}
    </Screen>
  );
}

export function Banner({ tone, icon: Icon, title, description }: { tone: 'amber' | 'red' | 'green' | 'blue'; icon?: LucideIcon; title: string; description?: string }) {
  const t = {
    amber: { bg: C.amber50, border: C.amber200, fg: C.amber800, sub: C.amber600 },
    red: { bg: C.red50, border: C.red200, fg: C.red600, sub: C.red500 },
    green: { bg: C.emerald50, border: C.emerald200, fg: C.emerald700, sub: C.emerald600 },
    blue: { bg: C.blue50, border: C.blue100, fg: C.blue900, sub: C.blue700 },
  }[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: R.md, padding: 14, flexDirection: 'row', gap: 10 }}>
      {Icon ? <Icon size={17} color={t.fg} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.fg, fontSize: 14, fontWeight: '500' }}>{title}</Text>
        {description ? <Text style={{ color: t.sub, fontSize: 12, marginTop: 2 }}>{description}</Text> : null}
      </View>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 12, marginTop: 8 }}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </Row>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  screenPad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '600', color: C.black, letterSpacing: -0.5 },
  h2: { fontSize: 16, fontWeight: '600', color: C.black },
  muted: { fontSize: 14, color: C.gray500 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: C.black },
  pageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.gray100, padding: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: R.md, borderWidth: 1 },
  btnText: { fontWeight: '500' },
  badge: { borderWidth: 1, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '500', color: C.gray700 },
  input: { borderWidth: 1, borderColor: C.gray200, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.black, backgroundColor: C.white },
  inputFocused: { borderColor: C.primary },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.gray200, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.white },
  selectText: { flex: 1, fontSize: 14, color: C.black },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 8, paddingBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200, alignSelf: 'center', marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 15, color: C.gray700 },
  tabs: { flexDirection: 'row', backgroundColor: C.gray100, borderRadius: R.md, padding: 4, gap: 2, flexGrow: 1 },
  tab: { flexGrow: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: R.sm },
  tabActive: { backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 12, fontWeight: '500', color: C.gray500 },
  tabTextActive: { color: C.black },
  statTitle: { fontSize: 13, color: C.gray500, fontWeight: '500' },
  statValue: { fontSize: 26, fontWeight: '600', color: C.black, marginTop: 2, letterSpacing: -0.5 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
});
