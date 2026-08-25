/**
 * One-click build health check.
 *
 * Usage:
 *   bun run health          # auto-fix common type errors, then typecheck
 *   bun run health:dry      # report only, change nothing
 *
 * It applies safe codemods for the type errors this stack hits most often,
 * then runs the TypeScript compiler so any remaining error is reported once,
 * with the fixed files listed first.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const DRY = process.argv.includes("--dry");

type Rule = {
  id: string;
  why: string;
  /** Return the fixed source, or null when the rule does not apply. */
  fix: (source: string, file: string) => string | null;
};

const replaceAll = (
  id: string,
  why: string,
  pairs: Array<[RegExp, string]>,
): Rule => ({
  id,
  why,
  fix: (source) => {
    let next = source;
    for (const [pattern, replacement] of pairs) {
      next = next.replace(pattern, replacement);
    }
    return next === source ? null : next;
  },
});

const AUTO_FIX_RULES: Rule[] = [
  replaceAll(
    "timer-handles",
    "NodeJS.* globals are not in scope in app code — use ReturnType<typeof setTimeout>",
    [
      [/\bNodeJS\.Timeout\b/g, "ReturnType<typeof setTimeout>"],
      [/\bNodeJS\.Timer\b/g, "ReturnType<typeof setTimeout>"],
      [/\bNodeJS\.Immediate\b/g, "ReturnType<typeof setTimeout>"],
    ],
  ),
  replaceAll(
    "start-import",
    "createServerFn and friends live in @tanstack/react-start",
    [
      [/from ["']@tanstack\/start["']/g, 'from "@tanstack/react-start"'],
      [
        /from ["']@tanstack\/start\/server["']/g,
        'from "@tanstack/react-start/server"',
      ],
    ],
  ),
  replaceAll(
    "server-fn-validator",
    "createServerFn uses .inputValidator(), not .validator()",
    [[/(createServerFn\([^)]*\)\s*(?:\r?\n\s*)?)\.validator\(/g, "$1.inputValidator("]],
  ),
  {
    id: "react-namespace-types",
    why: "The React.* type namespace is not global — import the type instead",
    fix: (source) => {
      const NAMES = [
        "ReactNode",
        "ReactElement",
        "CSSProperties",
        "PropsWithChildren",
        "ComponentProps",
        "FormEvent",
        "ChangeEvent",
        "KeyboardEvent",
        "MouseEvent",
        "RefObject",
        "Dispatch",
        "SetStateAction",
      ];
      const used = NAMES.filter((name) =>
        new RegExp(`\\bReact\\.${name}\\b`).test(source),
      );
      if (used.length === 0) return null;

      let next = source;
      for (const name of used) {
        next = next.replace(new RegExp(`\\bReact\\.${name}\\b`, "g"), name);
      }

      // Merge the needed type imports into an existing `from "react"` import.
      const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']react["'];?/;
      const match = next.match(importRe);
      if (match) {
        const existing = match[2]
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        const merged = [...new Set([...existing, ...used.map((n) => `type ${n}`)])];
        next = next.replace(
          importRe,
          `import {${merged.length > 3 ? "\n  " : " "}${merged.join(
            merged.length > 3 ? ",\n  " : ", ",
          )}${merged.length > 3 ? ",\n" : " "}} from "react";`,
        );
      } else {
        next = `import type { ${used.join(", ")} } from "react";\n${next}`;
      }
      return next;
    },
  },
];

/** Patterns we never rewrite automatically, but always report. */
const WARN_RULES: Array<{ id: string; pattern: RegExp; why: string }> = [
  {
    id: "react-router-dom",
    pattern: /from ["']react-router-dom["']/,
    why: "This project uses TanStack Router — replace with @tanstack/react-router",
  },
  {
    id: "router-cast",
    pattern: /(useSearch|useParams|useLoaderData|useRouteContext)\([^)]*\)\s+as\s+/,
    why: "Route hook results are already inferred; the cast hides a real error",
  },
  {
    id: "toast-hook",
    pattern: /from ["']@\/hooks\/use-toast["']/,
    why: "Not present in this template — use sonner via @/components/ui/sonner",
  },
  {
    id: "module-scope-env",
    pattern: /^(?:const|let|var)\s+\w+\s*=\s*process\.env/m,
    why: "Read process.env inside the server function handler, not at module scope",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !full.endsWith("routeTree.gen.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);
const fixes: Array<{ file: string; rule: string; why: string }> = [];
const warnings: Array<{ file: string; rule: string; why: string }> = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let source = original;

  for (const rule of AUTO_FIX_RULES) {
    const next = rule.fix(source, file);
    if (next && next !== source) {
      source = next;
      fixes.push({ file: relative(ROOT, file), rule: rule.id, why: rule.why });
    }
  }

  for (const rule of WARN_RULES) {
    if (rule.pattern.test(source)) {
      warnings.push({ file: relative(ROOT, file), rule: rule.id, why: rule.why });
    }
  }

  if (source !== original && !DRY) writeFileSync(file, source);
}

const label = DRY ? "would fix" : "fixed";
console.log(`\nBuild health check — ${files.length} files scanned\n`);

if (fixes.length === 0) {
  console.log(`  no auto-fixable type issues found`);
} else {
  console.log(`  ${fixes.length} ${label}:`);
  for (const fix of fixes) console.log(`   - ${fix.file} [${fix.rule}] ${fix.why}`);
}

if (warnings.length > 0) {
  console.log(`\n  ${warnings.length} needing a human decision:`);
  for (const warn of warnings) {
    console.log(`   - ${warn.file} [${warn.rule}] ${warn.why}`);
  }
}

console.log("\nRunning typecheck (tsgo --noEmit)...\n");
const typecheck = spawnSync("tsgo", ["--noEmit"], {
  stdio: "inherit",
  shell: true,
});

if (typecheck.status === 0) {
  console.log("\nTypecheck clean — safe to run analyses / build.\n");
} else {
  console.log(
    "\nTypecheck still failing. Fix the errors above, then re-run `bun run health`.\n",
  );
}

process.exit(typecheck.status ?? 1);
