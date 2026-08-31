import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Everything behind auth is private: one noindex here covers the whole
  // subtree (meta entries dedupe by name, so leaves may still override).
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),

  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth/login", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
