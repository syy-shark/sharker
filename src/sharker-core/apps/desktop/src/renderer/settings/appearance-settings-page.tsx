/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useEffect, useRef } from 'react';
import { Grid, HStack, SelectableCard, Text, VStack } from '@astryxdesign/core';
import { SettingsPage, SettingsSection } from './settings-section';
import {
  THEME_PALETTES,
  type ThemePalette,
  type ThemePreference,
  type UpdateAppSettingsResult,
} from '@sharker/core/settings';
import { useMountedRef, useToast, useUiLocale } from '@sharker/ui';
import { settingsActionErrorMessage } from './settings-error-copy';
import { getSettingsPreferencesCopy } from '../locales/settings-preferences-copy.js';

/**
 * Mini chat-surface mockup rendered inside each theme radio tile. Hardcoded
 * colors per variant so the preview tiles do not all shift to match the
 * currently active theme.
 */
function ThemePreviewMock(props: { variant: ThemePreference }) {
  if (props.variant === 'auto') {
    return (
      <div className="settingsThemePreview settingsThemePreviewSplit" aria-hidden="true">
        <ThemePreviewPane mode="light" />
        <ThemePreviewPane mode="dark" />
      </div>
    );
  }
  return (
    <div className="settingsThemePreview" aria-hidden="true">
      <ThemePreviewPane mode={props.variant} />
    </div>
  );
}

function ThemePreviewPane(props: { mode: 'light' | 'dark' }) {
  return (
    <div className="settingsThemePreviewPane" data-mode={props.mode}>
      <div className="settingsThemePreviewSidebar" />
      <div className="settingsThemePreviewChat">
        <div className="settingsThemePreviewLine settingsThemePreviewLine-assistant" />
        <div className="settingsThemePreviewLine settingsThemePreviewLine-assistant settingsThemePreviewLine-short" />
        <div className="settingsThemePreviewBubble" />
      </div>
    </div>
  );
}

const THEME_SECTION_HEADING_ID = 'settings-appearance-theme-heading';
const PALETTE_SECTION_HEADING_ID = 'settings-appearance-palette-heading';

/** 外观页：浅色 / 深色 / 跟随系统，以及默认调色板。 */
export function AppearanceSettingsPage(props: {
  themePref: ThemePreference;
  themePalette: ThemePalette;
  onUpdate(patch: Parameters<typeof window.sharker.settings.update>[0]): Promise<UpdateAppSettingsResult>;
  onThemeChange(pref: ThemePreference): void;
  onThemePaletteChange(palette: ThemePalette): void;
}) {
  const locale = useUiLocale();
  const copy = getSettingsPreferencesCopy(locale).appearance;
  const sections = getSettingsPreferencesCopy(locale).sections;
  const toast = useToast();
  const themePageMountedRef = useMountedRef();
  const themePersistTicketRef = useRef(0);

  useEffect(() => {
    return () => {
      themePersistTicketRef.current += 1;
    };
  }, []);

  async function persistAppearance(patch: NonNullable<Parameters<typeof window.sharker.settings.update>[0]['appearance']>) {
    const ticket = ++themePersistTicketRef.current;
    try {
      await props.onUpdate({ appearance: patch });
    } catch (error) {
      if (themePageMountedRef.current && ticket === themePersistTicketRef.current) {
        toast.error(copy.saveFailed, settingsActionErrorMessage(error, locale));
      }
    }
  }

  async function setTheme(next: ThemePreference) {
    props.onThemeChange(next);
    await persistAppearance({ theme: next });
  }

  async function setPalette(next: ThemePalette) {
    props.onThemePaletteChange(next);
    await persistAppearance({ palette: next });
  }

  return (
    <SettingsPage>
      <SettingsSection
        variant="bare"
        titleId={THEME_SECTION_HEADING_ID}
        title={sections.theme}
        description={sections.themeHelp}
      >
        <Grid columns={{ minWidth: 180 }} gap={2} role="group" aria-labelledby={THEME_SECTION_HEADING_ID}>
          {(Object.entries(copy.themeOptions) as Array<[ThemePreference, { label: string; help: string }]>).map(([value, option]) => (
            <SelectableCard
              key={value}
              label={option.label}
              isSelected={props.themePref === value}
              onChange={() => void setTheme(value)}
              padding={2}
            >
              <VStack gap={2}>
                <ThemePreviewMock variant={value} />
                <VStack gap={0.5}>
                  <Text type="label" size="sm">{option.label}</Text>
                  <Text type="supporting" size="sm" color="secondary">{option.help}</Text>
                </VStack>
              </VStack>
            </SelectableCard>
          ))}
        </Grid>
      </SettingsSection>
      <SettingsSection
        variant="bare"
        titleId={PALETTE_SECTION_HEADING_ID}
        title={sections.palette}
        description={sections.paletteHelp}
      >
        <Grid
          columns={{ minWidth: 180 }}
          gap={2}
          role="group"
          aria-labelledby={PALETTE_SECTION_HEADING_ID}
        >
          {THEME_PALETTES.map((palette) => (
            <SelectableCard
              key={palette}
              label={copy.paletteLabels[palette]}
              isSelected={props.themePalette === palette}
              onChange={() => void setPalette(palette)}
              padding={2}
            >
              <HStack gap={2} align="center" height="100%">
                <span
                  className={`settingsPaletteSwatch settingsPaletteSwatch-${palette}`}
                  aria-hidden="true"
                />
                <VStack gap={0.5}>
                  <Text type="label" size="sm">{copy.paletteLabels[palette]}</Text>
                  <Text type="supporting" size="sm" color="secondary">{copy.paletteHelp[palette]}</Text>
                </VStack>
              </HStack>
            </SelectableCard>
          ))}
        </Grid>
      </SettingsSection>
    </SettingsPage>
  );
}
