import {
  CAPABILITIES,
  capability,
  PLATFORM,
  type Competitor,
  type Support,
} from "@shared/platform";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * CapabilityMatrix — what each product does, row by row, with Zolto answering
 * every question it asks of anyone else.
 *
 * The rows live in shared/platform.ts rather than on each competitor so the two
 * columns can't fall out of alignment, and so the matrix has to carry the rows
 * Zolto loses. There is exactly one of those — PostFinance Pay, which only
 * Worldline supports — and a test keeps it in. A matrix that only asks
 * questions we win is a scorecard we wrote for ourselves, and a reader can tell.
 */

/** Rendered per answer. `n/a` is not a softer "no": it means the question
 *  doesn't apply to that product, which is a different fact about it. */
function SupportMark({ supported }: { supported: Support }) {
  const { t } = useMarketingT();
  const map: Record<string, { glyph: string; label: string; cls: string }> = {
    true: {
      glyph: "✓",
      label: t("capabilities.yes"),
      cls: "text-[var(--brand-accent)]",
    },
    false: {
      glyph: "✕",
      label: t("capabilities.no"),
      cls: "text-[var(--brand-muted)]",
    },
    partial: {
      glyph: "~",
      label: t("capabilities.partial"),
      cls: "text-[var(--brand-muted-2)]",
    },
    "n/a": {
      glyph: "–",
      label: t("capabilities.notApplicable"),
      cls: "text-[var(--brand-muted)]",
    },
  };
  const m = map[String(supported)] ?? map["n/a"];
  return (
    <span className={`mr-2 font-medium ${m.cls}`} aria-label={m.label}>
      {m.glyph}
    </span>
  );
}

export function CapabilityMatrix({ competitor }: { competitor: Competitor }) {
  const { t, st } = useMarketingT();
  if (!competitor.capabilities) return null;

  const answers = new Map(competitor.capabilities.map((c) => [c.key, c]));

  return (
    <div className="overflow-x-auto" data-testid="capability-matrix">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          {t("capabilities.tableCaption", {
            name: PLATFORM.name,
            competitor: competitor.name,
          })}
        </caption>
        <thead>
          <tr className="border-b border-[var(--brand-border)]">
            <th scope="col" className="py-3 pr-4 font-medium">
              &nbsp;
            </th>
            <th
              scope="col"
              className="py-3 pr-4 font-medium text-[var(--brand-muted-2)]"
            >
              {competitor.name}
            </th>
            <th
              scope="col"
              className="py-3 font-medium text-[var(--brand-ink)]"
            >
              {PLATFORM.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((row) => {
            const theirs = answers.get(row.key);
            return (
              <tr
                key={row.key}
                data-testid={`capability-${row.key}`}
                className="border-b border-[var(--brand-border)]/60"
              >
                <th
                  scope="row"
                  className="py-4 pr-4 align-top font-medium text-[var(--brand-text)]"
                >
                  {st(`capabilities.${row.key}.label`, row.label)}
                </th>
                <td className="py-4 pr-4 align-top text-[var(--brand-muted-2)]">
                  {theirs && <SupportMark supported={theirs.supported} />}
                  {theirs &&
                    st(
                      `competitors.${competitor.id}.capabilities.${row.key}`,
                      theirs.value,
                    )}
                </td>
                <td className="py-4 align-top text-[var(--brand-ink)]">
                  <SupportMark supported={capability(row.key).zoltoSupported} />
                  {st(`capabilities.${row.key}.zolto`, row.zolto)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
