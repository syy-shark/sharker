import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="page-canvas grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/85 p-8 shadow-float backdrop-blur-xl">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <img src="/icons/shark.png" alt="Sharker" className="size-11" />
          <div>
            <h1 className="hero-title text-2xl text-fg">Sign in to Sharker</h1>
            <p className="mt-1.5 text-sm text-fg-muted">
              Continue with your account
            </p>
          </div>
        </div>
        {authEnabled ? (
          <div className="space-y-2.5">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-fg-muted">
            Sign-in is disabled.
          </p>
        )}
        <Link
          to="/"
          className="mt-6 block text-center text-sm text-fg-muted transition hover:text-fg"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
