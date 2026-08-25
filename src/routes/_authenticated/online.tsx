import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP } from "@/config/app";
import { useAuth } from "@/lib/auth";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import { Loader2 } from "lucide-react";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { useT } from "@/lib/i18n";

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

function OnlinePage() {
  const { t } = useT();
  const { user } = useAuth();
  const { state, startSearch, stopSearch } = useMatchmaking();
  const [variant, setVariant] = useState("standard");
  const [timeControl, setTimeControl] = useState("blitz5m");
  const searching = state.kind === "searching";

  const VARIANTS = [
    { id: "standard", name: t("play.online.variantStandard") },
    { id: "chess960", name: t("play.online.variantChess960") },
  ];

  const TIME_CONTROLS = [
    { id: "blitz1m", name: "1+0", label: t("play.online.tcBullet1") },
    { id: "blitz3m", name: "3+0", label: t("play.online.tcBlitz3") },
    { id: "blitz5m", name: "5+0", label: t("play.online.tcBlitz5") },
    { id: "rapid10m", name: "10+0", label: t("play.online.tcRapid10") },
    { id: "rapid15m", name: "15+10", label: t("play.online.tcRapid15") },
    { id: "rapid30m", name: "30+0", label: t("play.online.tcClassical30") },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">{t("play.online.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("play.online.subtitle")}</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">{t("play.online.matchmaking")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Select value={timeControl} onValueChange={setTimeControl} disabled={searching}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_CONTROLS.map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {t("play.online.signedInAs", { email: user?.email ?? "" })}
        </div>
      </div>
    </AppShell>
  );
}
