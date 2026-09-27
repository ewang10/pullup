/**
 * Chart styling shared by dashboard pages. Colors meet WCAG AA against the
 * white card background: series >= 3:1 (non-text graphics), axis labels
 * >= 4.5:1 (text). Series also differ by dash pattern, not only color.
 */

export const CHART_COLORS = {
  primary: '#5B53EE', // 5.4:1 on white
  secondary: '#047857', // 5.5:1 on white
};

export const CHART_AXIS = {
  text: '#4B5563', // gray-600, 7.6:1 on white
  line: '#6B7280', // gray-500
  grid: '#E5E7EB', // gray-200, decorative
};

export const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: '#1A1A2E',
    border: 'none',
    borderRadius: '8px',
    color: '#FFFFFF',
  },
  labelStyle: { color: '#FFFFFF' },
  itemStyle: { color: '#FFFFFF' },
};
