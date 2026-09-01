import markDark from "@/assets/nine64-mark-dark.webp";
import markLight from "@/assets/nine64-mark-light.webp";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

const IMG_CLASS =
  "absolute inset-0 block size-full select-none rounded-[inherit] transition-opacity duration-300 ease-out motion-reduce:transition-none";

/**
 * Square Nine64 "64" mark for compact surfaces (auth cards, badges, tiles).
 * Light/dark variants cross-fade with the `.dark` class, like BrandLogo.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block size-12 shrink-0 overflow-hidden rounded-xl border border-border/70",
        className,
      )}
    >
      <img
        src={markLight}
        alt={`${APP.name} mark`}
        width={512}
        height={512}
        className={cn(IMG_CLASS, "opacity-100 dark:opacity-0")}
        draggable={false}
      />
      <img
        src={markDark}
        alt=""
        aria-hidden
        width={512}
        height={512}
        className={cn(IMG_CLASS, "opacity-0 dark:opacity-100")}
        draggable={false}
      />
    </span>
  );
}
