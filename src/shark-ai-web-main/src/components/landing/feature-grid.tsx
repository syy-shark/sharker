/**
 * 真实 Harness 能力：看 / 搜 / 改 / 跑 / 验证，不是虚构的 Inbox Zero 助手橱窗。
 *
 * @see ./ARCH.md
 */
import { useState, type ReactNode } from "react";
import {
  Eye,
  FileSearch,
  Pencil,
  SquareTerminal,
  ShieldCheck,
} from "lucide-react";
import { ModelPill } from "@/components/landing/brand-logos";
import { cn } from "@/lib/utils";

type LoopId = "see" | "search" | "edit" | "run" | "verify";

const loops: {
  id: LoopId;
  name: string;
  desc: string;
  blurb: string;
  tools: string[];
  model: string;
  icon: ReactNode;
}[] = [
  {
    id: "see",
    name: "See",
    desc: "Read the repo and the screen",
    blurb: "Open files, read diffs, screenshot this Mac. See first, then act.",
    tools: ["Files", "Desktop"],
    model: "openai/gpt-5.6-terra",
    icon: <Eye className="size-4" strokeWidth={1.75} />,
  },
  {
    id: "search",
    name: "Search",
    desc: "Find it in the repo or on the web",
    blurb: "Search by symbol, or pull context with Web and Browser.",
    tools: ["Files", "Web", "Browser"],
    model: "xai/grok-4.6",
    icon: <FileSearch className="size-4" strokeWidth={1.75} />,
  },
  {
    id: "edit",
    name: "Edit",
    desc: "Change your files",
    blurb: "Edit source against a plan. Risky paths ask first — no silent writes.",
    tools: ["Files", "Git"],
    model: "anthropic/claude-fable-5.1",
    icon: <Pencil className="size-4" strokeWidth={1.75} />,
  },
  {
    id: "run",
    name: "Run",
    desc: "Execute on this Mac",
    blurb: "npm, tests, and scripts go through local Shell. Output comes back in the thread.",
    tools: ["Shell", "Git"],
    model: "google/gemini-3.7-flash",
    icon: <SquareTerminal className="size-4" strokeWidth={1.75} />,
  },
  {
    id: "verify",
    name: "Verify",
    desc: "Test, then hand it over",
    blurb: "Tests and diffs first. You decide whether to commit.",
    tools: ["Shell", "Git"],
    model: "openai/gpt-5.6-terra",
    icon: <ShieldCheck className="size-4" strokeWidth={1.75} />,
  },
];

export function FeatureGrid() {
  const [activeId, setActiveId] = useState<LoopId>("see");
  const active = loops.find((a) => a.id === activeId) ?? loops[0]!;

  return (
    <div className="mock-shell mx-auto max-w-[920px] overflow-hidden bg-[#f6f6f6]">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="flex gap-[6px]">
          <span className="size-[11px] rounded-full bg-[#ff5f57]" />
          <span className="size-[11px] rounded-full bg-[#febc2e]" />
          <span className="size-[11px] rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 items-center justify-center gap-1.5 text-[12px] font-medium text-fg-subtle">
          <img src="/icons/shark.png" alt="" className="size-4" />
          Sharker
        </div>
        <div className="w-10" />
      </div>

      <div className="grid min-h-[420px] gap-1 px-1 pb-1 md:grid-cols-[1fr_1.05fr]">
        <div className="p-2">
          <p className="mb-2 px-2 text-[11px] font-medium text-fg-subtle">
            See · Search · Edit · Run · Verify
          </p>
          <div className="space-y-0.5">
            {loops.map((a) => {
              const selected = a.id === activeId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveId(a.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition",
                    selected
                      ? "bg-white font-medium shadow-[0_0_0_1px_rgb(15_23_32_/_0.04)]"
                      : "text-fg-muted hover:bg-white/70",
                  )}
                >
                  <span className="grid size-9 place-items-center rounded-[10px] bg-white text-fg shadow-[0_0_0_1px_rgb(15_23_32_/_0.05)]">
                    {a.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold tracking-tight text-fg">
                      {a.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-fg-muted">
                      {a.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_rgb(15_23_32_/_0.04)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-[12px] bg-[#f6f6f6] text-fg">
              {active.icon}
            </span>
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight">
                {active.name}
              </h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
                {active.blurb}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-[11px] font-medium text-fg-subtle">Tools</p>
            <div className="flex flex-wrap gap-1.5">
              {active.tools.map((t) => (
                <span
                  key={t}
                  className="rounded-lg bg-[#f6f6f6] px-2.5 py-1 text-[12px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-medium text-fg-subtle">Model</p>
            <ModelPill model={active.model} />
          </div>

          <div className="mt-auto border-t border-border pt-5">
            <span className="inline-flex rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-fg shadow-btn">
              New task
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
