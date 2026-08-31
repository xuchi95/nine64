import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, RefreshCw, Search } from "lucide-react";
import { z } from "zod";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { listAdminUsers } from "@/lib/adminUsers.functions";
import type { AdminUserListResult, AdminUserRow } from "@/lib/admin/userTypes";

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.number().int().min(1).optional(),
  role: z.enum(["any", "admin", "moderator", "user"]).optional(),
  status: z
    .enum(["any", "active", "restricted", "suspended", "pending_deletion", "anonymized"])
    .optional(),
  fairplay: z.enum(["any", "clean", "flagged", "locked"]).optional(),
  sort: z.enum(["created_at", "rating", "peak_rating", "games_played", "display_name"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: `Quản lý người dùng · ${APP.name}` },
      { name: "description", content: "Khu vực quản trị người dùng Nine64." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Quản lý người dùng · ${APP.name}` },
      { property: "og:description", content: "Khu vực quản trị người dùng Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  restricted: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  suspended: "bg-destructive/15 text-destructive border-destructive/30",
  pending_deletion: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  anonymized: "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return (
    <Badge variant="outline" className={STATUS_TONE[status] ?? ""}>
      {t(`adminc.users.status.${status}`)}
    </Badge>
  );
}

function CopyId({ id }: { id: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("adminc.users.copyId")}
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
    >
      <Copy className="size-3" />
      {copied ? t("adminc.users.copied") : `${id.slice(0, 8)}…`}
    </button>
  );
}

function AdminUsersPage() {
  const { t } = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const listFn = useServerFn(listAdminUsers);

  const [term, setTerm] = useState(search.q ?? "");
  const [result, setResult] = useState<AdminUserListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search → URL search params, so a reload keeps the filter set.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if ((search.q ?? "") !== term) {
        void navigate({ search: (prev) => ({ ...prev, q: term || undefined, page: 1 }) });
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [term, navigate, search.q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void listFn({
      data: {
        page: search.page ?? 1,
        pageSize: 20,
        q: search.q ?? "",
        role: search.role ?? "any",
        status: search.status ?? "any",
        fairplay: search.fairplay ?? "any",
        sort: search.sort ?? "created_at",
        dir: search.dir ?? "desc",
      },
    })
      .then((r) => {
        if (alive) setResult(r as AdminUserListResult);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "UNKNOWN_ERROR");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [listFn, search.page, search.q, search.role, search.status, search.fairplay, search.sort, search.dir, nonce]);

  const pages = useMemo(
    () => (result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1),
    [result],
  );
  const page = search.page ?? 1;

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });

  return (
    <AdminShell module="users" title={t("adminc.nav.users")}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("adminc.nav.users")}</h1>
            <p className="text-sm text-muted-foreground">{t("adminc.users.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="mr-2 size-4" />
            {t("adminc.users.refresh")}
          </Button>
        </header>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t("adminc.users.search")}
                aria-label={t("adminc.users.search")}
                className="pl-9"
              />
            </div>

            <Select value={search.role ?? "any"} onValueChange={(v) => setFilter({ role: v })}>
              <SelectTrigger className="w-[150px]" aria-label={t("adminc.users.role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("adminc.users.any")}</SelectItem>
                <SelectItem value="admin">{t("adminc.users.role.admin")}</SelectItem>
                <SelectItem value="moderator">{t("adminc.users.role.moderator")}</SelectItem>
                <SelectItem value="user">{t("adminc.users.role.user")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={search.status ?? "any"} onValueChange={(v) => setFilter({ status: v })}>
              <SelectTrigger className="w-[170px]" aria-label={t("adminc.users.status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("adminc.users.any")}</SelectItem>
                {["active", "restricted", "suspended", "pending_deletion", "anonymized"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`adminc.users.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={search.fairplay ?? "any"} onValueChange={(v) => setFilter({ fairplay: v })}>
              <SelectTrigger className="w-[160px]" aria-label={t("adminc.users.fairplay")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("adminc.users.any")}</SelectItem>
                <SelectItem value="clean">{t("adminc.users.fp.clean")}</SelectItem>
                <SelectItem value="flagged">{t("adminc.users.fp.flagged")}</SelectItem>
                <SelectItem value="locked">{t("adminc.users.fp.locked")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={`${search.sort ?? "created_at"}:${search.dir ?? "desc"}`}
              onValueChange={(v) => {
                const [sort, dir] = v.split(":");
                setFilter({ sort, dir });
              }}
            >
              <SelectTrigger className="w-[180px]" aria-label={t("adminc.users.sort")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at:desc">{t("adminc.users.col.created")} ↓</SelectItem>
                <SelectItem value="created_at:asc">{t("adminc.users.col.created")} ↑</SelectItem>
                <SelectItem value="rating:desc">{t("adminc.users.col.rating")} ↓</SelectItem>
                <SelectItem value="rating:asc">{t("adminc.users.col.rating")} ↑</SelectItem>
                <SelectItem value="games_played:desc">{t("adminc.users.col.games")} ↓</SelectItem>
                <SelectItem value="display_name:asc">A → Z</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTerm("");
                void navigate({ search: {} });
              }}
            >
              {t("adminc.users.reset")}
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !result || result.rows.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {t("adminc.users.empty")}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("adminc.users.col.user")}</th>
                    <th className="p-3">{t("adminc.users.col.email")}</th>
                    <th className="p-3">{t("adminc.users.col.role")}</th>
                    <th className="p-3">{t("adminc.users.col.status")}</th>
                    <th className="p-3 text-right">{t("adminc.users.col.rating")}</th>
                    <th className="p-3 text-right">{t("adminc.users.col.games")}</th>
                    <th className="p-3 text-right">{t("adminc.users.col.reports")}</th>
                    <th className="p-3">{t("adminc.users.col.lastSignIn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <UserRow key={row.userId} row={row} />
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {result.rows.map((row) => (
                <Card key={row.userId}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to="/admin/users/$userId"
                        params={{ userId: row.userId }}
                        className="font-semibold hover:underline"
                      >
                        {row.displayName}
                      </Link>
                      <StatusBadge status={row.status} />
                    </div>
                    <CopyId id={row.userId} />
                    <div className="grid grid-cols-2 gap-1 font-mono text-xs text-muted-foreground">
                      <span>{t("adminc.users.col.rating")}: {row.rating}</span>
                      <span>{t("adminc.users.col.games")}: {row.gamesPlayed}</span>
                      <span>{t("adminc.users.col.role")}: {t(`adminc.users.role.${row.role}`)}</span>
                      <span>{t("adminc.users.col.reports")}: {row.reportCount}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{t("adminc.users.total").replace("{count}", String(result.total))}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => void navigate({ search: (p) => ({ ...p, page: page - 1 }) })}
                >
                  {t("adminc.users.prev")}
                </Button>
                <span>
                  {t("adminc.users.page").replace("{page}", String(page)).replace("{pages}", String(pages))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => void navigate({ search: (p) => ({ ...p, page: page + 1 }) })}
                >
                  {t("adminc.users.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function UserRow({ row }: { row: AdminUserRow }) {
  const { t } = useT();
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30">
      <td className="p-3">
        <Link
          to="/admin/users/$userId"
          params={{ userId: row.userId }}
          className="font-medium hover:underline"
        >
          {row.displayName}
        </Link>
        <div>
          <CopyId id={row.userId} />
        </div>
      </td>
      <td className="p-3 font-mono text-xs text-muted-foreground">{row.emailMasked ?? "—"}</td>
      <td className="p-3">{t(`adminc.users.role.${row.role}`)}</td>
      <td className="p-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="p-3 text-right font-mono">{row.rating}</td>
      <td className="p-3 text-right font-mono">{row.gamesPlayed}</td>
      <td className="p-3 text-right font-mono">{row.reportCount}</td>
      <td className="p-3 text-xs text-muted-foreground">
        {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleString() : "—"}
      </td>
    </tr>
  );
}
