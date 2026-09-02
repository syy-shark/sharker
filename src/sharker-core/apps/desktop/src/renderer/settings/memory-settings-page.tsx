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
import type { AppSettings, UpdateAppSettingsResult } from '@sharker/core/settings';
import { StatusDot, Switch, useUiLocale } from '@sharker/ui';
import { Button } from '@sharker/ui';
import { getMemorySettingsCopy } from '../locales/settings-memory-copy';
import { getSettingsSharedCopy } from '../locales/settings-shared-copy.js';
import { SettingsPage, SettingsRow, SettingsSection } from './settings-section';
import { useMemoryDocumentController } from './use-memory-settings-controller';
import { memoryStatusLabel, memoryStatusSemantic } from './memory-settings-labels';
import { MemoryVaultExplorer } from './memory-vault-explorer';
import { dotForStatus } from '@sharker/ui';

export function MemorySettingsPage(props: {
  settings: AppSettings;
  onUpdate(patch: Parameters<typeof window.sharker.settings.update>[0]): Promise<UpdateAppSettingsResult>;
  onReloadSettings(): Promise<void>;
}) {
  const locale = useUiLocale();
  const copy = getMemorySettingsCopy(locale);
  const sharedCopy = getSettingsSharedCopy(locale);
  const {
    setEnabled,
    setAgentReadEnabled,
    openFolder,
    memoryControlsDisabled,
    isMemoryActionPending,
    effective,
  } = useMemoryDocumentController({
    settings: props.settings,
    onReloadSettings: props.onReloadSettings,
  });
  const hasLocalMemoryPaths = Boolean(effective.path);

  return (
    <SettingsPage>
      <SettingsSection description={sharedCopy.groups.memorySourcesHelp}>
        <SettingsRow
          label={copy.text.localFile}
          description={copy.text.localFileHelp}
          end={(
            <span className="settingsFormRowControlCluster">
              <span className="settingsStatus">
                <StatusDot
                  variant={dotForStatus(memoryStatusSemantic(effective.status))}
                  label={memoryStatusLabel(effective.status, copy)}
                />
                <span>{memoryStatusLabel(effective.status, copy)}</span>
              </span>
              <Switch
                label={copy.text.enableLocalFile}
                isLabelHidden
                value={effective.enabled}
                isDisabled={memoryControlsDisabled}
                onChange={(enabled) => void setEnabled(enabled)}
              />
            </span>
          )}
        />
        <SettingsRow
          label={copy.text.agentReadable}
          description={copy.text.agentReadableHelp}
          end={(
            <Switch
              label={copy.text.enableAgentRead}
              isLabelHidden
              value={effective.agentReadEnabled}
              isDisabled={memoryControlsDisabled || !effective.enabled}
              onChange={(enabled) => void setAgentReadEnabled(enabled)}
            />
          )}
        />
      </SettingsSection>
      <SettingsSection
        variant="bare"
        title={sharedCopy.groups.memoryDocument}
        description={sharedCopy.groups.memoryDocumentHelp}
        action={
          hasLocalMemoryPaths ? (
            <Button
              variant="ghost"
              size="sm"
              isDisabled={memoryControlsDisabled || !effective.enabled || isMemoryActionPending('memory:folder:open')}
              label={isMemoryActionPending('memory:folder:open') ? copy.text.opening : copy.text.openFolder}
              onClick={() => void openFolder()}
            />
          ) : null
        }
      >
        <MemoryVaultExplorer />
      </SettingsSection>
    </SettingsPage>
  );
}
