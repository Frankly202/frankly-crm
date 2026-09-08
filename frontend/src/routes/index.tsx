import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FranklyEdu Global CRM" },
      { name: "description", content: "Sign in to the FranklyEdu Global internal CRM." },
      { property: "og:title", content: "FranklyEdu Global CRM" },
      { property: "og:description", content: "Sign in to the FranklyEdu Global internal CRM." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    navigate({ to: user ? "/dashboard" : "/login", replace: true });
  }, [ready, user, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
