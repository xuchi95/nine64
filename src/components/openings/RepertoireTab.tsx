import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Ban, Star, Trash2, GitBranch, Save } from "lucide-react";
import { OpeningBoard, pathLabel } from "@/components/openings/OpeningBoard";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRepertoireLine,
  renameRepertoire,
  updateRepertoireMove,
} from "@/lib/openings/repertoire.functions";
import {
  sansOf,
  type Repertoire,
  type RepertoireColor,
  type RepertoireLine,
} from "@/lib/openings/repertoireTypes";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface RepertoireData {
  repertoires: Repertoire[];
  lines: RepertoireLine[];
}

export function RepertoireTab({
  signedIn,
  data,
  onReload,
}: {
  signedIn: boolean;
  data: RepertoireData | null;
  onReload: () => void;
}) {
  const { t } = useT();
  const updateMoveFn = useServerFn(updateRepertoireMove);
  const deleteLineFn = useServerFn(deleteRepertoireLine);
  const renameFn = useServerFn(renameRepertoire);

  const [color, setColor] = useState<RepertoireColor>("white");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const repertoire = useMemo(
    () => data?.repertoires.find((r) => r.color === color) ?? null,
    [data, color],
  );
  const lines = useMemo(
    () => (data?.lines ?? []).filter((l) => l.repertoireId === repertoire?.id),
    [data, repertoire],
  );
  const selected = useMemo(
    () => lines.find((l) => l.id === selectedLineId) ?? lines[0] ?? null,
    [lines, selectedLineId],
  );

  useEffect(() => {
    setName(repertoire?.name ?? "");
  }, [repertoire?.name]);

  const setKind = useCallback(
    async (moveId: string, kind: "main" | "alternative" | "avoid") => {
      try {
        await updateMoveFn({ data: { moveId, kind } });
        onReload();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "update_failed");
      }
    },
    [onReload, updateMoveFn],
  );

  if (!signedIn) {
    return <p className="panel p-6 text-sm text-muted-foreground">{t("lab.signInHint")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["white", "black"] as RepertoireColor[]).map((c) => (
          <Button key={c} size="sm" variant={color === c ? "default" : "outline"} onClick={() => setColor(c)}>
            {t(c === "white" ? "lab.white" : "lab.black")}
          </Button>
        ))}
        {repertoire ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-56"
              aria-label={t("lab.rep.name")}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await renameFn({ data: { repertoireId: repertoire.id, name, description: "" } });
                  onReload();
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "rename_failed");
                }
              }}
            >
              <Save className="size-4" /> {t("lab.rep.save")}
            </Button>
            <span className="font-mono text-2xs text-muted-foreground">
              {t("lab.rep.counts", { lines: repertoire.lines, moves: repertoire.moves })}
            </span>
          </>
        ) : null}
      </div>

      {message ? <p className="text-xs text-destructive">{message}</p> : null}

      {lines.length === 0 ? (
        <div className="panel p-6 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("lab.rep.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <GamePanel title={t("lab.rep.lines")} bodyClassName="p-2">
            <ul className="space-y-1">
              {lines.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedLineId(line.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-2 text-left transition hover:bg-surface-2",
                      selected?.id === line.id && "bg-surface-2",
                    )}
                  >
                    <span className="block truncate text-xs font-semibold">
                      {line.eco ? `${line.eco} · ` : ""}
                      {line.openingName || line.name || line.rootPath}
                    </span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {pathLabel(sansOf(line.rootPath))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </GamePanel>

          {selected ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="mx-auto w-full max-w-[460px]">
                <OpeningBoard
                  sans={sansOf(selected.rootPath)}
                  orientation={color === "white" ? "w" : "b"}
                  interactive={false}
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await deleteLineFn({ data: { lineId: selected.id } });
                      setSelectedLineId(null);
                      onReload();
                    }}
                  >
                    <Trash2 className="size-4" /> {t("lab.rep.delete")}
                  </Button>
                </div>
              </div>

              <GamePanel title={t("lab.rep.moves")} bodyClassName="p-2">
                <ul className="space-y-1">
                  {selected.moves.map((move) => (
                    <li key={move.id} className="rounded-md border border-border/50 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">
                          {Math.floor(move.ply / 2) + 1}
                          {move.ply % 2 === 0 ? "." : "…"} {move.san}
                        </span>
                        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {move.isOwnMove ? t("lab.rep.yours") : t("lab.rep.opponent")}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(["main", "alternative", "avoid"] as const).map((kind) => (
                          <Button
                            key={kind}
                            size="sm"
                            variant={move.kind === kind ? "default" : "ghost"}
                            className="h-6 px-2 text-2xs"
                            onClick={() => void setKind(move.id, kind)}
                          >
                            {kind === "main" ? <Star className="size-3" /> : null}
                            {kind === "alternative" ? <GitBranch className="size-3" /> : null}
                            {kind === "avoid" ? <Ban className="size-3" /> : null}
                            {t(`lab.rep.kind.${kind}`)}
                          </Button>
                        ))}
                      </div>
                      {move.notes ? (
                        <p className="mt-1 text-2xs text-muted-foreground">{move.notes}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("lab.rep.notePlaceholder")}
                    className="min-h-20 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!notes.trim() || selected.moves.length === 0}
                    onClick={async () => {
                      const last = selected.moves[selected.moves.length - 1];
                      if (!last) return;
                      await updateMoveFn({ data: { moveId: last.id, notes } });
                      setNotes("");
                      onReload();
                    }}
                  >
                    <Save className="size-4" /> {t("lab.rep.saveNote")}
                  </Button>
                </div>
              </GamePanel>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
