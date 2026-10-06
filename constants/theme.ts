export const colors = {
  bg: '#050B14',
  panel: '#0B1422',
  card: '#0B1728',
  cardLight: '#0F1E30',

  line: '#17283B',
  border: '#1B354D',

  accent: '#00E5FF',
  accentDark: '#00AFC7',
  accentSoft: 'rgba(0, 229, 255, 0.14)',

  text: '#EAF7FF',
  white: '#FFFFFF',
  muted: '#8195A8',

  success: '#36E0A1',
  danger: '#FF5C7A',
  medium: '#FFC857',

  warning: '#FFC857',
  info: '#58A6FF',

  input: '#08111D',
  overlay: 'rgba(0, 229, 255, 0.08)',
}

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  round: 999,
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
}

// Type scale. Spread into a Text style, e.g. style={[type.title, { color }]}.
export const type = {
  display: { fontSize: 30, fontWeight: '900' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 16, fontWeight: '800' as const },
  body: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1.6 },
}

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
}

// Shared motion timings so screens feel consistent.
export const motion = {
  fast: 160,
  base: 320,
  slow: 600,
  stagger: 70,
}
