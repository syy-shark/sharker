/**
 * Tutorial 独立页：演示 README 本地 clone / 安装 / 启动流程，不挂在首页底部。
 *
 * @see ./ARCH.md
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { OceanShore } from "@/components/landing/ocean-shore";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { TutorialDemo } from "@/components/landing/tutorial-demo";

export const Route = createFileRoute("/tutorial")({ component: TutorialPage });

function TutorialPage() {
  return (
    <div className="page-canvas tutorial-page">
      <SiteNav />

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
            Tutorial
          </p>
          <h1 className="hero-title mt-3 text-[2.4rem] text-fg sm:text-[3.1rem]">
            Run it locally.
            <br />
            <span className="text-primary">This is the path.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-[1.6] text-fg-muted sm:text-[16px]">
            No installer yet. On an Apple Silicon Mac, clone, install, and start — the window opens itself. Or hand this to your agent.
          </p>
        </div>

        <div className="mt-12">
          <TutorialDemo />
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <div className="mock-shell overflow-hidden">
            <div className="border-b border-border bg-mock-chrome px-4 py-3">
              <p className="text-[13px] font-semibold">You need</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                macOS · Node.js 22+ (22.19 or newer) · Git
              </p>
            </div>
            <pre className="overflow-x-auto bg-[#11151a] px-4 py-4 text-[13px] leading-7 text-[#e8eef4]">
              <code>{`git clone https://github.com/syy-shark/sharker.git
cd sharker
npm install
npm run dev`}</code>
            </pre>
          </div>
          <p className="mt-4 text-center text-[13.5px] leading-relaxed text-fg-muted">
            When the terminal prints <code className="rounded bg-white/70 px-1.5 py-0.5 text-[12px]">[dev] starting Sharker desktop</code>
            , the window opens. Pick a workspace, add an OpenAI-compatible API key and model, and say what to do. Keys stay on this machine.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            <a
              href="https://github.com/syy-shark/sharker"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center overflow-hidden rounded-full bg-primary text-primary-fg shadow-btn transition hover:bg-primary-hover"
            >
              <span className="pl-6 pr-3 text-[15px] font-medium">Open the repo</span>
              <span className="mr-1.5 grid size-9 place-items-center rounded-full bg-white/20">
                <ArrowRight className="size-4" strokeWidth={2.25} />
              </span>
            </a>
            <Link
              to="/"
              className="text-[15px] font-medium text-fg-muted transition hover:text-fg"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>

      <OceanShore>
        <SiteFooter />
      </OceanShore>
    </div>
  );
}
