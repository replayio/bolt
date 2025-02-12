import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';
import { themeStore, kTheme } from '~/lib/stores/theme';
import type { UserProfile } from '~/components/@settings/core/types';
import { useStore } from '@nanostores/react';
import { shortcutsStore } from '~/lib/stores/settings';
import { isMac } from '~/utils/os';

// Helper to format shortcut key display
const formatShortcutKey = (key: string) => {
  if (key === '`') {
    return '`';
  }

  return key.toUpperCase();
};

// Helper to get modifier key symbols/text
const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? '⌘' : 'Win';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'ctrl':
      return isMac ? '⌃' : 'Ctrl';
    case 'shift':
      return '⇧';
    default:
      return modifier;
  }
};

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved
      ? JSON.parse(saved)
      : {
          theme: 'system',
          notifications: true,
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Apply theme when settings changes
  useEffect(() => {
    if (settings.theme === 'system') {
      // Remove theme override
      localStorage.removeItem(kTheme);

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.querySelector('html')?.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      themeStore.set(prefersDark ? 'dark' : 'light');
    } else {
      themeStore.set(settings.theme);
      localStorage.setItem(kTheme, settings.theme);
      document.querySelector('html')?.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme]);

  // Save settings automatically when they change
  useEffect(() => {
    try {
      // Get existing profile data
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      // Merge with new settings
      const updatedProfile = {
        ...existingProfile,
        theme: settings.theme,
        notifications: settings.notifications,
        language: settings.language,
        timezone: settings.timezone,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));
      toast.success('Settings updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update settings');
    }
  }, [settings]);

  return (
    <div className="space-y-4">
      {/* Theme & Language */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4 space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:palette-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Appearance</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:paint-brush-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Theme</label>
          </div>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => {
                  setSettings((prev) => ({ ...prev, theme }));

                  if (theme !== 'system') {
                    themeStore.set(theme);
                  }
                }}
                className={classNames(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed',
                  settings.theme === theme
                    ? 'bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-500 dark:text-white dark:hover:bg-purple-600'
                    : 'bg-bolt-elements-hover dark:bg-[#1A1A1A] text-bolt-elements-textSecondary hover:bg-purple-500/10 hover:text-purple-500 dark:hover:bg-purple-500/20 dark:text-bolt-elements-textPrimary dark:hover:text-purple-500',
                )}
              >
                <div
                  className={`w-4 h-4 ${
                    theme === 'light'
                      ? 'i-ph:sun-fill'
                      : theme === 'dark'
                        ? 'i-ph:moon-stars-fill'
                        : 'i-ph:monitor-fill'
                  }`}
                />
                <span className="capitalize">{theme}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:translate-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Language</label>
          </div>
          <select
            value={settings.language}
            onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="ru">Русский</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:bell-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Notifications</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">
              {settings.notifications ? 'Notifications are enabled' : 'Notifications are disabled'}
            </span>
            <Switch
              checked={settings.notifications}
              onCheckedChange={(checked) => {
                // Update local state
                setSettings((prev) => ({ ...prev, notifications: checked }));

                // Update localStorage immediately
                const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');
                const updatedProfile = {
                  ...existingProfile,
                  notifications: checked,
                };
                localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

                // Dispatch storage event for other components
                window.dispatchEvent(
                  new StorageEvent('storage', {
                    key: 'bolt_user_profile',
                    newValue: JSON.stringify(updatedProfile),
                  }),
                );

                toast.success(`Notifications ${checked ? 'enabled' : 'disabled'}`);
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Timezone */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:clock-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Time Settings</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:globe-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Timezone</label>
          </div>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            <option value={currentTimezone}>{currentTimezone}</option>
          </select>
        </div>
      </motion.div>

      {/* Keyboard Shortcuts */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:keyboard-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Keyboard Shortcuts</span>
        </div>

        <div className="space-y-2">
          {Object.entries(useStore(shortcutsStore)).map(([name, shortcut]) => (
            <div
              key={name}
              className="flex items-center justify-between p-2 rounded-lg bg-[#FAFAFA] dark:bg-[#1A1A1A] hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-sm text-bolt-elements-textPrimary capitalize">
                  {name.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </span>
                {shortcut.description && (
                  <span className="text-xs text-bolt-elements-textSecondary">{shortcut.description}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {shortcut.ctrlOrMetaKey && (
                  <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                    {getModifierSymbol(isMac ? 'meta' : 'ctrl')}
                  </kbd>
                )}
                {shortcut.ctrlKey && (
                  <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                    {getModifierSymbol('ctrl')}
                  </kbd>
                )}
                {shortcut.metaKey && (
                  <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                    {getModifierSymbol('meta')}
                  </kbd>
                )}
                {shortcut.altKey && (
                  <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                    {getModifierSymbol('alt')}
                  </kbd>
                )}
                {shortcut.shiftKey && (
                  <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                    {getModifierSymbol('shift')}
                  </kbd>
                )}
                <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                  {formatShortcutKey(shortcut.key)}
                </kbd>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
