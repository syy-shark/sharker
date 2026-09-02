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

import { expect, test, COMPOSER_INPUT, waitForInvocableSkills } from './fixtures';

type LatchKey = 'newTasks.listInvocableSkills' | 'sessions.list';

declare global {
  interface Window {
    /** E2E-only preload affordance; see the SHARKER_E2E block in preload.ts. */
    sharkerE2eLatch?: {
      arm(key: LatchKey, options?: { oneShot?: boolean }): void;
      release(key: LatchKey): void;
      reject(key: LatchKey, message: string): void;
    };
  }
}

/**
 * Hold the next call (or every call) to one bridge method until released, so
 * an IPC in-flight window can be observed deterministically instead of raced
 * against the fake backend's near-instant replies. Installed by the preload
 * under the isolated-E2E gate; its absence in an E2E window is a wiring bug,
 * not a reason to skip.
 */
async function armBridgeLatch(
  page: import('@playwright/test').Page,
  key: LatchKey,
  options?: { oneShot?: boolean },
): Promise<void> {
  const armed = await page.evaluate(({ key: latchKey, options: latchOptions }) => {
    if (!window.sharkerE2eLatch) return false;
    window.sharkerE2eLatch.arm(latchKey, latchOptions);
    return true;
  }, { key, options });
  expect(armed, 'the preload E2E latch is installed').toBe(true);
}

async function releaseBridgeLatch(
  page: import('@playwright/test').Page,
  key: LatchKey,
): Promise<void> {
  await page.evaluate((latchKey) => window.sharkerE2eLatch?.release(latchKey), key);
}

// The fake echo can paint before Runtime Host publishes terminal turn ownership.
// Use the catalog's known-empty live set as the barrier before latching its next read.
async function waitForSessionTurnToSettle(
  page: import('@playwright/test').Page,
): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const sessions = await window.sharker.sessions.list();
        return sessions[0]?.runningTurnIds ?? null;
      }),
    )
    .toEqual([]);
}

/**
 * Switching Agent / Ask from the ＋ menu must not move the menu.
 *
 * The switch changes the draft's permission boundary, which re-fetches the
 * invocable-Skill projection. That refresh clears the list fail-closed for the
 * `/` popup, and the regression this spec pins is the Skills row reading the
 * transient `[]` as "no skills available": it grayed out and grew a
 * description line for the length of the round trip, so the open menu's
 * geometry blinked on every mode click (MatrixA/fix-plan-click-flicker).
 *
 * The watcher is armed in-page BEFORE the click: the blink lives inside one
 * IPC round trip and is gone by the time a polling assertion could look.
 */

interface PlusMenuWatch {
  noSkillsTextAppeared: boolean;
  skillsRowDisabled: boolean;
  modeRowDisabled: boolean;
  heights: number[];
}

declare global {
  interface Window {
    __plusMenuWatch?: PlusMenuWatch;
    __plusMenuWatchStop?: () => void;
  }
}

