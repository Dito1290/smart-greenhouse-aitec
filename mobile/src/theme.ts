export const colors = {
  bg: '#F5F6F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EB',
  border: '#DFE3DA',
  text: '#1B231E',
  textMuted: '#58625B',
  textFaint: '#7A847D',
  primary: '#2E7D4F',
  primaryDark: '#1E5A37',
  primarySoft: '#E3F1E8',
  warn: '#8A5300',
  warnSoft: '#FFF2DB',
  danger: '#B3261E',
  dangerSoft: '#FCE9E7',
  info: '#2B5B87',
  infoSoft: '#E6EFF7',
  neutral: '#5F6863',
  neutralSoft: '#ECEEEB',
  chartLine: '#2E7D4F',
  grid: '#E6E9E3',
};

export type Tone = 'good' | 'warn' | 'danger' | 'info' | 'neutral';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  good: { fg: colors.primaryDark, bg: colors.primarySoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  neutral: { fg: colors.neutral, bg: colors.neutralSoft },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
export const font = { small: 12, body: 15, label: 13, title: 20, value: 26 };
