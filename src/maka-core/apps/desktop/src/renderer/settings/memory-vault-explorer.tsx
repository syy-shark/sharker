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
/**
 * 设置 → 记忆：左侧文件夹树 + 右侧预览/手改。
 * 读写走 `window.maka.memory.*Vault*`，与助手的 MakaMemoryVault* 工具同一套路径。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, RelativeTime, TextArea, useToast, useUiLocale } from '@maka/ui';
import { MarkdownBody } from '@maka/ui';
import { ChevronDown, ChevronRight, FileText, FolderOpen, ICON_SIZE } from '@maka/ui/icons';
import type { MemoryVaultDirNode, MemoryVaultNode } from '@maka/core/local-memory-vault';
import { todayEpisodicPath } from '@maka/core/local-memory-vault';
import { getMemorySettingsCopy } from '../locales/settings-memory-copy';
import { settingsActionErrorMessage } from './settings-error-copy';

export function MemoryVaultExplorer() {
  const locale = useUiLocale();
  const copy = getMemorySettingsCopy(locale).vault;
  const toast = useToast();
  const [nodes, setNodes] = useState<readonly MemoryVaultNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(() => new Set(['episodic']));

  const dirty = editing && content !== savedContent;

  async function refreshTree(selectPath?: string) {
    const result = await window.maka.memory.listVault();
    if (!result.ok) {
      toast.error(copy.loadFailed, result.message);
      return;
    }
    setNodes(result.value.nodes);
    const nextPath = selectPath ?? selectedPath ?? firstFilePath(result.value.nodes);
    if (nextPath) await openFile(nextPath);
  }

  async function openFile(path: string) {
    const result = await window.maka.memory.readVaultFile(path);
    if (!result.ok) {
      toast.error(copy.loadFailed, result.message);
      return;
    }
    setSelectedPath(result.value.path);
    setContent(result.value.content);
    setSavedContent(result.value.content);
    setUpdatedAt(result.value.updatedAt);
    setEditing(false);
  }

  async function saveFile() {
    if (!selectedPath) return;
    setBusy(true);
    try {
      const result = await window.maka.memory.writeVaultFile(selectedPath, content);
      if (!result.ok) {
        toast.error(copy.saveFailed, result.message);
        return;
      }
      setSavedContent(content);
      setUpdatedAt(result.value.updatedAt);
      setEditing(false);
      toast.success(copy.saved);
      await refreshTree(selectedPath);
    } catch (error) {
      toast.error(copy.saveFailed, settingsActionErrorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  }

  async function createTodayFile() {
    const path = todayEpisodicPath();
    setBusy(true);
    try {
      const existing = await window.maka.memory.readVaultFile(path);
      if (existing.ok) {
        setOpenFolders((current) => new Set([...current, 'episodic']));
        await openFile(path);
        return;
      }
      const result = await window.maka.memory.writeVaultFile(path, `# ${path.slice('episodic/'.length).replace(/\.md$/, '')}\n\n`);
      if (!result.ok) {
        toast.error(copy.saveFailed, result.message);
        return;
      }
      setOpenFolders((current) => new Set([...current, 'episodic']));
      await refreshTree(path);
    } catch (error) {
      toast.error(copy.saveFailed, settingsActionErrorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedPath || selectedPath === 'MEMORY.md') return;
    if (!window.confirm(copy.deleteConfirm(selectedPath))) return;
    setBusy(true);
    try {
      const result = await window.maka.memory.deleteVaultFile(selectedPath);
      if (!result.ok) {
        toast.error(copy.deleteFailed, result.message);
        return;
      }
      setSelectedPath(undefined);
      setContent('');
      setSavedContent('');
      await refreshTree();
    } catch (error) {
      toast.error(copy.deleteFailed, settingsActionErrorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshTree();
  }, []);

  const crumbs = useMemo(() => (selectedPath ? selectedPath.split('/') : []), [selectedPath]);

  return (
    <div className="settingsMemoryVault">
      <aside className="settingsMemoryVaultTree" aria-label={copy.treeAria}>
        <div className="settingsMemoryVaultTreeHeader">
          <strong>{copy.openFolder}</strong>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={busy}
            label={copy.newDaily}
            onClick={() => void createTodayFile()}
          />
        </div>
        <ul className="settingsMemoryVaultList">
          {nodes.map((node) => (
            <VaultTreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              openFolders={openFolders}
              onToggle={(path) => {
                setOpenFolders((current) => {
                  const next = new Set(current);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                });
              }}
              onOpen={(path) => void openFile(path)}
            />
          ))}
        </ul>
      </aside>
      <section className="settingsMemoryVaultReader">
        {selectedPath ? (
          <>
            <header className="settingsMemoryVaultReaderHeader">
              <nav className="settingsMemoryVaultCrumbs" aria-label={copy.crumbsAria}>
                {crumbs.map((part, index) => (
                  <span key={`${part}-${index}`}>
                    {index > 0 ? <span aria-hidden="true"> › </span> : null}
                    {part}
                  </span>
                ))}
              </nav>
              <div className="settingsMemoryVaultReaderActions">
                {updatedAt ? <RelativeTime ts={updatedAt} /> : null}
                {editing ? (
                  <>
                    <Button size="sm" variant="ghost" isDisabled={busy} label={copy.cancel} onClick={() => { setContent(savedContent); setEditing(false); }} />
                    <Button size="sm" variant="primary" isDisabled={busy || !dirty} label={busy ? copy.saving : copy.save} onClick={() => void saveFile()} />
                  </>
                ) : (
                  <>
                    {selectedPath !== 'MEMORY.md' ? (
                      <Button size="sm" variant="ghost" isDisabled={busy} label={copy.deleteFile} onClick={() => void removeSelected()} />
                    ) : null}
                    <Button size="sm" variant="primary" isDisabled={busy} label={copy.edit} onClick={() => setEditing(true)} />
                  </>
                )}
              </div>
            </header>
            {editing ? (
              <div className="settingsMemoryVaultEditor">
                <TextArea
                  label={selectedPath}
                  isLabelHidden
                  value={content}
                  onChange={setContent}
                  rows={18}
                />
              </div>
            ) : (
              <div className="settingsMemoryVaultMarkdown">
                <MarkdownBody text={content || copy.emptyFile} density="compact" />
              </div>
            )}
          </>
        ) : (
          <EmptyState title={copy.emptyTitle} description={copy.emptyHelp} />
        )}
      </section>
    </div>
  );
}

function VaultTreeNode(props: {
  node: MemoryVaultNode;
  depth: number;
  selectedPath: string | undefined;
  openFolders: ReadonlySet<string>;
  onToggle(path: string): void;
  onOpen(path: string): void;
}) {
  if (props.node.kind === 'file') {
    return (
      <li>
        <button
          type="button"
          className="settingsMemoryVaultItem"
          data-depth={props.depth}
          data-selected={props.selectedPath === props.node.path ? 'true' : 'false'}
          onClick={() => props.onOpen(props.node.path)}
        >
          <FileText size={ICON_SIZE.control} />
          <span>{props.node.name}</span>
        </button>
      </li>
    );
  }
  const folder = props.node as MemoryVaultDirNode;
  const open = props.openFolders.has(folder.path);
  return (
    <li>
      <button
        type="button"
        className="settingsMemoryVaultItem"
        data-depth={props.depth}
        aria-expanded={open}
        onClick={() => props.onToggle(folder.path)}
      >
        {open ? <ChevronDown size={ICON_SIZE.control} /> : <ChevronRight size={ICON_SIZE.control} />}
        <FolderOpen size={ICON_SIZE.control} />
        <span>{folder.name}</span>
      </button>
      {open ? (
        <ul className="settingsMemoryVaultList">
          {folder.children.map((child) => (
            <VaultTreeNode
              key={child.path}
              node={child}
              depth={props.depth + 1}
              selectedPath={props.selectedPath}
              openFolders={props.openFolders}
              onToggle={props.onToggle}
              onOpen={props.onOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function firstFilePath(nodes: readonly MemoryVaultNode[]): string | undefined {
  for (const node of nodes) {
    if (node.kind === 'file') return node.path;
    const nested = firstFilePath(node.children);
    if (nested) return nested;
  }
  return undefined;
}