test('switching Agent / Ask keeps the ＋ menu open, enabled and the same size', async ({
  invocableSkillsWindow: page,
}) => {
  await page.getByRole('button', { name: '添加上下文' }).click();
  const menu = page.getByRole('menu', { name: '添加上下文' });
  await expect(menu).toBeVisible();

  const agentRow = menu.getByRole('menuitemradio', { name: 'Agent 模式' });
  const askRow = menu.getByRole('menuitemradio', { name: 'Ask 模式' });
  const skillsRow = menu.getByRole('menuitem', { name: /选择技能/ });
  await expect(agentRow).toHaveAttribute('aria-checked', 'true');
  await expect(askRow).toHaveAttribute('aria-checked', 'false');
  // The seeded catalog has settled before the fixture yields the page, so the
  // baseline is an enabled row with no caveat — what must survive the switch.
  await expect(skillsRow).not.toHaveAttribute('aria-disabled', 'true');
  await expect(menu).not.toContainText('当前没有可用技能');

  // The layer scales in on open (translate + scale 0.95 → 1), and a bounding
  // box read mid-entrance is smaller than the resting one. Let the entrance
  // finish so the recorded baseline is the height the menu must keep.
  await menu.evaluate(async (menuElement) => {
    const layer = menuElement.closest('[popover]') ?? menuElement;
    await Promise.all(
      layer.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });

  await menu.evaluate((menuElement) => {
    const watch: PlusMenuWatch = {
      noSkillsTextAppeared: false,
      skillsRowDisabled: false,
      modeRowDisabled: false,
      heights: [menuElement.getBoundingClientRect().height],
    };
    const inspect = () => {
      if (menuElement.textContent?.includes('当前没有可用技能')) {
        watch.noSkillsTextAppeared = true;
      }
      for (const row of menuElement.querySelectorAll('[aria-disabled="true"]')) {
        if (row.textContent?.includes('选择技能')) watch.skillsRowDisabled = true;
        if (row.getAttribute('role') === 'menuitemradio') watch.modeRowDisabled = true;
      }
      const height = menuElement.getBoundingClientRect().height;
      const last = watch.heights[watch.heights.length - 1] ?? height;
      if (Math.abs(height - last) > 0.5) watch.heights.push(height);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(menuElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    window.__plusMenuWatch = watch;
    window.__plusMenuWatchStop = () => {
      inspect();
      observer.disconnect();
    };
  });

  await askRow.click();
  await expect(askRow).toHaveAttribute('aria-checked', 'true');
  // The mode mark lands on the footer while the menu stays where it was.
  await expect(page.locator('.sharker-composer-mode-button[data-mode="ask"]')).toBeVisible();
  await expect(menu).toBeVisible();

  await agentRow.click();
  await expect(agentRow).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.sharker-composer-mode-button[data-mode="ask"]')).toHaveCount(0);
  await expect(menu).toBeVisible();

  // Both refreshes the two switches kicked off have reached the backend once
  // this resolves; the margin covers the renderer commit that follows.
  await waitForInvocableSkills(page, ['project-only', 'workspace-only']);
  await page.waitForTimeout(250);

  const watch = await page.evaluate(() => {
    window.__plusMenuWatchStop?.();
    return window.__plusMenuWatch;
  });
  expect(watch, 'the in-page watcher survived the journey').toBeTruthy();
  expect(watch?.noSkillsTextAppeared, 'no transient "no skills" line').toBe(false);
  expect(watch?.skillsRowDisabled, 'the Skills row never grayed out').toBe(false);
  expect(watch?.modeRowDisabled, 'the mode rows never grayed out').toBe(false);
  expect(watch?.heights, 'the menu kept one height throughout').toHaveLength(1);
});

test('a Skills click during the catalog refresh does nothing, then works settled', async ({
  invocableSkillsWindow: page,
}) => {
  // The row's enabled look mid-refresh is a held presentation of the previous
  // catalog; acting on it would type a stray `/` against the fail-closed
  // list. Hold the refresh open on a latch and click straight into it.
  await armBridgeLatch(page, 'newTasks.listInvocableSkills');

  const composer = page.locator(COMPOSER_INPUT);
  await page.getByRole('button', { name: '添加上下文' }).click();
  const menu = page.getByRole('menu', { name: '添加上下文' });
  const askRow = menu.getByRole('menuitemradio', { name: 'Ask 模式' });
  const skillsRow = menu.getByRole('menuitem', { name: /选择技能/ });

  // The Ask switch starts the (now latched) refresh; the row announces the
  // held state — busy to assistive technology, a class for styling and tests
  // — and a click inside the window has no effect at all.
  await askRow.click();
  await expect(skillsRow).toHaveClass(/sharker-composer-skills-loading/);
  await expect(skillsRow).toHaveAttribute('aria-busy', 'true');
  await skillsRow.click();
  await expect(menu).toBeVisible();
  await expect(composer).toHaveText('');
  await expect(page.getByRole('listbox', { name: /技能/ })).toHaveCount(0);

  // Keyboard activation is the same no-op: Enter on the focused row neither
  // closes the menu nor writes the slash.
  await skillsRow.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(composer).toHaveText('');
  await expect(page.getByRole('listbox', { name: /技能/ })).toHaveCount(0);

  // Released, the same activation opens the `/` popup as usual. Re-focus the
  // row first: the settle re-renders the composer input's trigger config,
  // which takes focus back to the editor (long-standing behavior on every
  // catalog refresh, independent of this journey).
  await releaseBridgeLatch(page, 'newTasks.listInvocableSkills');
  await expect(skillsRow).not.toHaveClass(/sharker-composer-skills-loading/);
  await expect(skillsRow).not.toHaveAttribute('aria-busy', 'true');
  await skillsRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: /技能/ })).toBeVisible();
});

