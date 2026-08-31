import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { GenericSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { VARIANTS, variantBlurb, variantName, type VariantId } from "@/config/variants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/variants")({
  head: () =>
    pageHead({
      path: "/play/variants",
      title: `Luật các biến thể cờ — ${APP.name}`,
      description:
        "Luật đầy đủ của Chess960, Ba lần chiếu, Vua trên đồi, Cờ thả, Cờ nguyên tử, Bầy Tốt, Đua Vua, Cờ cho quân và Không nhập thành trên Nine64.",
    }),
  pendingComponent: GenericSkeleton,
  component: VariantHelpPage,
});

/**
 * Rules text is authored in Vietnamese (the product's primary language) and is
 * deliberately concrete: each entry states how the game is WON, because that is
 * what differs between variants.
 */
const RULES_VI: Record<VariantId, string[]> = {
  standard: [
    "Luật FIDE đầy đủ: nhập thành, bắt tốt qua đường, phong cấp.",
    "Thắng khi chiếu hết. Hoà khi hết nước đi (stalemate), lặp ba lần, luật 50 nước hoặc không đủ lực chiếu hết.",
  ],
  chess960: [
    "Hàng cuối được xáo trộn ngẫu nhiên trong 960 thế trận hợp lệ: hai Tượng khác màu ô, Vua nằm giữa hai Xe.",
    "Hai bên đối xứng nhau; hàng Tốt và luật đi quân giữ nguyên như cờ tiêu chuẩn.",
    "Nhập thành vẫn đưa Vua về ô g (cánh Vua) hoặc ô c (cánh Hậu), Xe về f hoặc d — dù xuất phát ở đâu.",
    "Thắng thua giống cờ tiêu chuẩn.",
  ],
  "three-check": [
    "Luật đi quân giống cờ tiêu chuẩn.",
    "Bên nào chiếu Vua đối phương đủ 3 lần sẽ thắng ngay lập tức.",
    "Bộ đếm số lần chiếu là trạng thái chính thức của ván đấu (nằm trong FEN), không suy ra từ ký hiệu nước đi.",
    "Chiếu hết vẫn thắng bình thường, kể cả khi chưa đủ 3 lần chiếu.",
  ],
  "king-of-the-hill": [
    "Luật đi quân giống cờ tiêu chuẩn.",
    "Đưa Vua đến một trong bốn ô trung tâm d4, e4, d5, e5 một cách hợp lệ là thắng ngay.",
    "Vua vẫn không được đi vào ô bị chiếu, nên phải dọn đường trước khi tiến lên đồi.",
    "Chiếu hết vẫn là cách thắng hợp lệ.",
  ],
  crazyhouse: [
    "Quân bạn bắt được sẽ đổi phe và vào 'túi quân' của bạn.",
    "Thay cho một nước đi, bạn có thể thả một quân trong túi xuống bất kỳ ô trống nào.",
    "Không được thả Tốt xuống hàng 1 hoặc hàng 8.",
    "Quân đã phong cấp khi bị bắt sẽ trở lại thành Tốt trong túi của người bắt.",
    "Có thể thả quân để chặn nước chiếu, nhưng không thể thả để 'chiếu hết bằng thả quân' nếu vẫn còn nước gỡ.",
    "Thắng bằng chiếu hết như cờ tiêu chuẩn.",
  ],
  atomic: [
    "Mỗi lần bắt quân gây một vụ nổ: quân bị bắt, quân đi bắt và mọi quân không phải Tốt ở 8 ô xung quanh đều bị xoá khỏi bàn.",
    "Tốt chỉ biến mất khi chính nó bị bắt hoặc chính nó bắt quân.",
    "Thắng ngay khi Vua đối phương bị nổ; vì thế không được thực hiện nước bắt làm nổ chính Vua của mình.",
    "Hai Vua đứng cạnh nhau thì không thể chiếu nhau (vùng nổ bảo vệ).",
  ],
  horde: [
    "Trắng không có Vua: Trắng dàn một bầy Tốt dày đặc.",
    "Đen có đủ bộ quân tiêu chuẩn.",
    "Đen thắng khi ăn hết toàn bộ quân Tốt của Trắng.",
    "Trắng thắng khi chiếu hết Vua Đen.",
    "Tốt Trắng ở hàng 1 vẫn được phép đi hai ô — đây là luật bất đối xứng riêng của biến thể.",
  ],
  "racing-kings": [
    "Không có Tốt; toàn bộ quân xếp ở hai hàng đầu tiên.",
    "Tuyệt đối cấm chiếu: không nước đi nào được phép đặt Vua đối phương vào thế bị chiếu.",
    "Bên nào đưa Vua tới hàng 8 trước sẽ thắng.",
    "Nếu Trắng tới hàng 8 và Đen có thể tới hàng 8 ngay nước sau thì ván đấu là hoà.",
  ],
  giveaway: [
    "Bắt quân là bắt buộc: khi có nước bắt, bạn buộc phải bắt.",
    "Vua chỉ là một quân bình thường — không có chiếu, không có chiếu hết, được phép phong cấp thành Vua.",
    "Thắng khi bạn mất toàn bộ quân hoặc không còn nước đi hợp lệ nào.",
  ],
  "no-castling": [
    "Luật cờ tiêu chuẩn nhưng bỏ hoàn toàn quyền nhập thành cho cả hai bên.",
    "Vua phải tự đi bộ để tìm chỗ an toàn, khiến khai cuộc lệch hẳn khỏi lý thuyết quen thuộc.",
    "Thắng thua giống cờ tiêu chuẩn.",
  ],
  "no-queen": [
    "Luật cờ tiêu chuẩn nhưng hai quân Hậu bị bỏ khỏi thế trận ban đầu.",
    "Vẫn được phong cấp thành Hậu khi Tốt về hàng cuối.",
    "Thắng thua giống cờ tiêu chuẩn.",
  ],
  "random-army": [
    "Biến thể đang phát triển: luật cân bằng đội hình chưa được chốt nên chưa mở cho người chơi.",
  ],
};

function Flag({ on, label }: { on: boolean; label: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
      title={on ? t("play.variantHelp.available") : t("play.variantHelp.unavailable")}
    >
      {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {label}
    </span>
  );
}

function VariantHelpPage() {
  const t = useT();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("play.variantHelp.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("play.variantHelp.subtitle")}</p>
        </header>

        <div className="space-y-5">
          {VARIANTS.map((v) => (
            <section
              key={v.id}
              id={v.id}
              className="rounded-xl border border-border bg-card/60 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-semibold">{variantName(v.id)}</h2>
                {v.custom && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-xs text-accent">
                    <Sparkles className="h-3 w-3" />
                    {t("play.variantHelp.custom")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{variantBlurb(v.id)}</p>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.variantHelp.rules")}
              </h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {RULES_VI[v.id].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.variantHelp.surfaces")}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Flag on={v.localPlayable} label={t("play.variantHelp.surface.local")} />
                <Flag on={v.botSupport} label={t("play.variantHelp.surface.bot")} />
                <Flag on={v.onlineSupport} label={t("play.variantHelp.surface.online")} />
                <Flag
                  on={v.engineAnalysisSupport}
                  label={t("play.variantHelp.surface.analysis")}
                />
                <Flag on={v.ratedSupport} label={t("play.variantHelp.surface.rated")} />
              </div>
              {(v.disabledReason || v.analysisDisabledReason) && (
                <p className="mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                  {v.disabledReason ?? v.analysisDisabledReason}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
