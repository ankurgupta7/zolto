/**
 * The trust band at the foot of a storefront's home page — what other people
 * say about this shop, in one place.
 *
 * Two independent sources, one section: the quotes the merchant has published
 * (`testimonials.list`) and the store's Trustpilot standing
 * (`trustpilot.summary`). Either can be absent, and the section renders only
 * what exists — a store with neither renders nothing at all, so a shop that
 * never opens these admin pages looks exactly as it did before they existed.
 *
 * Deliberately no third-party widget. Trustpilot's own embed loads a script
 * from their domain, which would put a tracker on every storefront on the
 * platform and drag their fonts and layout into somebody else's brand. The
 * rating comes back through our own API and is drawn with the store's own
 * palette; only the link leaves for Trustpilot.
 */

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Star, StarHalf, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
// Ensure the shared i18n instance is initialized even when this block is
// pulled in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { formatTrustScore, starBuckets } from "@shared/trustpilot";

const VIEWPORT_OPTS = { once: true, margin: "-80px" } as const;
const EASE_VISCOUS = [0.22, 1, 0.36, 1] as const;

/**
 * A customer's initials, for the avatar when no photo was supplied. Two
 * letters at most — "Anna Marie Müller" is AM, not AMM, and "Anna M." is AM
 * either way.
 */
export function initialsOf(name: string): string {
  // Strips punctuation ("Anna M." → "Anna", "M") while keeping accented
  // letters, which a bare [^A-Za-z0-9] would throw away — "Örn" must not
  // initial as "rn". Written as a negated ASCII-punctuation class rather than a
  // Unicode property escape, which this tsconfig's target does not allow.
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[!-/:-@[-`{-~]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** The five positions a star row has. Slots, so each star keys on where it is. */
const STAR_SLOTS = ["s1", "s2", "s3", "s4", "s5"] as const;

/** A 0–5 score as a row of five stars, rounded the way Trustpilot rounds. */
function StarRow({
  score,
  label,
  size = 16,
}: {
  score: number;
  label: string;
  size?: number;
}) {
  // `empty` is implied: the slots past the full-and-half ones are the empty
  // ones, and slicing rather than counting keeps the row exactly five long.
  const { full, half } = starBuckets(score);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[var(--brand-accent)]"
      role="img"
      aria-label={label}
    >
      {/* Sliced from a fixed list of five, so each star keys on its own
          position rather than on an array index — the row only ever grows and
          shrinks from the right, and a position is a stable identity. */}
      {STAR_SLOTS.slice(0, full).map((slot) => (
        <Star key={slot} size={size} fill="currentColor" strokeWidth={0} />
      ))}
      {half === 1 && (
        <StarHalf size={size} fill="currentColor" strokeWidth={0} />
      )}
      {STAR_SLOTS.slice(full + half).map((slot) => (
        <Star key={slot} size={size} className="opacity-25" strokeWidth={1.5} />
      ))}
    </span>
  );
}

export default function CustomerTrust() {
  const { t } = useTranslation();
  const { data: testimonials } = trpc.testimonials.list.useQuery();
  const { data: trustpilot } = trpc.trustpilot.summary.useQuery();

  const quotes = testimonials ?? [];
  const connected = trustpilot?.connected === true;
  const rating = connected ? (trustpilot.summary ?? null) : null;

  // A store with nothing to show renders nothing — not an empty heading over
  // white space, which is how a "coming soon" section reads.
  if (quotes.length === 0 && !connected) return null;

  return (
    <section
      className="py-20 sm:py-28 bg-[var(--brand-surface)]"
      aria-labelledby="customer-trust-heading"
    >
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_OPTS}
          transition={{ duration: 0.85, ease: EASE_VISCOUS }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {t("trust.eyebrow")}
          </p>
          <h2
            id="customer-trust-heading"
            className="font-serif text-foreground"
          >
            {t("trust.heading")}
          </h2>
        </motion.div>

        {/* ── Trustpilot ─────────────────────────────────────────────────── */}
        {connected && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={VIEWPORT_OPTS}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
            className="mb-12 flex justify-center"
          >
            <a
              href={trustpilot.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-white border border-[var(--brand-border)] px-6 py-4 hover:border-[var(--brand-accent)] transition-colors"
            >
              {rating ? (
                <>
                  <StarRow
                    score={rating.stars}
                    label={t("trust.starsLabel", {
                      score: formatTrustScore(rating.trustScore),
                    })}
                    size={18}
                  />
                  {/* lining-nums: the serif face defaults to oldstyle figures,
                      which renders 4.6 with a dropped 4 and reads as a typo. */}
                  <span className="font-serif text-lg text-[var(--brand-ink)] lining-nums tabular-nums">
                    {formatTrustScore(rating.trustScore)}
                  </span>
                  <span className="text-sm text-muted-foreground font-sans lining-nums">
                    {t("trust.reviewCount", { count: rating.numberOfReviews })}
                  </span>
                </>
              ) : (
                <span className="text-sm text-[var(--brand-ink)] font-sans">
                  {t("trust.readReviews")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] font-sans text-[var(--brand-ink)] group-hover:text-[var(--brand-accent)] transition-colors">
                {t("trust.onTrustpilot")}
                <ExternalLink size={12} aria-hidden="true" />
              </span>
            </a>
          </motion.div>
        )}

        {/* ── Testimonials ───────────────────────────────────────────────── */}
        {quotes.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {quotes.map((quote, index) => (
              <motion.li
                key={quote.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_OPTS}
                transition={{
                  duration: 0.7,
                  ease: EASE_VISCOUS,
                  // Staggered, but capped: a nine-quote store should not have
                  // its last card arrive a second and a half after its first.
                  delay: Math.min(index * 0.08, 0.4),
                }}
                className="bg-white border border-[var(--brand-border)] p-6 flex flex-col"
              >
                {quote.rating != null && (
                  <StarRow
                    score={quote.rating}
                    label={t("trust.ratingLabel", { count: quote.rating })}
                  />
                )}
                <blockquote className="mt-3 flex-1 font-serif text-[var(--brand-ink)] text-lg leading-relaxed">
                  “{quote.quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  {quote.authorPhotoUrl ? (
                    <img
                      src={quote.authorPhotoUrl}
                      alt=""
                      loading="lazy"
                      className="w-10 h-10 rounded-full object-cover border border-[var(--brand-border)]"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-10 h-10 rounded-full grid place-items-center bg-[var(--brand-surface)] border border-[var(--brand-border)] text-xs font-sans tracking-wider text-[var(--brand-ink)]"
                    >
                      {initialsOf(quote.authorName)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-sans text-[var(--brand-ink)] truncate">
                      {quote.authorName}
                    </span>
                    {/* The source line and the customer's own subtitle sit on
                        the same row, so a Google review reads as one rather
                        than needing a badge of its own. */}
                    <span className="block text-xs font-sans text-muted-foreground truncate">
                      {[
                        quote.authorTitle,
                        quote.source !== "manual"
                          ? t(`trust.source.${quote.source}`)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </figcaption>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
