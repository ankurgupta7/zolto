/**
 * Domain (store plane, Maker+) — connect a custom domain to the storefront.
 * tenant.domainStatus does a live DNS check for whether the saved domain's
 * CNAME points at the platform; Caddy's on-demand TLS issues a cert once it
 * does. Plan-gated: the server rejects publicDomain on Free, so we upsell.
 */
import { useEffect, useState } from "react";
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

const MAKER_OR_ABOVE = new Set(["maker", "studio", "atelier"]);

export default function Domain() {
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
      toast.success("Domain saved. DNS can take a little while to propagate.");
    },
    onError: (e) => toast.error(e.message || "Could not save."),
  });

  const plan = tenant?.plan ?? "free";
  if (tenant && !MAKER_OR_ABOVE.has(plan)) {
    return (
      <div>
        <PageHeader
          title="Domain"
          description="Use your own web address for your storefront."
        />
        <PlanGate requiredPlan="maker" feature="A custom domain" />
      </div>
    );
  }

  const onSave = () => {
    const value = domain.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(value)) {
      toast.error("Enter a bare domain like shop.example.com (no https://).");
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
        title="Domain"
        description="Use your own web address for your storefront."
      />

      <SettingsCard
        title="Custom domain"
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            Save domain
          </PrimaryButton>
        }
      >
        <Field
          label="Your domain"
          htmlFor="public-domain"
          hint="Enter a bare domain — for example shop.yourbrand.com."
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
        <SettingsCard title="Connection status">
          <div className="flex items-center gap-3">
            {pointsToUs ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {savedDomain} is connected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    DNS points at Zolto and a certificate will be issued
                    automatically.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Waiting for DNS
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {expected
                      ? `Point a CNAME record for ${savedDomain} at ${expected}, then this will turn green.`
                      : "Point your domain's CNAME at the platform and this will turn green."}
                  </p>
                </div>
              </>
            )}
          </div>
          {expected && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-4 font-mono text-xs text-foreground">
              <div className="flex flex-wrap gap-x-8 gap-y-1">
                <span>
                  <span className="text-muted-foreground">Type:</span> CNAME
                </span>
                <span>
                  <span className="text-muted-foreground">Name:</span>{" "}
                  {savedDomain}
                </span>
                <span>
                  <span className="text-muted-foreground">Value:</span>{" "}
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
              Re-check now
            </button>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
