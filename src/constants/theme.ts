/**
 * Design tokens mirrored from the Cognitrix website (Tailwind classes in cognitrix/src).
 * Primary teal #00a98d, page background #fafafa, white cards with gray-100 borders.
 */
export const C = {
  primary: '#00a98d',
  primaryHover: '#008f77',
  primaryDark: '#007a66',
  primary5: 'rgba(0,169,141,0.05)',
  primary10: 'rgba(0,169,141,0.10)',
  primary20: 'rgba(0,169,141,0.20)',
  primary30: 'rgba(0,169,141,0.30)',

  bg: '#fafafa',
  card: '#ffffff',
  black: '#000000',
  white: '#ffffff',

  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray900: '#111827',

  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',

  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',
  amber800: '#92400e',
  amber900: '#78350f',

  red50: '#fef2f2',
  red200: '#fecaca',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',

  orange50: '#fff7ed',
  orange100: '#ffedd5',
  orange200: '#fed7aa',
  orange500: '#f97316',
  orange600: '#ea580c',
  orange700: '#c2410c',
  orange900: '#7c2d12',

  purple50: '#faf5ff',
  purple100: '#f3e8ff',
  purple600: '#9333ea',
  purple700: '#7e22ce',
  purple900: '#581c87',

  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue900: '#1e3a8a',

  yellow50: '#fefce8',
  yellow500: '#eab308',
  yellow700: '#a16207',

  indigo: '#6366f1',
  violet: '#7c3aed',
} as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const;
