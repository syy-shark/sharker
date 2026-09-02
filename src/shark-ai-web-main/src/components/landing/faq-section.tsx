import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "How does Sharker work?",
    a: "It runs on your Mac. The model thinks; the harness does the work: read the repo, edit files, run commands, verify, commit. Risky steps ask you first.",
  },
  {
    q: "What tools does it have?",
    a: "Files, Shell, Git, Web, Browser, Desktop, and Voice. Not a Gmail / Slack plugin shelf — hands that execute locally.",
  },
  {
    q: "How is this different from a chat box or a cloud assistant?",
    a: "The workspace is local. Keys are encrypted with safeStorage and never leave this machine. Switch models without switching apps; context stays in the task.",
  },
  {
    q: "Is my data private?",
    a: "There's no installer yet — you clone and run the source. Sessions and memory stay on disk. Don't commit API keys.",
  },
  {
    q: "Who is it for?",
    a: "Anyone who wants work finished in their own repo. Apple Silicon Mac, Node 22+, and an OpenAI-compatible key.",
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-2xl space-y-2.5">
      {faqs.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-soft backdrop-blur-md"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span className="text-[15px] font-medium tracking-tight text-fg">
                {item.q}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-fg-subtle transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
                strokeWidth={1.75}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-200",
                isOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="border-t border-border/60 px-5 py-4 text-[14px] leading-relaxed text-fg-muted text-pretty">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
