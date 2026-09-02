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

"use client";

import type React from "react";
import { cn } from "../utils.js";

/**
 * `Marker` — the per-turn lineage / footer chrome (issue #332, PR2).
 *
 * Retires the bespoke `.sharker-turn-summary*`, `.sharker-turn-lineage-*`, and
 * `.sharker-turn-footer*` shell
 * CSS (spread across `sharker-tokens.css`, `styles/settings/models.css`, and the
 * re-anchored measure-column block in `styles/tool-output.css`), moving each
 * onto package-owned semantic classes.
 *
 * The measure-column geometry the old `tool-output.css` re-anchor applied to
 * the summary / lineage rows / footer is gone rather than moved: `.sharker-turn`
 * is the column, and every `Marker` renders inside one, so a second cap on the
 * chrome could only ever be the same edge stated twice.
 *
 * `markerVariants` is exported from THIS module as a local variant recipe
 * so the lineage badge + footer action — which render as `UiButton` and can't
 * be wrapped — apply the shell via `className`; `Button` runs it through
 * `cn` last so consumers can append their own product hook.
 * It is intentionally kept OFF the `@sharker/ui` package barrel (see `index.ts`):
 * the only consumers import it by relative path, so the variant table stays an
 * internal, freely-removable styling detail rather than public API.
 *
 */
export type MarkerVariant =
  | "host-origin"
  | "lineage-row"
  | "lineage-row-reverse"
  | "lineage-badge"
  | "footer"
  | "footer-action";

const MARKER_CLASSES: Record<MarkerVariant, string> = {
  "host-origin": "sharker-turn-host-origin",
  "lineage-row": "sharker-turn-lineage-row",
  "lineage-row-reverse": "sharker-turn-lineage-row sharker-turn-lineage-row-reverse",
  "lineage-badge": "sharker-turn-lineage-badge",
  footer: "sharker-turn-footer",
  "footer-action": "sharker-turn-footer-action",
};

function markerVariants({ variant }: { variant: MarkerVariant }): string {
  return MARKER_CLASSES[variant];
}

export { markerVariants };

export interface MarkerProps extends React.ComponentPropsWithoutRef<"div"> {
  variant: MarkerVariant;
  // The summary chips were authored as inline `<span>`s; the containers /
  // markers as `<div>`s. Keep the original tag so the semantic-class
  // conversion is structurally identical (zero behavioral change).
  as?: "div" | "span";
}

export function Marker({
  className,
  variant,
  as: Tag = "div",
  ...props
}: MarkerProps): React.ReactElement {
  return (
    // `{...props}` first so the `data-slot` / `data-variant` hooks land last and
    // can't be clobbered by a consumer (mirrors Message / Bubble). The styling
    // `data-kind` / `data-state` / `data-direction` etc. flow through `...props`
    // and are read by the literalized `data-[…]:` variants above.
    <Tag
      {...props}
      data-slot="marker"
      data-variant={variant}
      className={cn(markerVariants({ variant }), className)}
    />
  );
}

/**
 * Tool-result preview surfaces (issue #332, PR4).
 *
 * Retires the bespoke `OverlayPreview` family shell CSS — the shared
 * height-bounded `.sharker-overlay-preview` base + `.sharker-overlay-close`, the
 * structured cards (`.sharker-tool-diff*`, `.sharker-tool-terminal*`,
 * `.sharker-web-search-*`), and the separate `.sharker-load-tool-*` result card —
 * represented by package-owned semantic classes in `styles.css`.
 *
 * Two structural notes:
 *   1. The chat structured cards carry BOTH the shared `overlay` base AND a kind
 *      part (the retired DOM had `class="sharker-overlay-preview sharker-tool-diff"`),
 *      applied as `cn(previewVariants({part:'overlay'}), previewVariants({part:'diff'}))`.
 *      The kind class follows the shared base and may refine it by normal CSS
 *      source order.
 *   2. Leaf rules authored as descendant selectors on bare tags (e.g.
 *      `.sharker-web-search-preview > header strong`)
 *      remain descendants of the stable semantic container class.
 *
 * Unlike the other tables, `previewVariants` IS exported on the `@sharker/ui` barrel
 * (`index.ts`): the file-diff `diff` / `diff-body` / `diff-line` parts have a
 * SECOND, cross-package consumer — `apps/desktop`'s `artifact-preview.tsx`, whose
 * non-chat diff pane shared the retired `.sharker-tool-diff*` shell and co-migrates
 * here. That second consumer is exactly the condition the off-barrel convention
 * named for promotion, so the export is the rule, not an exception.
 *
 * Preview card shells use the shared shadow-ring recipe instead of hard visual
 * borders. Dividers inside the cards remain real borders because they separate
 * rows and headers.
 */
