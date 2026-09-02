import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  FolderOpen,
  GitBranch,
  AppWindow,
  Globe,
  Mic,
  SquareTerminal,
} from "lucide-react";
import { AppMock } from "@/components/landing/app-mock";
import { SiteFooter } from "@/components/landing/site-footer";
import {
  LogoAnthropic,
  LogoDeepSeek,
  LogoGemini,
  LogoKimi,
  LogoOpenAI,
  LogoXAI,
} from "@/components/landing/brand-logos";
import { FaqSection } from "@/components/landing/faq-section";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { OceanShore } from "@/components/landing/ocean-shore";
import { SiteNav } from "@/components/landing/site-nav";

export const Route = createFileRoute("/")({ component: Home });

const threads = [
  "Fix a startup crash",
  "Read the repo architecture",
  "Draft release notes",
  "Run tests, then commit",
  "Clear leftover Maka ids",
  "Wire up the browser tool",
  "Check a CHECK constraint",
  "Get npm run dev to open",
  "Update ARCH.md",
  "Review the git diff",
  "Add an API key",
  "Pick a local workspace",
  "Verify the migration",
  "Grab a desktop screenshot",
  "Say what to do with Voice",
];

type BrandLogo = (props: { className?: string }) => ReactNode;

const modelGroups: {
  label: string;
  Logo: BrandLogo;
  items: { name: string; id: string; Logo?: BrandLogo }[];
}[] = [
  {
    label: "OpenAI",
    Logo: LogoOpenAI,
    items: [
      { name: "Sol", id: "openai/gpt-5.6-sol" },
      { name: "Terra", id: "openai/gpt-5.6-terra" },
      { name: "Luna", id: "openai/gpt-5.6-luna" },
      { name: "GPT 5.5", id: "openai/gpt-5.5" },
    ],
  },
  {
    label: "Anthropic",
    Logo: LogoAnthropic,
    items: [
      { name: "Fable 5.1", id: "anthropic/claude-fable-5.1" },
      { name: "Fable 5", id: "anthropic/claude-fable-5" },
      { name: "Opus 5", id: "anthropic/claude-opus-5" },
      { name: "Opus 4.8", id: "anthropic/claude-opus-4-8" },
    ],
  },
  {
    label: "Google",
    Logo: LogoGemini,
    items: [
      { name: "Gemini 3.7 Flash", id: "google/gemini-3.7-flash" },
      { name: "Gemini 3.1 Pro", id: "google/gemini-3.1-pro" },
      { name: "Gemini 3.6 Flash", id: "google/gemini-3.6-flash" },
      { name: "Gemini 3.5 Flash", id: "google/gemini-3.5-flash" },
    ],
  },
  {
    label: "Others",
    Logo: LogoXAI,
    items: [
      { name: "Grok 4.6", id: "xai/grok-4.6", Logo: LogoXAI },
      { name: "Grok 4.5", id: "xai/grok-4.5", Logo: LogoXAI },
      {
        name: "DeepSeek V4 Flash",
        id: "deepseek/deepseek-v4-flash",
        Logo: LogoDeepSeek,
      },
      {
        name: "DeepSeek V4 Flash Vision",
        id: "deepseek/deepseek-v4-flash-vision",
        Logo: LogoDeepSeek,
      },
      { name: "Kimi K3", id: "moonshotai/kimi-k3", Logo: LogoKimi },
    ],
  },
];

const tools: {
  name: string;
  desc: string;
  ready: boolean;
  icon: ReactNode;
}[] = [
  {
    name: "Files",
    desc: "Read, write, and search your repo",
    ready: true,
    icon: <FolderOpen className="size-4" strokeWidth={1.75} />,
  },
  {
    name: "Shell",
    desc: "Run commands and tests on this Mac",
    ready: true,
    icon: <SquareTerminal className="size-4" strokeWidth={1.75} />,
  },
  {
    name: "Git",
    desc: "Review diffs, commit, ask before push",
    ready: true,
    icon: <GitBranch className="size-4" strokeWidth={1.75} />,
  },
  {
    name: "Web",
    desc: "Search the web to fill in context",
    ready: true,
    icon: <Globe className="size-4" strokeWidth={1.75} />,
  },
  {
    name: "Browser",
    desc: "Drive a real browser with your logins",
    ready: true,
    icon: <AppWindow className="size-4" strokeWidth={1.75} />,
  },
  {
    name: "Desktop / Voice",
    desc: "Screenshot, click this Mac, or just speak",
    ready: true,
    icon: <Mic className="size-4" strokeWidth={1.75} />,
  },
];

