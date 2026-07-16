import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();

  const VALUES = [
    {
      icon: "◈",
      titleKey: "about.values.handcrafted.title",
      descKey: "about.values.handcrafted.description",
    },
    {
      icon: "◇",
      titleKey: "about.values.intentional.title",
      descKey: "about.values.intentional.description",
    },
    {
      icon: "○",
      titleKey: "about.values.timeless.title",
      descKey: "about.values.timeless.description",
    },
  ];

  const MATERIALS = [
    { nameKey: "about.materials.silver.name", descKey: "about.materials.silver.desc" },
    { nameKey: "about.materials.semiPrecious.name", descKey: "about.materials.semiPrecious.desc" },
    { nameKey: "about.materials.pearls.name", descKey: "about.materials.pearls.desc" },
  ];

  return (
    <div className="page-enter pt-20">
      {/* Header */}
      <section className="bg-[#2D2620] py-20">
        <div className="container text-center">
          <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {t("about.badge")}
          </p>
          <h1 className="font-serif text-white">{t("about.title")}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      {/* Story */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-4 font-sans">
                {t("about.beginningBadge")}
              </p>
              <h2 className="font-serif text-foreground text-3xl md:text-4xl mb-6">
                {t("about.beginningTitle")}
              </h2>
              <div className="divider-gold w-16 mx-auto" />
            </div>

            {/* Two-column layout: story left, provenance right */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">
              {/* Story paragraphs */}
              <div className="lg:col-span-3 space-y-6 text-muted-foreground font-sans font-light leading-relaxed text-base">
                <p dangerouslySetInnerHTML={{ __html: t("about.story1") }} />
                <p dangerouslySetInnerHTML={{ __html: t("about.story2") }} />
                <p dangerouslySetInnerHTML={{ __html: t("about.story3") }} />
              </div>

              {/* Provenance sidebar */}
              <div className="lg:col-span-2 space-y-0 border-l border-[#B8963E]/30 pl-8">
                {[
                  { label: t("about.provenance.brandLabel"), value: t("about.provenance.brandValue") },
                  { label: t("about.provenance.companyLabel"), value: t("about.provenance.companyValue") },
                  { label: t("about.provenance.rootsLabel"), value: t("about.provenance.rootsValue") },
                  { label: t("about.provenance.artisansLabel"), value: t("about.provenance.artisansValue") },
                ].map((item) => (
                  <div key={item.label} className="py-5 border-b border-[#E0D8CC] last:border-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#B8963E] font-sans mb-1">
                      {item.label}
                    </p>
                    <p className="font-serif text-foreground text-base">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-[#EDE7DF]">
        <div className="container">
          <div className="text-center mb-16">
            <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
              {t("about.valuesBadge")}
            </p>
            <h2 className="font-serif text-foreground">{t("about.valuesTitle")}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {VALUES.map((v) => (
              <div key={v.titleKey} className="text-center">
                <div className="text-4xl text-[#B8963E] font-serif mb-4">{v.icon}</div>
                <h3 className="font-serif text-foreground text-xl mb-3">{t(v.titleKey)}</h3>
                <div className="divider-gold w-8 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm font-sans leading-relaxed">
                  {t(v.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Materials */}
      <section className="py-24 bg-[#2D2620]">
        <div className="container">
          <div className="text-center mb-16">
            <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
              {t("about.materialsBadge")}
            </p>
            <h2 className="font-serif text-white">{t("about.materialsTitle")}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {MATERIALS.map((m) => (
              <div key={m.nameKey} className="border border-white/10 p-8 text-center">
                <h3 className="font-serif text-[#B8963E] text-xl mb-4">{t(m.nameKey)}</h3>
                <p className="text-white/50 text-sm font-sans leading-relaxed">{t(m.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Team */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-4 font-sans">
                {t("about.teamBadge")}
              </p>
              <h2 className="font-serif text-foreground text-3xl">{t("about.teamTitle")}</h2>
              <div className="divider-gold w-16 mx-auto mt-6" />
            </div>

            <div className="flex justify-center">
              <div className="flex items-center gap-8 p-8 border border-[#E0D8CC] bg-[#FAF8F4] max-w-sm w-full">
                {/* Monogram avatar */}
                <div className="w-16 h-16 flex-shrink-0 bg-[#2D2620] flex items-center justify-center">
                  <span className="font-serif text-[#B8963E] text-2xl">SA</span>
                </div>
                <div>
                  <p className="font-serif text-foreground text-xl">{t("about.teamCeoName")}</p>
                  <p className="text-[#B8963E] text-xs uppercase tracking-[0.15em] font-sans mt-1">
                    {t("about.teamCeoRole")}
                  </p>
                  <p className="text-muted-foreground text-xs font-sans mt-0.5">
                    {t("about.teamCeoCompany")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#EDE7DF] text-center">
        <div className="container">
          <h2 className="font-serif text-foreground mb-4">{t("about.ctaTitle")}</h2>
          <p className="text-muted-foreground mb-8 font-sans font-light">
            {t("about.ctaSubtitle")}
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-[#2D2620] text-white px-10 py-4 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[#3A3028] transition-colors duration-200"
          >
            {t("about.shopNow")}
          </Link>
        </div>
      </section>
    </div>
  );
}
