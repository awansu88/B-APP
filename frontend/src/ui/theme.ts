/**
 * Dark, tablet-first theme tokens for the B-APP shell.
 */
export const colors = {
  background: '#0B0F14',
  surface: '#131A22',
  surfaceRaised: '#1B242E',
  border: '#26313D',
  railActive: '#1F6FEB',
  railActiveSurface: '#12253F',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B98A5',
  textMuted: '#5B6672',
  player: '#3B82F6',
  banker: '#EF4444',
  tie: '#22C55E',
  accent: '#1F6FEB',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
