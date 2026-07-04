export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-current [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_a]:text-stream [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-stream/80">
      {children}
    </article>
  );
}
