export const palettes = {
  light: {
    primary: '#4F46E5', // Indigo 600
    primaryLight: '#818CF8', // Indigo 400
    primaryDark: '#3730A3', // Indigo 800
    secondary: '#10B981', // Emerald 500
    accent: '#F59E0B', // Amber 500
    danger: '#EF4444', // Red 500
    success: '#10B981', // Emerald 500
    warning: '#F59E0B', // Amber 500
    info: '#3B82F6', // Blue 500
    
    bg: '#F9FAFB', // Gray 50
    surface: '#FFFFFF',
    surfaceAlt: '#F3F4F6', // Gray 100
    
    border: '#E5E7EB', // Gray 200
    borderDark: '#D1D5DB', // Gray 300
    
    text: '#111827', // Gray 900
    textSecondary: '#4B5563', // Gray 600
    textMuted: '#9CA3AF', // Gray 400
    textInverted: '#FFFFFF',
    
    sidebar: '#1E293B', // Slate 800
    sidebarText: '#F8FAFC', // Slate 50
    sidebarActive: '#334155', // Slate 700
  },
  dark: {
    primary: '#818CF8', // Indigo 400
    primaryLight: '#A5B4FC', // Indigo 300
    primaryDark: '#4F46E5', // Indigo 600
    secondary: '#34D399', // Emerald 400
    accent: '#FBBF24', // Amber 400
    danger: '#F87171', // Red 400
    success: '#34D399', // Emerald 400
    warning: '#FBBF24', // Amber 400
    info: '#60A5FA', // Blue 400
    
    bg: '#0F172A', // Slate 900
    surface: '#1E293B', // Slate 800
    surfaceAlt: '#334155', // Slate 700
    
    border: '#374151', // Slate 700
    borderDark: '#4B5563', // Slate 600
    
    text: '#F9FAFB', // Gray 50
    textSecondary: '#D1D5DB', // Gray 300
    textMuted: '#9CA3AF', // Gray 400
    textInverted: '#111827',
    
    sidebar: '#0F172A', // Slate 900
    sidebarText: '#F8FAFC',
    sidebarActive: '#1E293B',
  }
};

export function getTokens(mode = 'light') {
  const p = palettes[mode] || palettes.light;
  return {
    colors: p,
    spacing: {
      xxs: 2,
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
    radius: {
      xs: 4,
      sm: 6,
      md: 8,
      lg: 12,
      xl: 16,
      full: 9999,
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    },
    typography: {
      fontFamily: {
        sans: 'Inter, system-ui, -apple-system, sans-serif',
        mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
      sizes: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        xxl: 24,
        xxxl: 30,
        display: 36,
      },
      weights: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      }
    },
    breakpoints: {
      mobile: 0,
      tablet: 768,
      desktop: 1024,
      wide: 1280,
    }
  };
}