function DownloadCta({ label = "Get Sharker" }: { label?: string }) {
  return (
    <a
      href="https://github.com/syy-shark/sharker"
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-12 items-center overflow-hidden rounded-full bg-primary text-primary-fg shadow-btn transition hover:bg-primary-hover active:scale-[0.985]"
    >
      <span className="pl-6 pr-3 text-[15px] font-medium">{label}</span>
      <span className="mr-1.5 grid size-9 place-items-center rounded-full bg-white/20">
        <ArrowRight className="size-4" strokeWidth={2.25} />
      </span>
    </a>
  );
}

function Home() {
  const marqueeItems = [...threads, ...threads];

  return (
    <div id="top" className="page-canvas">
      <section>
        <SiteNav />
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-12">
          <div className="mx-auto max-w-[680px] text-center">
            <h1 className="hero-title text-[2.75rem] text-fg sm:text-[3.4rem] md:text-[3.85rem]">
              Work at the speed
              <br />
              <span className="text-primary">of thought.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-[1.55] text-fg-muted sm:text-[16px]">
              Runs on your Mac. Read the repo, edit files, run commands, verify, commit.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <DownloadCta label="Get Sharker" />
              <Link
                to="/tutorial"
                className="text-[15px] font-medium text-fg-muted transition hover:text-fg"
              >
                Watch the tutorial
              </Link>
            </div>
          </div>
          <div id="demo" className="mt-14 sm:mt-16">
            <AppMock />
          </div>
        </div>
      </section>

      <section className="overflow-hidden pb-8 pt-16 sm:pb-10 sm:pt-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-title text-center text-[1.9rem] text-fg sm:text-[2.4rem]">
            In other apps, you get threads
          </h2>
          <div className="marquee-mask mt-10 overflow-hidden">
            <div className="marquee-track">
              {marqueeItems.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="shrink-0 rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-[13px] text-fg-subtle shadow-soft backdrop-blur-sm"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="band band-soft py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-title mx-auto max-w-xl text-center text-[1.9rem] text-fg sm:text-[2.4rem]">
            Not a chat box.
            <br />
            An agent that finishes the work.
          </h2>
          <div className="mt-12">
            <FeatureGrid />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <HowItWorks />

          <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
                New task
              </p>
              <h3 className="section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]">
                Say what needs to happen.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                It plans the steps and works in your workspace.
              </p>
            </div>
            <div className="mock-shell p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <img
                  src="/icons/shark.png"
                  alt=""
                  className="size-9"
                />
                <div>
                  <p className="text-[12px] font-medium text-fg-subtle">New task</p>
                  <p className="text-[15px] font-semibold text-fg">
                    What should we get done?
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-[#f6f6f6] p-4 text-[13.5px] leading-relaxed text-fg">
                Read this repo's startup path, clear leftover Maka authority
                ids, and get npm run dev to open a window.
              </div>
              <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
                <LogoAnthropic className="size-3.5" />
                anthropic/claude-fable-5.1
              </div>
            </div>
          </div>

          <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="order-2 lg:order-1">
              <div className="mock-shell">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-semibold">Tools</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    Not a plugin shelf. Hands that run on this Mac.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {tools.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="grid size-9 place-items-center rounded-[11px] bg-[#f6f6f6] text-fg">
                        {t.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium">{t.name}</p>
                        <p className="text-[12px] text-fg-muted">{t.desc}</p>
                      </div>
                      {t.ready ? (
                        <span className="text-[12px] font-medium text-success">
                          Local
                        </span>
                      ) : (
                        <span className="text-[12px] text-fg-subtle">
                          {"\u2014"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
                Local tools
              </p>
              <h3 className="section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]">
                Files, Shell, Git, browser, desktop.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                The workspace is the folder you pick. Keys stay on this machine.
              </p>
            </div>
          </div>

          <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
                Review
              </p>
              <h3 className="section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]">
                Done. Here's the diff.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                It tests first, then hands it to you. You can still edit before commit.
              </p>
            </div>
            <div className="mock-shell p-5">
              <div className="flex items-center gap-2">
                <img src="/icons/shark.png" alt="" className="size-8" />
                <p className="text-[13px] font-semibold">Draft release notes</p>
              </div>
              <p className="mt-1 text-[11px] text-fg-subtle">
                ~/Projects/sharker · Today 4:12 PM
              </p>
              <div className="mt-4 ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-[#eceef1] px-3.5 py-2.5 text-[13px] leading-relaxed">
                Write release notes from today's commits. Don't commit yet.
              </div>
              <div className="mt-3 max-w-[95%] space-y-3 rounded-2xl rounded-tl-md border border-border bg-white p-3.5 text-[13px] leading-relaxed">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[#f6f6f6] px-2 py-0.5 text-[11px]">
                    Git log
                  </span>
                  <span className="rounded-full bg-[#f6f6f6] px-2 py-0.5 text-[11px]">
                    Read README.md
                  </span>
                </div>
                <p>Drafted in docs/release-notes.md. Highlights:</p>
                <div className="rounded-xl bg-[#f6f6f6] p-3 text-[12.5px]">
                  <p className="font-medium">Local run</p>
                  <p className="mt-1 text-fg-muted">
                    · Dropped the installer path. Clone + npm run dev.
                    <br />
                    · Runtime schema v15 maps the old authority id.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-fg"
                  >
                    Commit
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-[12px] font-medium"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="band band-mist py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="section-title text-[1.9rem] text-fg sm:text-[2.4rem]">
              It can drive a real browser.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
              The Browser tool keeps your login sessions. If you can click it, you can hand it off.
            </p>
          </div>

          <div className="mock-shell mx-auto mt-12 max-w-3xl overflow-hidden bg-[#f6f6f6]">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3 py-1 text-[12px] text-fg-muted shadow-[0_0_0_1px_rgb(15_23_32_/_0.05)]">
                github.com/syy-shark/sharker
              </div>
            </div>
            <div className="m-1 rounded-[12px] bg-white p-4 shadow-[0_0_0_1px_rgb(15_23_32_/_0.04)] sm:p-5">
              <p className="text-[12px] font-medium text-fg-subtle">
                syy-shark / sharker
              </p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight">
                Not a chat box. A local-first agent that finishes the work.
              </p>
              <div className="mt-4 rounded-xl bg-[#11151a] px-4 py-3 font-mono text-[12px] leading-6 text-[#e8eef4]">
                git clone https://github.com/syy-shark/sharker.git
                <br />
                cd sharker
                <br />
                npm install
                <br />
                npm run dev
              </div>
              <p className="mt-4 text-[12px] font-medium text-primary">
                Sharker · Reading the local-run section
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="section-title text-[1.9rem] text-fg sm:text-[2.4rem]">
              The best model for
              <br />
              every kind of work.
            </h2>
            <p className="mt-4 text-[15px] text-fg-muted">
              Switch models without switching apps. Tasks, tools, and context stay put.
            </p>
          </div>

          <div className="mock-shell mx-auto mt-12 max-w-md p-4">
            {modelGroups.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-4" : undefined}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-fg-subtle">
                  {group.label !== "Others" ? (
                    <group.Logo className="size-3.5" />
                  ) : null}
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((m) => {
                    const RowLogo = m.Logo ?? group.Logo;
                    const active =
                      group.label === "OpenAI" && m.name === "Terra";
                    return (
                      <div
                        key={m.id}
                        className={
                          active
                            ? "flex items-center justify-between gap-2 rounded-xl bg-bg-subtle px-3 py-2.5"
                            : "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
                          <RowLogo className="size-3.5 shrink-0" />
                          {m.name}
                        </span>
                        <span className="truncate text-[11px] text-fg-subtle">
                          {m.id}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="band band-soft py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-title mb-10 text-center text-[1.9rem] text-fg sm:text-[2.4rem]">
            Frequently asked questions
          </h2>
          <FaqSection />
        </div>
      </section>

      <OceanShore>
        <section className="pb-6 pt-20 sm:pb-8 sm:pt-28">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="hero-title text-[2.2rem] text-fg sm:text-[3rem]">
              Work at the speed
              <br />
              <span className="text-primary">of thought.</span>
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <DownloadCta />
              <Link
                to="/tutorial"
                className="text-[15px] font-medium text-fg-muted transition hover:text-fg"
              >
                Watch the tutorial
              </Link>
            </div>
          </div>
        </section>

        <section id="updates" className="pb-10 pt-2 sm:pb-12">
          <div className="mx-auto max-w-lg px-4 text-center sm:px-6">
            <h3 className="section-title text-[1.5rem] text-fg">
              Stay in the loop
            </h3>
            <p className="mt-2 text-[14px] text-fg-muted">
              Get the latest updates, product news, and tips straight to your
              inbox.
            </p>
            <form
              className="mt-6 flex overflow-hidden rounded-full border border-white/80 bg-white/85 shadow-soft backdrop-blur-md"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="Email address"
                className="min-w-0 flex-1 bg-transparent px-5 py-3 text-[14px] outline-none placeholder:text-fg-subtle"
              />
              <button
                type="submit"
                className="m-1 grid size-10 place-items-center rounded-full bg-primary text-primary-fg transition hover:bg-primary-hover"
                aria-label="Subscribe"
              >
                <ArrowRight className="size-4" strokeWidth={2.25} />
              </button>
            </form>
          </div>
        </section>

        <SiteFooter />
      </OceanShore>
    </div>
  );
}
