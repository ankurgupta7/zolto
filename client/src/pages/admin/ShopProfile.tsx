/**
 * Shop profile (account plane) — the store's identity within Zolto: name, slug,
 * plan/trial status, and business contact details. Name and slug are the
 * tenant's stable identity (changing them is a support operation), so they're
 * shown read-only; contact email/phone are editable via tenant.updateSettings.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  AdminOnly,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";

export default function ShopProfile() {
  const { user } = useAuth();
  const { tenant, settings, invalidate } = useTenantSettings();
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setContactEmail(settings.contactEmail ?? "");
      setContactPhone(settings.contactPhone ?? "");
    }
  }, [settings]);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Shop profile saved.");
    },
    onError: (e) => toast.error(e.message || "Could not save."),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const storeUrl = tenant?.slug ? `${tenant.slug}.zolto.ch` : null;

  const onSave = () => {
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      toast.error("Enter a valid contact email.");
      return;
    }
    save.mutate({
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
  };

  return (
    <div>
      <PageHeader
        title="Shop profile"
        description="Your store's identity and business contact details."
      />

      <SettingsCard title="Identity">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Store name
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {tenant?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Store address
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
              {storeUrl ? (
                <>
                  <span>{storeUrl}</span>
                  <button
                    type="button"
                    aria-label="Copy store address"
                    onClick={() => {
                      navigator.clipboard?.writeText(`https://${storeUrl}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plan
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {tenant?.plan ?? "free"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {tenant?.subscriptionStatus ?? "trialing"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Need to rename your store or change its address? Contact support — the
          address is tied to links customers may have already saved.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Business contact"
        description="Shown to customers on your storefront and used for order-related email."
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="contact-email">
            <input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="hello@yourstore.example"
              className={inputClass}
            />
          </Field>
          <Field label="Contact phone" htmlFor="contact-phone">
            <input
              id="contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+41 79 000 00 00"
              className={inputClass}
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}
