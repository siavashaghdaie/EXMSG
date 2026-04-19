import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  themeMode: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
}

function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      effectiveTheme: resolveEffectiveTheme('system'),
      notificationsEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,

      setThemeMode: (mode: ThemeMode) => {
        set({
          themeMode: mode,
          effectiveTheme: resolveEffectiveTheme(mode),
        });
      },

      setNotificationsEnabled: (enabled: boolean) => {
        set({ notificationsEnabled: enabled });
      },

      setSoundEnabled: (enabled: boolean) => {
        set({ soundEnabled: enabled });
      },

      setVibrationEnabled: (enabled: boolean) => {
        set({ vibrationEnabled: enabled });
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        notificationsEnabled: state.notificationsEnabled,
        soundEnabled: state.soundEnabled,
        vibrationEnabled: state.vibrationEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Recompute effective theme on rehydration
          state.effectiveTheme = resolveEffectiveTheme(state.themeMode);
        }
      },
    }
  )
);

// Listen for system appearance changes when themeMode is 'system'
Appearance.addChangeListener(({ colorScheme }) => {
  const { themeMode } = useSettingsStore.getState();
  if (themeMode === 'system') {
    useSettingsStore.setState({
      effectiveTheme: colorScheme === 'dark' ? 'dark' : 'light',
    });
  }
});
