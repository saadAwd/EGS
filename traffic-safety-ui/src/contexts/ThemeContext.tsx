import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    surfaceSecondary: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    borderSecondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    accent: string;
    accentHover: string;
    glass: string;
    glassBorder: string;
    shadow: string;
  };
  effects: {
    glow: string;
    pulse: string;
    gradient: string;
  };
}

export const THEMES: Record<string, Theme> = {
  dark: {
    name: 'Dark Professional',
    colors: {
      primary: '#3b82f6',
      secondary: '#1e40af',
      background: '#0a0e1a',
      surface: '#1e293b',
      surfaceSecondary: '#334155',
      text: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#64748b',
      border: '#475569',
      borderSecondary: '#334155',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#06b6d4',
      accent: '#8b5cf6',
      accentHover: '#7c3aed',
      glass: 'rgba(15, 23, 42, 0.95)',
      glassBorder: 'rgba(59, 130, 246, 0.2)',
      shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.1)'
    },
    effects: {
      glow: '0 0 30px rgba(59, 130, 246, 0.6), 0 0 60px rgba(59, 130, 246, 0.3)',
      pulse: '0 0 0 0 rgba(59, 130, 246, 0.7)',
      gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
    }
  },
  light: {
    name: 'Light Clean',
    colors: {
      primary: '#2563eb',
      secondary: '#1d4ed8',
      background: '#fafbfc',
      surface: '#ffffff',
      surfaceSecondary: '#f8fafc',
      text: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
      border: '#e2e8f0',
      borderSecondary: '#cbd5e1',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
      info: '#0891b2',
      accent: '#7c3aed',
      accentHover: '#6d28d9',
      glass: 'rgba(255, 255, 255, 0.95)',
      glassBorder: 'rgba(37, 99, 235, 0.15)',
      shadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(37, 99, 235, 0.05)'
    },
    effects: {
      glow: '0 0 25px rgba(37, 99, 235, 0.4), 0 0 50px rgba(37, 99, 235, 0.2)',
      pulse: '0 0 0 0 rgba(37, 99, 235, 0.4)',
      gradient: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%)'
    }
  },
  neon: {
    name: 'Neon Cyber',
    colors: {
      primary: '#00ffff',
      secondary: '#06b6d4',
      background: '#000000',
      surface: '#0a0a0f',
      surfaceSecondary: '#1a1a2e',
      text: '#00ffff',
      textSecondary: '#22d3ee',
      textMuted: '#4a5568',
      border: '#00ffff',
      borderSecondary: '#06b6d4',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff0040',
      info: '#00ffff',
      accent: '#ff00ff',
      accentHover: '#cc00cc',
      glass: 'rgba(0, 0, 0, 0.95)',
      glassBorder: 'rgba(0, 255, 255, 0.4)',
      shadow: '0 0 40px rgba(0, 255, 255, 0.5), 0 0 80px rgba(0, 255, 255, 0.2), inset 0 0 20px rgba(0, 255, 255, 0.1)'
    },
    effects: {
      glow: '0 0 40px rgba(0, 255, 255, 0.9), 0 0 80px rgba(0, 255, 255, 0.4), 0 0 120px rgba(0, 255, 255, 0.2)',
      pulse: '0 0 0 0 rgba(0, 255, 255, 0.7)',
      gradient: 'linear-gradient(135deg, #000000 0%, #0a0a0f 30%, #1a1a2e 100%)'
    }
  },
  military: {
    name: 'Military Tactical',
    colors: {
      primary: '#ffd700',
      secondary: '#ffaa00',
      background: '#0d1b0d',
      surface: '#1a2e1a',
      surfaceSecondary: '#2d4a2d',
      text: '#ffd700',
      textSecondary: '#ffed4e',
      textMuted: '#9ca3af',
      border: '#ffd700',
      borderSecondary: '#ffaa00',
      success: '#00ff00',
      warning: '#ffd700',
      error: '#ff4444',
      info: '#00aaff',
      accent: '#ff6600',
      accentHover: '#ff4400',
      glass: 'rgba(13, 27, 13, 0.95)',
      glassBorder: 'rgba(255, 215, 0, 0.4)',
      shadow: '0 0 30px rgba(255, 215, 0, 0.4), 0 0 60px rgba(255, 215, 0, 0.2), inset 0 0 15px rgba(255, 215, 0, 0.1)'
    },
    effects: {
      glow: '0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.4), 0 0 90px rgba(255, 215, 0, 0.2)',
      pulse: '0 0 0 0 rgba(255, 215, 0, 0.7)',
      gradient: 'linear-gradient(135deg, #0d1b0d 0%, #1a2e1a 30%, #2d4a2d 100%)'
    }
  },
  corporate: {
    name: 'Corporate Blue',
    colors: {
      primary: '#1e40af',
      secondary: '#1e3a8a',
      background: '#f8fafc',
      surface: '#ffffff',
      surfaceSecondary: '#f1f5f9',
      text: '#1e293b',
      textSecondary: '#475569',
      textMuted: '#64748b',
      border: '#cbd5e1',
      borderSecondary: '#94a3b8',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
      info: '#0284c7',
      accent: '#7c3aed',
      accentHover: '#6d28d9',
      glass: 'rgba(255, 255, 255, 0.95)',
      glassBorder: 'rgba(30, 64, 175, 0.15)',
      shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(30, 64, 175, 0.08)'
    },
    effects: {
      glow: '0 0 25px rgba(30, 64, 175, 0.4), 0 0 50px rgba(30, 64, 175, 0.2)',
      pulse: '0 0 0 0 rgba(30, 64, 175, 0.4)',
      gradient: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%)'
    }
  }
};

interface ThemeContextType {
  theme: Theme;
  themeName: string;
  setTheme: (themeName: string) => void;
  availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeName, setThemeName] = useState<string>(() => {
    const saved = localStorage.getItem('theme');
    return saved && THEMES[saved] ? saved : 'dark';
  });

  const theme = THEMES[themeName];

  const setTheme = (newThemeName: string) => {
    if (THEMES[newThemeName]) {
      setThemeName(newThemeName);
      localStorage.setItem('theme', newThemeName);
    }
  };

  const availableThemes = Object.keys(THEMES);

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    
    // Set CSS custom properties
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
    Object.entries(theme.effects).forEach(([key, value]) => {
      root.style.setProperty(`--effect-${key}`, value);
    });
    
    // Apply theme class to body
    body.className = body.className.replace(/theme-\w+/g, '');
    body.classList.add(`theme-${themeName}`);
  }, [theme, themeName]);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};
