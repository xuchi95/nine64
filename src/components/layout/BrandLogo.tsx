import logoDark from "@/assets/nexus-logo-dark.svg";
import logoLight from "@/assets/nexus-logo-light.svg";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Nexus wordmark. Both variants are stacked in the same grid cell and
 * cross-fade when the `.dark` class toggles, so the swap never flashes or
 * shifts layout.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 [grid-template-areas:'logo'] [&>img]:[grid-area:logo]",
        className,
      )}
    >
      <img
        src={logoLight}
        alt={`${APP.name} logo`}
        className="h-full w-auto select-none opacity-100 transition-opacity duration-300 ease-out will-change-[opacity] motion-reduce:transition-none dark:opacity-0"
        draggable={false}
      />
      <img
        src={logoDark}
        alt=""
        aria-hidden
        className="h-full w-auto select-none opacity-0 transition-opacity duration-300 ease-out will-change-[opacity] motion-reduce:transition-none dark:opacity-100"
        draggable={false}
      />
    </span>
  );
}
