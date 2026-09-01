import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useT, type Locale } from "@/lib/i18n";

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updatedLabel: string;
  intro: string;
  sections: LegalSection[];
  contact: string;
}

/**
 * Shared shell for the public legal pages. Renders the VI or EN document based
 * on the active locale and exposes an explicit switch so Google reviewers (and
 * users) can read either version from the same URL.
 */
export function LegalArticle({
  docs,
  children,
}: {
  docs: Record<Locale, LegalDoc>;
  children?: ReactNode;
}) {
  const { locale, setLocale } = useT();
  const doc = docs[locale];
  const date = new Date().toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" aria-label="Nine64" className="group inline-flex items-center">
          <BrandLogo className="h-8 transition-transform group-hover:scale-105 sm:h-9" />
        </Link>
        <div className="flex gap-1">
          <Button size="sm" variant={locale === "vi" ? "default" : "outline"} onClick={() => setLocale("vi")}>
            Tiếng Việt
          </Button>
          <Button size="sm" variant={locale === "en" ? "default" : "outline"} onClick={() => setLocale("en")}>
            English
          </Button>
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {doc.updatedLabel}: {date}
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>{doc.intro}</p>
        {doc.sections.map((s, i) => (
          <div key={s.heading}>
            <h2 className="mt-8 border-l-2 border-primary/70 pl-3 text-xl font-extrabold tracking-tight text-foreground first:mt-0">
              {i + 1}. {s.heading}
            </h2>
            {s.body.map((p, j) => (
              <p key={j} className="mt-2">
                {p}
              </p>
            ))}
          </div>
        ))}
        <p className="text-muted-foreground">{doc.contact}</p>
        {children}
      </section>
    </div>
  );
}
