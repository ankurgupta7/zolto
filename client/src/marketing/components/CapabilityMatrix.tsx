import {
  CAPABILITY_GROUPS,
  capabilitiesInGroup,
  capability,
  PLATFORM,
  type Competitor,
  type CompetitorCapability,
  type Support,
} from "@shared/platform";
import { source } from "@shared/sources";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * CapabilityMatrix — what each product does, row by row, with Zolto answering
 * every question it asks of anyone else.
 *
 * The rows live in shared/platform.ts rather than on each competitor so the two
 * columns can't fall out of alignment, and so the matrix has to carry the rows
 * Zolto loses. A matrix that only asks questions we win is a scorecard we wrote
 * for ourselves, and a reader can tell.
 *
 * **Two design rules do the real work here.**
 *
 * First, the rows are grouped into the till, the shop, the AI and the money.
 * The matrix used to be ten payment-shaped rows, which conceded the frame:
 * it compared Zolto to payment companies on payment questions, where the best
 * available outcome is a tie. Zolto is a till, a shop, one inventory and an AI
 * running all three — so payments is one section of four.
 *
 * Second, a competitor's answer can carry a `cost`. Where they *do* have a
 * capability, the interesting fact is almost never "yes", it's what the yes
 * costs — a subscription owed in a quiet month, a document pack, a multi-year
 * terminal contract. Rendering that is more honest than a ✕ and lands harder,
 * because a reader can check it. Every cost cites a source; see the field's
 * doc comment.
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

/**
 * The "yes, but" line — what the tick costs, and where that came from.
 *
 * This is the field that makes the whole matrix worth publishing. Where a
 * competitor genuinely has a capability, the interesting fact is rarely "yes";
 * it's what the yes costs — a subscription owed in a quiet month, a document
 * pack, a multi-year terminal contract. That reads as more honest than a ✕ and
 * lands harder, because the reader can follow the link and check it.
 */
function CostOfTick({
  answer,
  competitorId,
}: {
  answer: CompetitorCapability;
  competitorId: string;
}) {
  const { t, st } = useMarketingT();
  if (!answer.cost || !answer.costSourceId) return null;
  const s = source(answer.costSourceId);
  return (
    <span
      data-testid={`cost-${answer.key}`}
      className="mt-1.5 block text-xs font-normal leading-relaxed text-[var(--brand-muted)]"
    >
      {st(`competitors.${competitorId}.costs.${answer.key}`, answer.cost)}{" "}
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer nofollow"
        className="underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent)]"
      >
        {s.label}
      </a>{" "}
      · {t("sources.read", { date: s.retrievedOn })}
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
        {CAPABILITY_GROUPS.map((group) => (
          <tbody key={group} data-testid={`capability-group-${group}`}>
            <tr>
              <th
                scope="colgroup"
                colSpan={3}
                className="pb-2 pt-8 font-hand text-xl font-normal leading-none text-[var(--brand-accent)]"
              >
                {st(`capabilityGroups.${group}`, group)}
              </th>
            </tr>
            {capabilitiesInGroup(group).map((row) => {
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
                    {theirs && (
                      <CostOfTick
                        answer={theirs}
                        competitorId={competitor.id}
                      />
                    )}
                  </td>
                  <td className="py-4 align-top text-[var(--brand-ink)]">
                    <SupportMark
                      supported={capability(row.key).zoltoSupported}
                    />
                    {st(`capabilities.${row.key}.zolto`, row.zolto)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