const PREVIEW_PART_CLASSES = {
      // ── shared base ──────────────────────────────────────────────────────
      // `.sharker-overlay-preview` — the height-bounded mono container every
      // overlay preview shares.
      overlay:
        "sharker-overlay-preview",
      // Overlay placement only; Button owns the dismiss action's proportions.
      close: "sharker-overlay-close",

      // ── file diff (shared with apps/desktop artifact-preview) ─────────────
      // `.sharker-tool-diff` — the card shell. `[white-space:normal]` overrides the
      // overlay base's pre-wrap on the chat consumer.
      diff:
        "sharker-tool-diff",
      // `.sharker-tool-diff-paths` (+ its bare `code` children).
      "diff-paths":
        "sharker-tool-diff-paths",
      // `.sharker-tool-diff-body` — the scrolling mono `<pre>`.
      "diff-body":
        "sharker-tool-diff-body",
      // `.sharker-tool-diff-line` (+ the `[data-line]` add/del/hunk/meta/ctx tints).
      "diff-line":
        "sharker-tool-diff-line",

      // ── terminal ──────────────────────────────────────────────────────────
      // `.sharker-tool-terminal` — same card shell as diff.
      terminal:
        "sharker-tool-terminal",
      // `.sharker-tool-terminal-head`
      "terminal-head":
        "sharker-tool-terminal-head",
      // `.sharker-tool-terminal-cwd`
      "terminal-cwd": "sharker-tool-terminal-cwd",
      // `.sharker-tool-terminal-cmd` — the ellipsized command line.
      "terminal-cmd":
        "sharker-tool-terminal-cmd",
      // `.sharker-tool-terminal-exit` (+ the `[data-ok]` success/failure badge).
      "terminal-exit":
        "sharker-tool-terminal-exit",
      // `.sharker-tool-terminal-empty`
      "terminal-empty":
        "sharker-tool-terminal-empty",
      // `.sharker-tool-terminal-stream` (+ the `[data-stream]` stdout/stderr tone).
      "terminal-stream":
        "sharker-tool-terminal-stream",
      // `.sharker-tool-terminal-truncated-note` (+ its `> span` min-width reset).
      "terminal-truncated-note":
        "sharker-tool-terminal-truncated-note",
      // `.sharker-tool-terminal-copy` (UiButton) + the shared copy-state tints.
      "terminal-copy":
        "sharker-tool-terminal-copy",

      // ── web search ────────────────────────────────────────────────────────
      // `.sharker-web-search-preview` (+ its bare `> header` / list leaves; the
      // container inherits the overlay base's mono font, never resetting it).
      "web-search":
        "sharker-web-search-preview",
      // `.sharker-web-search-error` — the destructive container tint.
      "web-search-error":
        "sharker-web-search-error",
      // `.sharker-web-search-error-message`
      "web-search-error-message":
        "sharker-web-search-error-message",
      // `.sharker-web-search-error-repair`
      "web-search-error-repair":
        "sharker-web-search-error-repair",

      // ── load-tool result card (separate base; not an overlay) ─────────────
      // `.sharker-load-tool-preview` (+ its `p` margin reset).
      "load-tool":
        "sharker-load-tool-preview",
      // `.sharker-load-tool-title`
      "load-tool-title": "sharker-load-tool-title",
      // `.sharker-load-tool-count`
      "load-tool-count": "sharker-load-tool-count",
} as const;

type PreviewPart = keyof typeof PREVIEW_PART_CLASSES;
const previewVariants = ({ part }: { part: PreviewPart }): string => PREVIEW_PART_CLASSES[part];

export { previewVariants };
