import { useTenant } from "@/contexts/TenantContext";
import { genericImprint } from "@/lib/storefrontContent";

/**
 * Legal Notice (Impressum). Generic, tenant-branded — a merchant is responsible
 * for adding any jurisdiction-specific details (company form, registration
 * number, VAT status) their business requires.
 */
export default function Impressum() {
  const { branding } = useTenant();
  const imprint = genericImprint(branding);

  return (
    <div className="page-enter pt-20">
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {branding.storeName}
          </p>
          <h1 className="font-serif text-white">{imprint.title}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container max-w-2xl">
          <dl className="space-y-5">
            {imprint.lines.map((line, i) => (
              <div
                key={i}
                className="border-b border-[var(--brand-border)] pb-4 text-foreground font-sans text-sm"
              >
                {line}
              </div>
            ))}
          </dl>

          <p className="mt-10 rounded border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-4 text-xs text-muted-foreground font-sans">
            {branding.storeName} is responsible for adding any legal details its
            jurisdiction requires (company form, registration or VAT numbers, and
            a registered address).
          </p>
        </div>
      </section>
    </div>
  );
}
