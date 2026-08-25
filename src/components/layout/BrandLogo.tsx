import logoDark from "@/assets/nexus-logo-dark.svg";
import logoLight from "@/assets/nexus-logo-light.svg";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Nexus wordmark. Renders the light-interface variant by default and swaps to
 * the dark-interface variant whenever the `.dark` class is active.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src={logoLight}
        alt={`${APP.name} logo`}
        className={cn("w-auto select-none dark:hidden", className)}
        draggable={false}
      />
      <img
        src={logoDark}
        alt={`${APP.name} logo`}
        className={cn("hidden w-auto select-none dark:block", className)}
        draggable={false}
      />
    </>
  );
}
