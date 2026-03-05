export const theme = {
  colors: {
    // Primary Brand Colors
    primary: '#2563EB', // Blue 600 - Main Actions, Active States
    primaryDark: '#1D4ED8', // Blue 700 - Press States
    primaryLight: '#DBEAFE', // Blue 100 - Backgrounds, Highlights

    // Secondary/Accent Colors
    secondary: '#0EA5A8', // Teal 500 - Success, Active Tab
    secondaryDark: '#0D9488', // Teal 600
    secondaryLight: '#CCFBF1', // Teal 100

    // Semantic Colors
    success: '#10B981', // Emerald 500
    warning: '#F59E0B', // Amber 500
    error: '#EF4444', // Red 500
    info: '#3B82F6', // Blue 500

    // Neutrals
    background: '#F8FAFC', // Slate 50 - Page Background
    surface: '#FFFFFF', // White - Cards, Modals
    text: '#111827', // Gray 900 - Headings, Body
    textSecondary: '#4B5563', // Gray 600 - Subtitles
    textTertiary: '#9CA3AF', // Gray 400 - Placeholders, Disabled
    border: '#E5E7EB', // Gray 200 - Dividers, Borders
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  typography: {
    h1: { fontSize: 30, fontWeight: 'bold', lineHeight: 36, color: '#111827' },
    h2: { fontSize: 24, fontWeight: 'bold', lineHeight: 32, color: '#111827' },
    h3: { fontSize: 20, fontWeight: '600', lineHeight: 28, color: '#111827' },
    body: { fontSize: 16, lineHeight: 24, color: '#4B5563' },
    caption: { fontSize: 14, lineHeight: 20, color: '#6B7280' },
    small: { fontSize: 12, lineHeight: 16, color: '#9CA3AF' },
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
  },
};
