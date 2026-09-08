import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Secure sign-in for FranklyEdu Global CRM agents and administrators.",
      },
      { property: "og:title", content: "Sign in — FranklyEdu Global CRM" },
      {
        property: "og:description",
        content: "Secure sign-in for FranklyEdu Global CRM agents and administrators.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard", replace: true });
  }, [ready, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setPending(true);
    try {
      await login(email.trim(), password);
      toast.success("Signed in", { description: "Welcome back to FranklyEdu CRM." });
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to sign in. Please try again.";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="FranklyEdu Global Logo"
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="text-sm font-semibold">FranklyEdu Global</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl leading-tight font-semibold">
            One workspace for property, education and partnership leads.
          </h2>
          <p className="text-sm text-muted-foreground">
            Track every enquiry from WhatsApp, Instagram, email and the website in a single
            pipeline, with a unified inbox and a full activity trail on every lead.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Internal system — authorised staff only
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img
              src="/logo.png"
              alt="FranklyEdu Global Logo"
              className="h-10 w-10 object-contain"
            />
          </div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your FranklyEdu Global staff account.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@frankedu-global.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-0 flex h-full items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-r-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Sessions use short-lived access tokens with rotating refresh tokens. Contact an
            administrator if you need an account.
          </p>
        </div>
      </div>
    </div>
  );
}