test('a context switch re-enters loading instead of holding the old catalog', async ({
  invocableSkillsWindow: page,
}) => {
  // Populate and settle a session-scoped catalog first.
  const composer = page.locator(COMPOSER_INPUT);
  await composer.fill('alpha-marker');
  await composer.press('Enter');
  await expect(page.getByText(/Fake backend received: alpha-marker/)).toBeVisible();

  // Switching to a new chat is a context change: the new-task catalog is
  // latched, so the Skills row must present as loading — deferring activation
  // — rather than as the previous session's settled, actionable catalog.
  await armBridgeLatch(page, 'newTasks.listInvocableSkills');
  await page.getByRole('button', { name: '展开侧边栏' }).click();
  const sidebar = page.getByRole('navigation', { name: '任务列表' });
  await sidebar.getByRole('button', { name: '新任务', exact: true }).click();
  await expect(composer).toHaveText('');

  await page.getByRole('button', { name: '添加上下文' }).click();
  const menu = page.getByRole('menu', { name: '添加上下文' });
  const skillsRow = menu.getByRole('menuitem', { name: /选择技能/ });
  await expect(skillsRow).toHaveAttribute('aria-busy', 'true');
  await skillsRow.click();
  await expect(menu).toBeVisible();
  await expect(composer).toHaveText('');

  await releaseBridgeLatch(page, 'newTasks.listInvocableSkills');
  await expect(skillsRow).not.toHaveAttribute('aria-busy', 'true');
  await skillsRow.click();
  await expect(page.getByRole('listbox', { name: /技能/ })).toBeVisible();
});

test('Ask then Agent lands on Agent', async ({
  invocableSkillsWindow: page,
}) => {
  const composer = page.locator(COMPOSER_INPUT);
  await composer.fill('alpha-marker');
  await composer.press('Enter');
  await expect(page.getByText(/Fake backend received: alpha-marker/)).toBeVisible();
  await waitForSessionTurnToSettle(page);

  await page.getByRole('button', { name: '添加上下文' }).click();
  const menu = page.getByRole('menu', { name: '添加上下文' });
  const agentRow = menu.getByRole('menuitemradio', { name: 'Agent 模式' });
  const askRow = menu.getByRole('menuitemradio', { name: 'Ask 模式' });
  await expect(agentRow).toHaveAttribute('aria-checked', 'true');
  await expect(askRow).not.toHaveAttribute('aria-disabled', 'true');

  await askRow.click();
  await expect(askRow).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => page.evaluate(async () => {
    const sessions = await window.sharker.sessions.list();
    return sessions[0]?.permissionMode;
  })).toBe('explore');

  await agentRow.click();
  await expect(agentRow).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => page.evaluate(async () => {
    const sessions = await window.sharker.sessions.list();
    return sessions[0]?.permissionMode;
  })).toBe('ask');
});

test('deleting the session while Ask is on settles clean', async ({
  invocableSkillsWindow: page,
}) => {
  const composer = page.locator(COMPOSER_INPUT);
  await composer.fill('alpha-marker');
  await composer.press('Enter');
  await expect(page.getByText(/Fake backend received: alpha-marker/)).toBeVisible();
  await waitForSessionTurnToSettle(page);

  await page.getByRole('button', { name: '添加上下文' }).click();
  const menu = page.getByRole('menu', { name: '添加上下文' });
  const askRow = menu.getByRole('menuitemradio', { name: 'Ask 模式' });
  await expect(askRow).not.toHaveAttribute('aria-disabled', 'true');
  await askRow.click();
  await expect(askRow).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();

  await page.getByRole('button', { name: '展开侧边栏' }).click();
  const sidebar = page.getByRole('navigation', { name: '任务列表' });
  const row = sidebar.locator('[data-sharker-contract="session-row"]').first();
  await row.hover();
  await row.getByRole('button', { name: '任务操作' }).click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: '删除', exact: true }).click();

  await expect(sidebar.locator('[data-sharker-contract="session-row"]')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(composer).toBeVisible();
  await expect(page.locator('.sharker-composer-mode-button[data-mode="ask"]')).toHaveCount(0);
});
