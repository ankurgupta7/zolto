import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/contexts/TenantContext";
import { whatsappHref, instagramHref } from "@/lib/branding";

export default function Contact() {
  const { t } = useTranslation();
  const { branding } = useTenant();
  const waHref = whatsappHref(branding);
  const igHref = instagramHref(branding);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t("contact.errorRequired"));
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    setSubmitted(true);
    toast.success(t("contact.successMessage"));
  };

  return (
    <div className="page-enter pt-20">
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {t("contact.badge")}
          </p>
          <h1 className="font-serif text-white">{t("contact.title")}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-24 bg-background">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-5xl mx-auto">
            {/* Left: Info */}
            <div>
              <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-4 font-sans">
                {branding.storeName}
              </p>
              <h2 className="font-serif text-foreground text-2xl mb-6">
                {t("contact.subtitle")}
              </h2>
              <div className="divider-gold w-12 mb-8" />
              <p className="text-muted-foreground font-sans font-light leading-relaxed mb-10">
                {t("contact.intro")}
              </p>

              <div className="space-y-6">
                {waHref && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-ink)] font-sans mb-1">
                      {t("contact.whatsapp")}
                    </p>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-sans text-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors"
                    >
                      +{branding.whatsappNumber}
                    </a>
                  </div>
                )}
                {branding.contactEmail && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-ink)] font-sans mb-1">
                      {t("contact.email")}
                    </p>
                    <a
                      href={`mailto:${branding.contactEmail}`}
                      className="text-sm font-sans text-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors"
                    >
                      {branding.contactEmail}
                    </a>
                  </div>
                )}
                {igHref && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-ink)] font-sans mb-2">
                      {t("contact.instagram")}
                    </p>
                    <a
                      href={igHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 p-3 border border-[var(--brand-border)] hover:border-transparent bg-white hover:bg-gradient-to-r hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888] transition-all duration-300"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white" aria-hidden="true">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-sans font-medium text-foreground group-hover:text-white transition-colors">
                          @{branding.instagramHandle}
                        </p>
                        <p className="text-xs text-muted-foreground group-hover:text-white/80 transition-colors font-sans">
                          {t("contact.followCaption")}
                        </p>
                      </div>
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-ink)] font-sans mb-1">
                    {t("contact.responseTime")}
                  </p>
                  <p className="text-muted-foreground text-sm font-sans">
                    {t("contact.responseValue")}
                  </p>
                </div>
              </div>

              <div className="mt-12 p-6 border border-[var(--brand-accent)]/20 bg-[var(--brand-surface)]">
                <div className="text-[var(--brand-accent)] text-xl font-serif mb-3">◇</div>
                <p className="font-serif text-foreground italic text-lg leading-relaxed">
                  {t("contact.quote")}
                </p>
              </div>
            </div>

            {/* Right: Form */}
            <div>
              {submitted ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="text-5xl text-[var(--brand-accent)] font-serif mb-6">✦</div>
                  <h3 className="font-serif text-foreground text-2xl mb-4">
                    {t("contact.thankYou")}
                  </h3>
                  <p className="text-muted-foreground font-sans font-light">
                    {t("contact.thankYouSub")}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSubmitted(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                    className="mt-8 text-sm text-[var(--brand-ink)] uppercase tracking-[0.15em] font-sans border-b border-[var(--brand-ink)]/30 hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors"
                  >
                    {t("contact.sendAnother")}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2">
                        {t("contact.name")} <span className="text-[var(--brand-accent)]">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        className="w-full bg-transparent border border-[var(--brand-ink)]/20 px-4 py-3 text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[var(--brand-accent)] transition-colors"
                        placeholder={t("contact.namePlaceholder")}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2">
                        {t("contact.email")} <span className="text-[var(--brand-accent)]">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        className="w-full bg-transparent border border-[var(--brand-ink)]/20 px-4 py-3 text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[var(--brand-accent)] transition-colors"
                        placeholder="ihre@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2">
                      {t("contact.subject")}
                    </label>
                    <select
                      name="subject"
                      id="subject"
                      value={form.subject}
                      onChange={handleChange}
                      className="w-full bg-background border border-[var(--brand-ink)]/20 px-4 py-3 text-sm font-sans text-foreground focus:outline-none focus:border-[var(--brand-accent)] transition-colors"
                    >
                      <option value="">{t("contact.selectSubject")}</option>
                      <option value="product">{t("contact.subjectProduct")}</option>
                      <option value="bespoke">{t("contact.subjectBespoke")}</option>
                      <option value="order">{t("contact.subjectOrder")}</option>
                      <option value="other">{t("contact.subjectOther")}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2">
                      {t("contact.message")} <span className="text-[var(--brand-accent)]">*</span>
                    </label>
                    <textarea
                      name="message"
                      id="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="w-full bg-transparent border border-[var(--brand-ink)]/20 px-4 py-3 text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[var(--brand-accent)] transition-colors resize-none"
                      placeholder={t("contact.messagePlaceholder")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[var(--brand-ink)] text-white py-4 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200 disabled:opacity-60"
                  >
                    {submitting ? t("contact.sending") : t("contact.send")}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
