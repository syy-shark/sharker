/**
 * 全站顶栏。主页用锚点，Tutorial 是独立路由。
 *
 * @see ./ARCH.md
 */
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", hash: "product", label: "Product" },
  { to: "/tutorial", label: "Tutorial" },
  { to: "/", hash: "faq", label: "Blog" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="relative z-20 px-3 pt-[calc(0.75rem+var(--grok-banner-h,0px))] sm:px-5">
      <div className="mx-auto flex max-w-[720px] items-center justify-between gap-2 rounded-full border border-white/70 bg-white/75 px-2 py-1.5 shadow-nav backdrop-blur-xl sm:px-2.5">
        <Link to="/" className="flex items-center gap-2 rounded-full py-1 pl-1.5 pr-1">
          <img
            src="/icons/shark.png"
            alt=""
            className="size-8"
          />
          <span className="text-[15px] font-semibold tracking-tight text-fg">
            Sharker
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {links.map((l) => {
            const active = l.to === "/tutorial" && pathname === "/tutorial";
            return (
              <Link
                key={l.label}
                to={l.to}
                hash={"hash" in l ? l.hash : undefined}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                  active ? "bg-black/[0.04] text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <a
            href="https://github.com/syy-shark/sharker"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg shadow-btn transition hover:bg-primary-hover sm:inline-flex"
          >
            GitHub
          </a>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-fg-muted md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto mt-2 max-w-[720px] overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-soft backdrop-blur-xl transition-all duration-200 md:hidden",
          open ? "max-h-64 opacity-100" : "max-h-0 border-0 opacity-0",
        )}
      >
        <div className="flex flex-col p-2">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              hash={"hash" in l ? l.hash : undefined}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-medium text-fg hover:bg-bg-subtle"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/syy-shark/sharker"
            target="_blank"
            rel="noreferrer"
            className="mt-1 rounded-full bg-primary py-2.5 text-center text-sm font-medium text-primary-fg"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
