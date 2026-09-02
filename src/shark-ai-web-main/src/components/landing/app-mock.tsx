/**
 * 官网里的 Sharker 桌面窗：灰底 canvas + 白浮板，侧栏跟实物（新任务 / 扩展 / 定时任务 / 按时间·按项目 / 设置）。
 *
 * @see ./ARCH.md
 */
import type { ReactNode } from "react";
import { Blocks, Settings, SquarePen, Timer } from "lucide-react";
import { ModelPill, SharkMark } from "@/components/landing/brand-logos";
import { cn } from "@/lib/utils";

type AppMockProps = {
  /** 教程页最后一幕可关掉装饰投影，避免叠两层窗。 */
  compact?: boolean;
  className?: string;
};

/**
 * 营销页 / Tutorial 共用的产品窗。刻意跟桌面壳层对齐，而不是虚构的 “The Computer”。
 */
export function AppMock({ compact, className }: AppMockProps) {
  return (
    <div className={cn("mock-window mx-auto w-full max-w-[1000px]", compact && "mock-window--compact", className)}>
      <div className="mock-titlebar">
        <div className="flex items-center gap-[7px] pl-1">
          <span className="size-[12px] rounded-full bg-[#ff5f57] shadow-[inset_0_-0.5px_0_rgb(0_0_0_/_0.12)]" />
          <span className="size-[12px] rounded-full bg-[#febc2e] shadow-[inset_0_-0.5px_0_rgb(0_0_0_/_0.12)]" />
          <span className="size-[12px] rounded-full bg-[#28c840] shadow-[inset_0_-0.5px_0_rgb(0_0_0_/_0.12)]" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 text-[12px] font-medium tracking-[-0.01em] text-fg-muted">
          <SharkMark className="size-4" />
          Sharker
        </div>
      </div>

      <div className="mock-app-frame">
        <aside className="mock-sidebar hidden md:flex md:flex-col">
          <div className="px-2.5 pt-3">
            <div className="flex items-center gap-2 px-1.5 py-1">
              <SharkMark className="size-7" />
              <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em]">
                Sharker
              </div>
            </div>

            <div className="mt-2 space-y-0.5">
              <NavRow icon={<SquarePen className="size-3.5" strokeWidth={1.75} />} label="New task" kbd="⌘N" />
              <NavRow icon={<Blocks className="size-3.5" strokeWidth={1.75} />} label="Extensions" />
              <NavRow icon={<Timer className="size-3.5" strokeWidth={1.75} />} label="Scheduled" />
            </div>

            <div className="mock-segment mt-3">
              <span className="mock-segment__item is-on">By time</span>
              <span className="mock-segment__item">By project</span>
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-hidden px-2">
            <p className="mock-label px-2">Recent</p>
            <div className="mt-1 space-y-0.5">
              <SessionRow active title="Fix startup crash" time="2h" />
              <SessionRow title="Read the architecture" time="1d" />
              <SessionRow title="Draft release notes" time="17h" />
              <SessionRow title="Wire up browser" time="3d" />
            </div>
          </div>

          <div className="px-2.5 pb-3 pt-2">
            <NavRow icon={<Settings className="size-3.5" strokeWidth={1.75} />} label="Settings" />
          </div>
        </aside>

        <section className="mock-raised">
          <div className="flex flex-1 flex-col px-5 pb-3 pt-6 sm:px-8">
            <div className="mb-5">
              <p className="text-[13px] font-semibold tracking-[-0.02em] text-fg">
                Fix startup crash
              </p>
              <p className="mt-0.5 text-[11px] text-fg-subtle">
                ~/Projects/sharker · Today 10:12
              </p>
            </div>

            <div className="mb-4 flex justify-end">
              <div className="max-w-[min(100%,400px)] rounded-[16px] rounded-br-[5px] bg-[#eceef1] px-[14px] py-[10px] text-[13px] leading-[1.5] tracking-[-0.01em] text-fg">
                Startup throws OperationalStateMigrationBlockedError. Find it and fix it.
              </div>
            </div>

            <div className="max-w-[min(100%,460px)] space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                <ToolChip name="Read" detail="sqlite-runtime-schema.ts" />
                <ToolChip name="Edit" detail="authority id → sharker" />
                <ToolChip name="Shell" detail="npm test" />
              </div>

              <div className="rounded-[16px] rounded-tl-[5px] bg-white px-[15px] py-[13px] text-[13px] leading-[1.55] tracking-[-0.01em] text-fg shadow-[0_0_0_1px_rgb(15_23_32_/_0.05),0_1px_2px_rgb(15_23_32_/_0.04)]">
                <p>
                  The CHECK constraint still had the old workspace authority. I
                  bumped the runtime schema to v15 and mapped the old id.
                </p>
                <div className="mt-3 overflow-hidden rounded-[10px] bg-[#f6f6f6]">
                  <StatusRow ready label="Verified">
                    Migration tests pass. The window opens.
                  </StatusRow>
                  <StatusRow last label="Needs you">
                    The first <code className="rounded bg-white px-1 py-px text-[11px]">npm run dev</code> installs workspace deps
                  </StatusRow>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 pt-1 sm:px-5">
            <div className="mock-composer flex items-center gap-3 rounded-[14px] px-3.5 py-2.5">
              <span className="min-w-0 flex-1 text-[13px] text-fg-subtle">
                Say what to do next…
              </span>
              <ModelPill className="hidden sm:inline-flex" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function NavRow({
  icon,
  label,
  kbd,
  active,
}: {
  icon: ReactNode;
  label: string;
  kbd?: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-[12.5px] tracking-[-0.01em]",
        active ? "bg-white font-medium text-fg shadow-[0_0_0_1px_rgb(15_23_32_/_0.04)]" : "text-fg-muted",
      )}
    >
      <span className="grid size-4 place-items-center text-fg-subtle">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {kbd ? (
        <kbd className="rounded-[4px] bg-black/[0.04] px-1 py-px text-[10px] font-medium text-fg-subtle">
          {kbd}
        </kbd>
      ) : null}
    </div>
  );
}

function SessionRow({
  title,
  time,
  active,
}: {
  title: string;
  time: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-[12.5px] tracking-[-0.01em]",
        active ? "bg-white font-medium text-fg shadow-[0_0_0_1px_rgb(15_23_32_/_0.04)]" : "text-fg-muted",
      )}
    >
      <span
        className={cn(
          "size-[6px] rounded-full",
          active ? "bg-[#3b82f6]" : "bg-[rgb(15_23_32_/_0.16)]",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-[10.5px] tabular-nums text-fg-subtle">{time}</span>
    </div>
  );
}

function ToolChip({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2 py-1 text-[11px] text-fg-muted shadow-[0_1px_0_rgb(15_23_32_/_0.03)]">
      <span className="font-semibold text-fg">{name}</span>
      <span className="truncate text-fg-subtle">{detail}</span>
    </span>
  );
}

function StatusRow({
  ready,
  label,
  children,
  last,
}: {
  ready?: boolean;
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] leading-[1.4]",
        !last && "shadow-[inset_0_-1px_0_rgb(15_23_32_/_0.04)]",
      )}
    >
      <span
        className={cn(
          "mt-[3px] box-border size-[13px] shrink-0 rounded-full border-[2px] bg-transparent",
          ready ? "border-[#16a34a]" : "border-[#ea580c]",
        )}
        aria-hidden
      />
      <p className="min-w-0">
        <span className={cn("font-semibold", ready ? "text-[#15803d]" : "text-[#c2410c]")}>
          {label}
        </span>
        <span className="text-fg-muted"> {children}</span>
      </p>
    </div>
  );
}
