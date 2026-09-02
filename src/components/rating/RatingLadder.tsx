import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Flame, Swords, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RATING_TIERS,
  isProvisional,
  tierProgress,
  type RatingTier,
} from "@/lib/ratingTiers";

interface PoolRating {
  pool: string;
  rating: number;
  ratingDeviation: number;
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

const POOL_ORDER = ["blitz", "rapid", "bullet", "classical", "daily", "chess960"];

function sortPools(rows: PoolRating[]): PoolRating[] {
  return [...rows].sort(
    (a, b) => POOL_ORDER.indexOf(a.pool) - POOL_ORDER.indexOf(b.pool),
  );
}

/** Horizontal map of every tier; tiers the player holds in any pool glow. */
function LadderMap({ activeTiers }: { activeTiers: Set<string> }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-brass" />
        <h3 className="font-display text-sm font-semibold">{t("rank.ladderTitle")}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("rank.ladderHint")}</p>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {RATING_TIERS.map((tier: RatingTier) => {
          const active = activeTiers.has(tier.id);
          return (
            <li
              key={tier.id}
              className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs transition ${
                active
                  ? `${tier.badgeClass} ring-1 ring-current`
                  : "border-border/60 text-muted-foreground/60"
              }`}
              title={t(tier.i18nKey)}
            >
              <span className="font-semibold">{t(tier.i18nKey)}</span>
              <span className="ml-1.5 opacity-70">{tier.min}+</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PoolCard({ row }: { row: PoolRating }) {
  const { t } = useT();
  const { tier, next, pointsToNext, progressPct } = tierProgress(row.rating);
  const provisional = isProvisional(row.ratingDeviation, row.gamesPlayed);
  const total = row.wins + row.losses + row.draws;
  const winRate = total > 0 ? Math.round((row.wins / total) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t(`rank.pool.${row.pool}`)}
          </span>
          <Badge variant="outline" className={tier.badgeClass}>
            {tier.id === "legend" || tier.id === "grandmaster" ? (
              <Crown className="mr-1 size-3" />
            ) : null}
            {t(tier.i18nKey)}
          </Badge>
        </div>

        <div className="flex items-end gap-3">
          <span className="font-display text-4xl font-bold tracking-tight">
            {Math.round(row.rating)}
          </span>
          <div className="pb-1 text-xs text-muted-foreground">
            <p>
              {t("rank.peak")} {Math.round(row.peakRating)}
            </p>
            <p>
              {row.gamesPlayed} {t("rank.games")}
            </p>
          </div>
          {provisional ? (
            <Badge
              variant="outline"
              className="mb-1 border-orange-500/40 bg-orange-500/10 text-orange-400"
              title={t("rank.provisionalHint")}
            >
              <Flame className="mr-1 size-3" />
              {t("rank.provisional")}
            </Badge>
          ) : null}
        </div>

        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full rounded-full transition-all ${tier.barClass}`}
              style={{ width: `${Math.max(progressPct, 3)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {next
              ? t("rank.toNext")
                  .replace("{points}", String(pointsToNext))
                  .replace("{tier}", t(next.i18nKey))
              : t("rank.maxTier")}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span>
            {t("rank.record")
              .replace("{w}", String(row.wins))
              .replace("{d}", String(row.draws))
              .replace("{l}", String(row.losses))}
          </span>
          <span className="font-mono font-semibold text-foreground">
            {t("rank.winRate")} {winRate}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function RatingLadder({ userId }: { userId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<PoolRating[] | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_variant_ratings")
      .select("pool, rating, rating_deviation, peak_rating, games_played, wins, losses, draws")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (!alive) return;
        setRows(
          sortPools(
            (data ?? []).map((r) => ({
              pool: r.pool,
              rating: r.rating,
              ratingDeviation: r.rating_deviation,
              peakRating: r.peak_rating,
              gamesPlayed: r.games_played,
              wins: r.wins,
              losses: r.losses,
              draws: r.draws,
            })),
          ),
        );
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (rows === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const rated = rows.filter((r) => r.gamesPlayed > 0);
  const activeTiers = new Set(rated.map((r) => tierProgress(r.rating).tier.id));

  if (rated.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Swords className="size-8 text-brass" />
            <p className="text-sm text-muted-foreground">{t("rank.empty")}</p>
            <Button asChild>
              <Link to="/online">{t("rank.cta")}</Link>
            </Button>
          </CardContent>
        </Card>
        <LadderMap activeTiers={activeTiers} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {rated.map((row) => (
          <PoolCard key={row.pool} row={row} />
        ))}
      </div>
      <LadderMap activeTiers={activeTiers} />
    </div>
  );
}
