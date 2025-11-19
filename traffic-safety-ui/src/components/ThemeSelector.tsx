import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeSelector: React.FC = () => {
  const { theme, themeName, setTheme, availableThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themeIcons: Record<string, string> = {
    dark: '🌙',
    light: '☀️',
    neon: '⚡',
    military: '🪖',
    corporate: '🏢'
  };

  const themeDescriptions: Record<string, string> = {
    dark: 'Professional dark interface with blue accents',
    light: 'Clean light interface with subtle shadows',
    neon: 'Futuristic cyberpunk style with glowing effects',
    military: 'Tactical military theme with gold highlights',
    corporate: 'Business corporate style with blue tones'
  };

  return (
    <div className="relative">
      {/* Theme Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium transition-all duration-300 hover:scale-105"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.primary,
          color: theme.colors.text,
          boxShadow: `0 4px 12px ${theme.colors.primary}20`
        }}
      >
        <span className="text-lg">{themeIcons[themeName]}</span>
        <span className="text-sm font-medium">{theme.name}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Theme Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-3 w-72 rounded-xl border-2 shadow-2xl z-50 backdrop-blur-xl"
          style={{
            backgroundColor: theme.colors.glass,
            borderColor: theme.colors.primary,
            boxShadow: theme.colors.shadow,
            backdropFilter: 'blur(20px) saturate(180%)'
          }}
        >
          <div className="p-3">
            <h3 className="text-sm font-semibold mb-3" style={{ color: theme.colors.text }}>
              Choose Theme
            </h3>
            <div className="space-y-2">
              {availableThemes.map((themeKey) => {
                const themeConfig = availableThemes.includes(themeKey) ? 
                  Object.values(availableThemes).find(t => t === themeKey) : null;
                
                return (
                  <button
                    key={themeKey}
                    onClick={() => {
                      setTheme(themeKey);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-300 hover:scale-105 ${
                      themeName === themeKey ? 'ring-2 ring-offset-2' : 'hover:bg-surface-secondary'
                    }`}
                    style={{
                      backgroundColor: themeName === themeKey ? theme.colors.primary + '20' : 'transparent',
                      color: theme.colors.text,
                      ringColor: theme.colors.primary,
                      border: themeName === themeKey ? `2px solid ${theme.colors.primary}` : '2px solid transparent'
                    }}
                  >
                    <span className="text-xl">{themeIcons[themeKey]}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {availableThemes.includes(themeKey) ? 
                          Object.values(availableThemes).find(t => t === themeKey) : themeKey}
                      </div>
                      <div className="text-xs opacity-70">
                        {themeDescriptions[themeKey]}
                      </div>
                    </div>
                    {themeName === themeKey && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default ThemeSelector;
