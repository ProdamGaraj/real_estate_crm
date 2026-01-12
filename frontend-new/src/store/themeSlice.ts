import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
}

// Проверяем системную настройку темы при первом запуске
const getInitialTheme = (): ThemeMode => {
  // Сначала проверяем сохраненную настройку пользователя
  const savedTheme = localStorage.getItem('themeMode') as ThemeMode;
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  
  // Если нет сохраненной настройки, определяем по системным предпочтениям
  try {
    if (window.matchMedia) {
      // Проверяем, предпочитает ли пользователь светлую тему
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
      // Проверяем, предпочитает ли пользователь тёмную тему
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
  } catch (e) {
    // В случае ошибки используем тёмную тему по умолчанию
    console.warn('Не удалось определить системную тему:', e);
  }
  
  // По умолчанию — тёмная тема
  return 'dark';
};

const initialState: ThemeState = {
  mode: getInitialTheme(),
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
      localStorage.setItem('themeMode', action.payload);
    },
    toggleTheme: (state) => {
      state.mode = state.mode === 'light' ? 'dark' : 'light';
      localStorage.setItem('themeMode', state.mode);
    },
  },
});

export const { setThemeMode, toggleTheme } = themeSlice.actions;
export default themeSlice.reducer;
