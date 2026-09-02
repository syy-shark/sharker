/**
 * 主页海岸线与 Tutorial 页共用的页脚。价格入口已去掉，改链 Tutorial。
 *
 * @see ./ARCH.md
 */
import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="pb-14 pt-6 sm:pb-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3.5 px-4 sm:px-6">
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] font-semibold tracking-wide text-white"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
        >
          <Link to="/" hash="product" className="opacity-95 transition hover:opacity-100">
            Product
          </Link>
          <span className="text-white/60" aria-hidden>
            ·
          </span>
          <Link to="/tutorial" className="opacity-95 transition hover:opacity-100">
            Tutorial
          </Link>
          <span className="text-white/60" aria-hidden>
            ·
          </span>
          <Link to="/" hash="faq" className="opacity-95 transition hover:opacity-100">
            Blog
          </Link>
          <span className="text-white/60" aria-hidden>
            ·
          </span>
          <span className="opacity-90">Privacy Policy</span>
          <span className="text-white/60" aria-hidden>
            ·
          </span>
          <span className="opacity-90">Terms of Service</span>
        </nav>
        <div className="flex items-center gap-2">
          <img
            src="/icons/shark.png"
            alt=""
            className="size-6 drop-shadow-sm"
          />
          <span
            className="text-sm font-semibold text-white"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          >
            Sharker
          </span>
        </div>
        <p
          className="text-center text-[12px] font-medium text-white/90"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
        >
          © 2026 Sharker. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
