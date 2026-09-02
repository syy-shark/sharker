/**
 * 本地闭环三步：说清楚 → 本机动手 → 你来验收。
 *
 * @see ./ARCH.md
 */
const steps = [
  {
    n: "1",
    title: "Say what you want done",
    body: "Pick a workspace. Sharker plans the steps — you don't have to list tools first.",
  },
  {
    n: "2",
    title: "It works on your Mac",
    body: "Read files, edit code, run Shell, open a browser. Risky steps ask first.",
  },
  {
    n: "3",
    title: "You review the result",
    body: "It tests and shows the diff. You decide whether to commit. Keys stay local.",
  },
] as const;

export function HowItWorks() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3 md:gap-6">
      {steps.map((s) => (
        <div key={s.n} className="text-center md:text-left">
          <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full border border-border bg-bg-elevated text-sm font-semibold text-fg shadow-soft md:mx-0">
            {s.n}
          </div>
          <h3 className="text-[17px] font-semibold tracking-tight text-fg">
            {s.title}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-muted text-pretty">
            {s.body}
          </p>
        </div>
      ))}
    </div>
  );
}
