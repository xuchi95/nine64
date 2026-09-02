import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP } from "@/config/app";
import { useAuth } from "@/lib/auth";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import { Loader2, Swords, Eye } from "lucide-react";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { useT } from "@/lib/i18n";
import { MatchFoundDialog } from "@/components/online/MatchFoundDialog";
import { onlineVariants } from "@/config/variants";
import {
  DAILY_PRESETS,
  POOL_LABELS,
  REALTIME_PRESETS,
  parseTimeControl,
} from "@/lib/online/timeControl";
import {
  createChallenge,
  listChallenges,
  respondChallenge,
  type Challenge,
} from "@/lib/online.challenges.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/online")({
  head: () => ({
    meta: [
      { title: `Chơi online — ${APP.name}` },
      { name: "description", content: "Tìm đối thủ xếp hạng theo thời gian thực trên Nine64." },
      { property: "og:title", content: `Chơi online — ${APP.name}` },
      { property: "og:description", content: "Ghép trận xếp hạng thời gian thực trên Nine64." },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: OnlinePage,
});

type ChallengeLists = {
  incoming: Challenge[];
  outgoing: Challenge[];
  open: Challenge[];
  accepted: Challenge[];
};

const EMPTY_LISTS: ChallengeLists = { incoming: [], outgoing: [], open: [], accepted: [] };

function OnlinePage() {
  const { t } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state, startSearch, stopSearch, acceptMatch, declineMatch } = useMatchmaking();
  const listChallengesFn = useServerFn(listChallenges);
  const createChallengeFn = useServerFn(createChallenge);
  const respondChallengeFn = useServerFn(respondChallenge);

  const [variant, setVariant] = useState("standard");
  const [timeControl, setTimeControl] = useState("300+0");
  const [rated, setRated] = useState(true);
  const [color, setColor] = useState<"white" | "black" | "random">("random");
  const [allowTakeback, setAllowTakeback] = useState(false);
  const [spectate, setSpectate] = useState<"public" | "private">("public");
  const [delay, setDelay] = useState<0 | 15 | 30 | 60>(0);
  const [message, setMessage] = useState("");
  const [challenges, setChallenges] = useState<ChallengeLists>(EMPTY_LISTS);
  const [busy, setBusy] = useState(false);

  const searching = state.kind === "searching";
  const spec = parseTimeControl(timeControl);

  // Capability registry is the only source of truth: a variant appears here
  // only when the server actually validates its rules online.
  const VARIANTS = onlineVariants().map((v) => ({
    id: v.id,
    name: v.id === "chess960" ? t("play.online.variantChess960") : t("play.online.variantStandard"),
  }));

  const refreshChallenges = useCallback(async () => {
    try {
      const res = (await listChallengesFn()) as ChallengeLists;
      setChallenges(res);
      // A challenge we created was just accepted — jump straight into the game.
      const mine = res.accepted.find((c) => c.creator_id === user?.id && c.game_id);
      if (mine?.game_id) void navigate({ to: "/game/$gameId", params: { gameId: mine.game_id } });
    } catch {
      // Non-fatal: the poll below retries.
    }
  }, [listChallengesFn, navigate, user?.id]);

  useEffect(() => {
    void refreshChallenges();
    const id = window.setInterval(() => void refreshChallenges(), 5000);
    return () => window.clearInterval(id);
  }, [refreshChallenges]);

  const submitChallenge = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = (await createChallengeFn({
        data: {
          variant,
          timeControl,
          rated,
          color,
          allowTakeback: allowTakeback && !rated,
          spectate,
          spectatorDelaySeconds: delay,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      })) as { ok: boolean; code: string };
      if (out.ok) {
        toast.success(t("play.online.challengeCreated"));
        setMessage("");
        await refreshChallenges();
      } else {
        toast.error(out.code);
      }
    } catch {
      toast.error(t("play.online.challengeFailed"));
    } finally {
      setBusy(false);
    }
  }, [
    allowTakeback,
    busy,
    color,
    createChallengeFn,
    delay,
    message,
    rated,
    refreshChallenges,
    spectate,
    t,
    timeControl,
    variant,
  ]);

  const respond = useCallback(
    async (challengeId: string, action: "accept" | "decline" | "cancel") => {
      if (busy) return;
      setBusy(true);
      try {
        const out = (await respondChallengeFn({ data: { challengeId, action } })) as {
          ok: boolean;
          code: string;
          game: { id: string } | null;
        };
        if (out.ok && out.game) {
          void navigate({ to: "/game/$gameId", params: { gameId: out.game.id } });
          return;
        }
        if (!out.ok) toast.error(out.code);
        await refreshChallenges();
      } catch {
        toast.error(t("play.online.challengeFailed"));
      } finally {
        setBusy(false);
      }
    },
    [busy, navigate, refreshChallenges, respondChallengeFn, t],
  );

  const describe = (c: Challenge) => {
    const s = parseTimeControl(c.time_control);
    return `${s.label} · ${c.rated ? t("play.online.rated") : t("play.online.casual")} · ${
      c.variant === "chess960" ? "Chess960" : t("play.online.variantStandard")
    }`;
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">{t("play.online.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("play.online.subtitle")}</p>

        <Tabs defaultValue="quick" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quick">{t("play.online.matchmaking")}</TabsTrigger>
            <TabsTrigger value="custom">{t("play.online.customChallenge")}</TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("play.online.matchmaking")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("play.online.variant")}</Label>
                  <Select value={variant} onValueChange={setVariant} disabled={searching}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIANTS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("play.online.timeControl")}</Label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {REALTIME_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={searching}
                        onClick={() => setTimeControl(p.id)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-sm transition-colors",
                          timeControl === p.id
                            ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/35"
                            : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span className="block font-mono">{p.label}</span>
                        <span
                          className={cn(
                            "block text-[11px]",
                            timeControl === p.id
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {POOL_LABELS[p.pool].vi}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {DAILY_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={searching}
                        onClick={() => setTimeControl(p.id)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-xs transition-colors",
                          timeControl === p.id
                            ? "border-brass bg-brass/10 font-semibold"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("play.online.poolNote", { pool: POOL_LABELS[spec.pool].vi })}
                  </p>
                </div>

                {searching ? (
                  <Button
                    className="w-full"
                    size="lg"
                    variant="secondary"
                    onClick={() => void stopSearch()}
                  >
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("play.online.cancelSearch")}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => void startSearch(variant, timeControl)}
                  >
                    {t("play.online.findOpponent")}
                  </Button>
                )}

                {searching && (
                  <p className="text-center text-sm text-muted-foreground">
                    {t("play.online.waitingText")}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("play.online.customChallenge")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("play.online.variant")}</Label>
                    <Select value={variant} onValueChange={setVariant}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIANTS.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("play.online.timeControl")}</Label>
                    <Select value={timeControl} onValueChange={setTimeControl}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...REALTIME_PRESETS, ...DAILY_PRESETS].map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label} · {POOL_LABELS[p.pool].vi}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("play.online.color")}</Label>
                    <Select value={color} onValueChange={(v) => setColor(v as typeof color)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="random">{t("play.online.colorRandom")}</SelectItem>
                        <SelectItem value="white">{t("play.online.colorWhite")}</SelectItem>
                        <SelectItem value="black">{t("play.online.colorBlack")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("play.online.spectators")}</Label>
                    <Select
                      value={`${spectate}:${delay}`}
                      onValueChange={(v) => {
                        const [mode, d] = v.split(":");
                        setSpectate(mode as "public" | "private");
                        setDelay(Number(d) as 0 | 15 | 30 | 60);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public:0">{t("play.online.spectateLive")}</SelectItem>
                        <SelectItem value="public:15">{t("play.online.spectateDelay15")}</SelectItem>
                        <SelectItem value="public:30">{t("play.online.spectateDelay30")}</SelectItem>
                        <SelectItem value="public:60">{t("play.online.spectateDelay60")}</SelectItem>
                        <SelectItem value="private:0">{t("play.online.spectateOff")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{t("play.online.rated")}</p>
                    <p className="text-xs text-muted-foreground">{t("play.online.ratedNote")}</p>
                  </div>
                  <Switch
                    checked={rated}
                    onCheckedChange={(v) => {
                      setRated(v);
                      if (v) setAllowTakeback(false);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{t("play.online.takeback")}</p>
                    <p className="text-xs text-muted-foreground">{t("play.online.takebackNote")}</p>
                  </div>
                  <Switch checked={allowTakeback} disabled={rated} onCheckedChange={setAllowTakeback} />
                </div>

                <div className="space-y-2">
                  <Label>{t("play.online.message")}</Label>
                  <Input
                    value={message}
                    maxLength={200}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("play.online.messagePlaceholder")}
                  />
                </div>

                <Button className="w-full" disabled={busy} onClick={() => void submitChallenge()}>
                  <Swords className="mr-2 size-4" />
                  {t("play.online.createChallenge")}
                </Button>
              </CardContent>
            </Card>

            {(challenges.incoming.length > 0 ||
              challenges.outgoing.length > 0 ||
              challenges.open.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("play.online.challenges")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {challenges.incoming.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{t("play.online.incoming")}</p>
                        <p className="text-xs text-muted-foreground">{describe(c)}</p>
                        {c.message && <p className="mt-1 text-xs italic">“{c.message}”</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void respond(c.id, "accept")}>
                          {t("play.online.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void respond(c.id, "decline")}
                        >
                          {t("play.online.decline")}
                        </Button>
                      </div>
                    </div>
                  ))}

                  {challenges.open.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{t("play.online.openChallenge")}</p>
                        <p className="text-xs text-muted-foreground">{describe(c)}</p>
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => void respond(c.id, "accept")}>
                        {t("play.online.accept")}
                      </Button>
                    </div>
                  ))}

                  {challenges.outgoing.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {t("play.online.outgoing")}{" "}
                          <Badge variant="secondary">{t("play.online.waiting")}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">{describe(c)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void respond(c.id, "cancel")}
                      >
                        {t("play.online.cancel")}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <span>{t("play.online.signedInAs", { email: user?.email ?? "" })}</span>
          <div className="flex gap-4">
            <Link to="/watch/platform" className="inline-flex items-center gap-1 font-semibold text-brass underline">
              <Eye className="size-3.5" /> {t("play.online.watchLive")}
            </Link>
            <Link to="/online/diagnostics" className="font-semibold text-brass underline">
              {t("play.mmDiag.title")}
            </Link>
          </div>
        </div>
      </div>

      <MatchFoundDialog
        open={state.kind === "found" || state.kind === "accepting"}
        pending={state.kind === "accepting"}
        opponent={state.kind === "found" || state.kind === "accepting" ? state.opponent : null}
        deadline={state.kind === "found" || state.kind === "accepting" ? state.deadline : 0}
        variantLabel={VARIANTS.find((v) => v.id === variant)?.name ?? variant}
        timeControlLabel={spec.label}
        onAccept={() => void acceptMatch()}
        onDecline={() => void declineMatch()}
      />
    </AppShell>
  );
}
