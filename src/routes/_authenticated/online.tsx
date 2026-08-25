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

export const Route = createFileRoute("/_authenticated/online")({
  head: () => ({
    meta: [
      { title: `Play online — ${APP.name}` },
      { name: "description", content: "Find a ranked opponent in real time on Nine64." },
      { property: "og:title", content: `Play online — ${APP.name}` },
      { property: "og:description", content: "Ranked realtime matchmaking on Nine64." },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: OnlinePage,
});

const VARIANTS = [
  { id: "standard", name: "Standard" },
  { id: "chess960", name: "Chess960" },
];

const TIME_CONTROLS = [
  { id: "blitz1m", name: "1+0", label: "Bullet 1 min" },
  { id: "blitz3m", name: "3+0", label: "Blitz 3 min" },
  { id: "blitz5m", name: "5+0", label: "Blitz 5 min" },
  { id: "rapid10m", name: "10+0", label: "Rapid 10 min" },
  { id: "rapid15m", name: "15+10", label: "Rapid 15+10" },
  { id: "rapid30m", name: "30+0", label: "Classical 30 min" },
];

function OnlinePage() {
  const { user } = useAuth();
  const { state, startSearch, stopSearch } = useMatchmaking();
  const [variant, setVariant] = useState("standard");
  const [timeControl, setTimeControl] = useState("blitz5m");
  const searching = state.kind === "searching";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Play online</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find a ranked opponent in real time.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Matchmaking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Variant</Label>
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
                <Label>Time control</Label>
                <Select value={timeControl} onValueChange={setTimeControl} disabled={searching}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_CONTROLS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
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
                Cancel search
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => void startSearch(variant, timeControl)}
              >
                Find opponent
              </Button>
            )}

            {searching && (
              <p className="text-center text-sm text-muted-foreground">
                Waiting for an opponent with similar rating.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Signed in as {user?.email}
        </div>
      </div>
    </AppShell>
  );
}
