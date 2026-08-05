/**
 * Domain (store plane, Pro) — connect a custom domain to the storefront.
 * tenant.domainStatus does a live DNS check for whether the saved domain's
 * CNAME points at the platform; Caddy's on-demand TLS issues a cert once it
 * does. Plan-gated: the server rejects publicDomain on Free, so we upsell.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Globe, CheckCircle2, Clock } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  PlanGate,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
// Gate on the same object the server enforces (checkFeature("customDomain")),
// not a hand-copied list. This screen used to test
// `new Set(["maker","studio","atelier"])` — the retired four-tier ids — so
// after the Free/Pro pivot it matched NO plan, and every paying Pro merchant
// was shown an upsell for the custom domain they had already bought.
import { featuresForPlan } from "@shared/platform";

export default function Domain() {
  const { t } = useTranslation("admin");
  const { tenant, settings, invalidate } = useTenantSettings();
  const status = trpc.tenant.domainStatus.useQuery(undefined, { retry: false });
  const [domain, setDomain] = useState("");

  useEffect(() => {
    if (settings?.publicDomain) setDomain(settings.publicDomain);
  }, [settings]);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      status.refetch();
      toast.success(t("store.domain.savedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.domain.saveError")),
  });

  const plan = tenant?.plan ?? "free";
  if (tenant && !featuresForPlan(plan).customDomain) {
    return (
      <div>
        <PageHeader
          title={t("store.domain.title")}
          description={t("store.domain.description")}
        />
        <PlanGate requiredPlan="pro" feature={t("store.domain.gateFeature")} />
      </div>
    );
  }

  const onSave = () => {
    const value = domain.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(value)) {
      toast.error(t("store.domain.invalidDomain"));
      return;
    }
    save.mutate({ publicDomain: value });
  };

  const expected = status.data?.expected;
  const pointsToUs = status.data?.pointsToUs;
  const savedDomain = status.data?.domain;

  return (
    <div>
      <PageHeader
        title={t("store.domain.title")}
        description={t("store.domain.description")}
      />

      <SettingsCard
        title={t("store.domain.cardTitle")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.domain.saveDomain")}
          </PrimaryButton>
        }
      >
        <Field
          label={t("store.domain.yourDomain")}
          htmlFor="public-domain"
          hint={t("store.domain.domainHint")}
        >
          <input
            id="public-domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="shop.yourbrand.com"
            className={inputClass}
          />
        </Field>
      </SettingsCard>

      {savedDomain && (
        <SettingsCard title={t("store.domain.statusTitle")}>
          <div className="flex items-center gap-3">
            {pointsToUs ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("store.domain.connected", { domain: savedDomain })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("store.domain.connectedNote")}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("store.domain.waiting")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {expected
                      ? t("store.domain.waitingNote", {
                          domain: savedDomain,
                          expected,
                        })
                      : t("store.domain.waitingNoteNoExpected")}
                  </p>
                </div>
              </>
            )}
          </div>
          {expected && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-4 font-mono text-xs text-foreground">
              <div className="flex flex-wrap gap-x-8 gap-y-1">
                <span>
                  <span className="text-muted-foreground">
                    {t("store.domain.recordType")}
                  </span>{" "}
                  CNAME
                </span>
                <span>
                  <span className="text-muted-foreground">
                    {t("store.domain.recordName")}
                  </span>{" "}
                  {savedDomain}
                </span>
                <span>
                  <span className="text-muted-foreground">
                    {t("store.domain.recordValue")}
                  </span>{" "}
                  {expected}
                </span>
              </div>
            </div>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => status.refetch()}
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Globe className="h-4 w-4" />
              {t("store.domain.recheck")}
            </button>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
