/**
 * My account (account plane) — the signed-in person, not the shop.
 *
 * The admin had no page for this at all: "Shop profile" edits the *store's*
 * contact details, and Team lists other people, so a merchant had nowhere to
 * see or change anything about their own login.
 *
 * The honest split, which this page states rather than hides:
 * - Display name is yours to change (auth.updateProfile).
 * - Sign-in email is not. It is the identity Google, Apple, or the magic link
 *   authenticated, so changing it means proving the new address — a
 *   verification flow that does not exist yet. Saying so beats a disabled
 *   input with no explanation.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
} from "@/components/admin/ui";

/** How the account signed in, phrased for a merchant rather than an engineer. */
function signInMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "magic-link":
    case "magic_link":
      return "Email link";
    default:
      return "Email";
  }
}

export default function MyAccount() {
  const { user, logout, refresh } = useAuth();
  const [name, setName] = useState("");

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const save = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Name saved.");
    },
    onError: (e) => toast.error(e.message || "Could not save your name."),
  });

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not signed in.{" "}
        <a
          href="/signin?next=/admin/account/me"
          className="text-primary underline underline-offset-4"
        >
          Sign in
        </a>
      </p>
    );
  }

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Your name cannot be empty.");
      return;
    }
    save.mutate({ name: trimmed });
  };

  return (
    <div>
      <PageHeader
        title="My account"
        description="You, personally — separate from your shop's details."
      />

      <SettingsCard
        title="Your name"
        description="Shown to your team; never shown to customers."
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Display name" htmlFor="display-name">
            <input
              id="display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Anna Brunner"
              className={inputClass}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="How you sign in"
        description="Your login identity. Changing it needs support, because a new address has to be proved before it can open your shop."
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {user.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Method
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {signInMethodLabel(user.loginMethod)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Role
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {user.role === "superadmin" ? "Platform owner" : user.role}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Need a different email on this account? Contact support — orders,
          receipts, and your team's invitations are tied to it.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Session"
        description="Signing out ends this session on this device only."
      >
        <SecondaryButton onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </SecondaryButton>
      </SettingsCard>
    </div>
  );
}
