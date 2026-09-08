import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Contact2, Inbox, LayoutDashboard, LogOut, Menu, Target } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Target },
  { to: "/contacts", label: "Contacts", icon: Contact2 },
  { to: "/inbox", label: "Inbox", icon: Inbox },
] as const;

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img
        src="/logo.png"
        alt="FranklyEdu Global Logo"
        className="h-9 w-9 shrink-0 object-contain"
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">FranklyEdu Global</p>
        <p className="truncate text-xs text-muted-foreground">Internal CRM</p>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-foreground"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login", replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!ready || !user) {
    return (
      <div className="min-h-screen space-y-4 p-6">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="space-y-6">
          <Brand />
          <NavLinks />
        </div>
        <div className="space-y-3">
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-sidebar-accent p-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold">
              {initials(user.name)}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.role}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 bg-sidebar p-4">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="space-y-6">
                    <Brand />
                    <NavLinks onNavigate={() => setMobileOpen(false)} />
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => void logout()}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
                {description && (
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>
                )}
              </div>
            </div>
            {actions && (
              <div className={cn("col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1")}>
                {actions}
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
