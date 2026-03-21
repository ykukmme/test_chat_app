import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const dark = {
  mode: 'dark',
  bg:        '#0e0e10',
  bg2:       '#17171a',
  bg3:       '#1f1f23',
  bg4:       '#2a2a2f',
  border:    'rgba(255,255,255,0.07)',
  border2:   'rgba(255,255,255,0.13)',
  text:      '#f0f0f2',
  text2:     '#9898a8',
  text3:     '#5a5a6a',
  accent:    '#7c6aff',
  accent2:   '#a896ff',
  accentBg:  'rgba(124,106,255,0.14)',
  green:     '#3ecf8e',
  red:       '#ff5c5c',
  bubble:    '#1f1f23',
  bubbleTxt: '#f0f0f2',
  myBubble:  '#7c6aff',
  myBubbleTxt: '#ffffff',
  statusBar: 'light',
};

export const light = {
  mode: 'light',
  bg:        '#f5f5f7',
  bg2:       '#ffffff',
  bg3:       '#ebebed',
  bg4:       '#dcdce0',
  border:    'rgba(0,0,0,0.08)',
  border2:   'rgba(0,0,0,0.14)',
  text:      '#111113',
  text2:     '#555560',
  text3:     '#9898a8',
  accent:    '#6254e8',
  accent2:   '#8070f0',
  accentBg:  'rgba(98,84,232,0.10)',
  green:     '#1a9e62',
  red:       '#d93535',
  bubble:    '#ffffff',
  bubbleTxt: '#111113',
  myBubble:  '#6254e8',
  myBubbleTxt: '#ffffff',
  statusBar: 'dark',
};

const ThemeContext = createContext({ theme: dark, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(dark);

  useEffect(() => {
    AsyncStorage.getItem('theme').then(val => {
      if (val === 'light') setTheme(light);
    });
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev.mode === 'dark' ? light : dark;
      AsyncStorage.setItem('theme', next.mode);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
