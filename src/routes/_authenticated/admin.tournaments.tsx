import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus, RefreshCw, Trophy } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import {
  adminListTournaments,
  adminSaveTournament,
  adminSetTournamentState,
  adminTickTournaments,
} from "@/lib/tournaments/tournaments.functions";
import { TOURNAMENT_FORMATS, type TournamentFormat } from "@/lib/tournaments/types";

export const Route = createFileRoute("/_authenticated/admin/tournaments")({
  head: () => ({
    meta: [
      { title: `Giải đấu · ${APP.name}` },
      {
        name: "description",
        content: "Quản trị giải đấu Nine64: tạo lịch, phát hành, tạm dừng và điều phối vòng đấu.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Giải đấu · ${APP.name}` },
      { property: "og:description", content: "Công cụ nội bộ điều hành giải đấu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTournamentsPage,
});

type Row = Awaited<ReturnType<typeof adminListTournaments>>[number];

const BLANK = {
  slug: "",
  name: "",
  format: "arena" as TournamentFormat,
  timeControl: "180+2",
  startsAt: "",
  durationMinutes: 60,
  roundsTotal: 5,
  maxPlayers: "" as string,
};

function AdminTournamentsPage() {
  const { t } = useT();
  const listFn = useServerFn(adminListTournaments);
  const saveFn = useServerFn(adminSaveTournament);
  const stateFn = useServerFn(adminSetTournamentState);
  const tickFn = useServerFn(adminTickTournaments);

  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await listFn({})) as Row[]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "load_failed");
    }
  }, [listFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(label);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "action_failed");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () =>
        saveFn({
          data: {
            slug: form.slug.trim(),
            name: form.name.trim(),
            format: form.format,
            variant: "standard",
            timeControl: form.timeControl.trim(),
            rated: true,
            startsAt: new Date(form.startsAt).toISOString(),
            durationMinutes: Number(form.durationMinutes),
            roundsTotal: Number(form.roundsTotal),
            maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
            minRating: null,
            maxRating: null,
            lateJoin: true,
            tiebreaks: ["buchholz", "sonneborn_berger"],
            scoring: {},
            status: "scheduled",
          },
        }),
      t("tourney.admin.saved"),
    );

  return (
    <AdminShell module="tournaments" title={t("tourney.admin.title")}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("tourney.admin.subtitle")}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = (await tickFn({ data: {} })) as { results: unknown[] };
                  return res;
                }, t("tourney.admin.ticked", { n: rows.length }))
              }
            >
              <RefreshCw className="mr-1.5 size-4" />
              {t("tourney.admin.runNow")}
            </Button>
          </div>
        </div>

        {message && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" />
              {t("tourney.admin.new")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="tname">Name</Label>
              <Input
                id="tname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tslug">Slug</Label>
              <Input
                id="tslug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tformat">Format</Label>
              <select
                id="tformat"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as TournamentFormat })}
              >
                {TOURNAMENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(`tourney.format.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ttc">Time control</Label>
              <Input
                id="ttc"
                value={form.timeControl}
                onChange={(e) => setForm({ ...form, timeControl: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tstart">Starts at</Label>
              <Input
                id="tstart"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tdur">Duration (min)</Label>
              <Input
                id="tdur"
                type="number"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="trounds">Rounds</Label>
              <Input
                id="trounds"
                type="number"
                value={form.roundsTotal}
                onChange={(e) => setForm({ ...form, roundsTotal: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="tmax">Max players</Label>
              <Input
                id="tmax"
                type="number"
                value={form.maxPlayers}
                onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button
                size="sm"
                disabled={busy || !form.slug || !form.name || !form.startsAt}
                onClick={() => void save()}
              >
                {t("tourney.admin.save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" />
              {t("tourney.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`tourney.format.${row.format}`)} · {row.timeControl} ·{" "}
                    {new Date(row.startsAt).toLocaleString("vi-VN")} ·{" "}
                    {t("tourney.roundOf", { n: row.currentRound, total: row.roundsTotal })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t(`tourney.status.${row.status}`)}</Badge>
                  {row.paused && <Badge variant="secondary">{t("tourney.paused")}</Badge>}
                  {row.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => stateFn({ data: { id: row.id, action: "publish" } }),
                          t("tourney.admin.publish"),
                        )
                      }
                    >
                      {t("tourney.admin.publish")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          stateFn({
                            data: { id: row.id, action: row.paused ? "resume" : "pause" },
                          }),
                        row.paused ? t("tourney.admin.resume") : t("tourney.admin.pause"),
                      )
                    }
                  >
                    {row.paused ? t("tourney.admin.resume") : t("tourney.admin.pause")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => tickFn({ data: { id: row.id } }),
                        t("tourney.admin.ticked", { n: 1 }),
                      )
                    }
                  >
                    <Play className="mr-1.5 size-4" />
                    {t("tourney.admin.runNow")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => stateFn({ data: { id: row.id, action: "cancel" } }),
                        t("tourney.admin.cancel"),
                      )
                    }
                  >
                    {t("tourney.admin.cancel")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
