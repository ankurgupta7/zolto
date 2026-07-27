/**
 * Legal & invoices (account plane) — links to the legal documents governing the
 * Zolto relationship and a pointer to invoices (managed in Plan & billing via
 * Stripe). Static; the invoice archive itself lives on the Stripe customer.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { FileText, Receipt, Scale, Sparkles } from "lucide-react";
import { PageHeader, SettingsCard, AdminOnly } from "@/components/admin/ui";

export default function Legal() {
  const { user } = useAuth();
  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title="Legal & invoices"
        description="The documents that govern your use of Zolto, and where to find your invoices."
      />

      <SettingsCard title="Invoices">
        <div className="flex items-start gap-3">
          <Receipt className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-foreground">
              Your subscription invoices are issued and archived by Stripe.
            </p>
            <Link
              href="/admin/account/plan"
              className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
            >
              Manage billing & view invoices →
            </Link>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Documents">
        <ul className="divide-y">
          {[
            {
              icon: FileText,
              label: "Terms of Service",
              href: "/legal/terms",
            },
            {
              icon: Scale,
              label: "Privacy Policy",
              href: "/legal/privacy",
            },
          ].map(({ icon: Icon, label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 text-sm text-foreground transition-colors hover:text-primary"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title="AI-image disclosure">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Product photos styled with Zolto's AI are enhancements of your own
            images. You're responsible for ensuring listings accurately
            represent the item a customer receives.
          </p>
        </div>
      </SettingsCard>
    </div>
  );
}
