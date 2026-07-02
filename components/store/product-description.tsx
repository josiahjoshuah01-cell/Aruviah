import { parseProductDescription } from "@/lib/cj-description";

export function ProductDescription({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  const sections = parseProductDescription(content);
  if (sections.length === 0) return null;

  const wrapperClass = compact
    ? "space-y-6"
    : "mt-8 space-y-8 border-t border-border pt-8";

  const hasHeadings = sections.some((s) => s.heading);

  if (!hasHeadings) {
    const paragraphs = sections.flatMap((s) => s.paragraphs);
    return (
      <div className={compact ? "space-y-3" : "mt-8 border-t border-border pt-8"}>
        <h2 className="mb-3 font-display text-lg font-semibold">Description</h2>
        <div className="space-y-3 text-muted-foreground leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {sections.map((section, i) => (
        <section key={i}>
          {section.heading && (
            <h2 className="mb-3 font-display text-lg font-semibold">
              {section.heading}
            </h2>
          )}
          <div className="space-y-3 text-muted-foreground leading-relaxed">
            {section.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
