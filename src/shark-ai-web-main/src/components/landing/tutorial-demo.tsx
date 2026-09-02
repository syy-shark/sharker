/**
 * README「本地体验」那条路的动态演示：clone → install → npm run dev → 弹出桌面。
 *
 * @see ./ARCH.md
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AppMock } from "@/components/landing/app-mock";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "clone", title: "Clone the repo", hint: "Pull the source onto this Mac" },
  { id: "install", title: "Install", hint: "npm install at the root" },
  { id: "dev", title: "Start the desktop", hint: "npm run dev" },
  { id: "open", title: "The window opens", hint: "Look for starting Sharker desktop" },
  { id: "use", title: "Start working", hint: "Workspace · key · say what to do" },
] as const;

type Phase =
  | "clone-type"
  | "clone-out"
  | "install-type"
  | "install-out"
  | "dev-type"
  | "dev-out"
  | "window"
  | "use";

const PHASE_INDEX: Record<Phase, number> = {
  "clone-type": 0,
  "clone-out": 0,
  "install-type": 1,
  "install-out": 1,
  "dev-type": 2,
  "dev-out": 2,
  window: 3,
  use: 4,
};

const CLONE_CMD = "git clone https://github.com/syy-shark/sharker.git";
const INSTALL_CMD = "cd sharker && npm install";
const DEV_CMD = "npm run dev";

/**
 * 时间轴驱动的演示舞台。尊重 prefers-reduced-motion：直接停在最后一幕。
 */
export function TutorialDemo() {
  const [phase, setPhase] = useState<Phase>("clone-type");
  const [typed, setTyped] = useState("");
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduce) {
      setPhase("use");
      setTyped(DEV_CMD);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const typeOut = async (text: string, next: Phase) => {
      setTyped("");
      setPhase(next);
      for (let i = 1; i <= text.length; i += 1) {
        if (cancelled) return;
        setTyped(text.slice(0, i));
        await wait(18 + (text[i - 1] === " " ? 40 : 0));
      }
      await wait(280);
    };

    const run = async () => {
      while (!cancelled) {
        await typeOut(CLONE_CMD, "clone-type");
        if (cancelled) return;
        setPhase("clone-out");
        await wait(1100);

        await typeOut(INSTALL_CMD, "install-type");
        if (cancelled) return;
        setPhase("install-out");
        await wait(1600);

        await typeOut(DEV_CMD, "dev-type");
        if (cancelled) return;
        setPhase("dev-out");
        await wait(1400);

        setPhase("window");
        await wait(3800);
        if (cancelled) return;
        setPhase("use");
        await wait(5600);
      }
    };

    void run();
    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
  }, [reduce]);

  const step = PHASE_INDEX[phase];
  const showApp = phase === "window" || phase === "use";

  return (
    <div className="tutorial-stage">
      <ol className="tutorial-steps">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li
              key={s.id}
              className={cn(
                "tutorial-step",
                done && "is-done",
                current && "is-current",
              )}
            >
              <span className="tutorial-step__mark" aria-hidden>
                {done ? <Check className="size-3.5" strokeWidth={2.4} /> : i + 1}
              </span>
              <span>
                <span className="tutorial-step__title">{s.title}</span>
                <span className="tutorial-step__hint">{s.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="tutorial-viewport">
        <div className={cn("tutorial-scene", showApp && "is-app")}>
          <TerminalPane phase={phase} typed={typed} hidden={showApp} />
          <div className={cn("tutorial-app", showApp ? "is-in" : "is-out")}>
            <AppMock compact />
            {phase === "use" ? <UseCallouts /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalPane({
  phase,
  typed,
  hidden,
}: {
  phase: Phase;
  typed: string;
  hidden: boolean;
}) {
  return (
    <div className={cn("tutorial-term", hidden && "is-out")} aria-hidden={hidden}>
      <div className="tutorial-term__bar">
        <span className="size-[10px] rounded-full bg-[#ff5f57]" />
        <span className="size-[10px] rounded-full bg-[#febc2e]" />
        <span className="size-[10px] rounded-full bg-[#28c840]" />
        <span className="tutorial-term__title">zsh — sharker</span>
      </div>
      <div className="tutorial-term__body">
        <Line prompt typed={phase === "clone-type" ? typed : CLONE_CMD} live={phase === "clone-type"} />
        {phase !== "clone-type" ? (
          <p className="tutorial-term__out">Cloning into 'sharker'… done.</p>
        ) : null}

        {PHASE_INDEX[phase] >= 1 ? (
          <>
            <Line
              prompt
              typed={
                phase === "install-type" || phase === "clone-out"
                  ? phase === "install-type"
                    ? typed
                    : ""
                  : INSTALL_CMD
              }
              live={phase === "install-type"}
            />
            {PHASE_INDEX[phase] >= 1 && phase !== "install-type" && phase !== "clone-out" ? (
              <p className="tutorial-term__out">
                added 842 packages in 1m 12s
                <br />
                First run also installs workspace deps in src/sharker-core.
              </p>
            ) : null}
          </>
        ) : null}

        {PHASE_INDEX[phase] >= 2 ? (
          <>
            <Line
              prompt
              typed={
                phase === "dev-type" || phase === "install-out"
                  ? phase === "dev-type"
                    ? typed
                    : ""
                  : DEV_CMD
              }
              live={phase === "dev-type"}
            />
            {phase === "dev-out" || phase === "window" || phase === "use" ? (
              <p className="tutorial-term__out tutorial-term__out--ok">
                [dev] starting Sharker desktop
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Line({
  prompt,
  typed,
  live,
}: {
  prompt?: boolean;
  typed: string;
  live?: boolean;
}) {
  return (
    <p className="tutorial-term__cmd">
      {prompt ? <span className="tutorial-term__ps">➜ sharker</span> : null}{" "}
      <span>{typed}</span>
      {live ? <span className="tutorial-caret" /> : null}
    </p>
  );
}

function UseCallouts() {
  return (
    <ul className="tutorial-callouts">
      <li>
        <strong>1.</strong> Pick a local workspace
      </li>
      <li>
        <strong>2.</strong> Add an OpenAI-compatible key and model
      </li>
      <li>
        <strong>3.</strong> Say what you want done
      </li>
    </ul>
  );
}
