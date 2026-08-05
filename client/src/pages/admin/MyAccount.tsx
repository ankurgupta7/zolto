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
import { useTranslation } from "react-i18next";
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

/**
 * How the account signed in, phrased for a merchant rather than an engineer.
 * Google and Apple are product names and stay as they are in every language;
 * the other two are translated.
 */
function signInMethodLabel(
  method: string | null | undefined,
  t: (key: string) => string,
): string {
  switch (method) {
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "magic-link":
    case "magic_link":
      return t("ops.myAccount.methodEmailLink");
    default:
      return t("ops.myAccount.methodEmail");
  }
}

export default function MyAccount() {
  const { t } = useTranslation("admin");
  const { user, logout, refresh } = useAuth();
  const [name, setName] = useState("");

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const save = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t("ops.myAccount.nameSaved"));
    },
    onError: (e) => toast.error(e.message || t("ops.myAccount.nameSaveFailed")),
  });

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("ops.myAccount.notSignedIn")}{" "}
        <a
          href="/signin?next=/admin/account/me"
          className="text-primary underline underline-offset-4"
        >
          {t("ops.myAccount.signIn")}
        </a>
      </p>
    );
  }

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("ops.myAccount.nameEmpty"));
      return;
    }
    save.mutate({ name: trimmed });
  };

  return (
    <div>
      <PageHeader
        title={t("ops.myAccount.title")}
        description={t("ops.myAccount.description")}
      />

      <SettingsCard
        title={t("ops.myAccount.nameTitle")}
        description={t("ops.myAccount.nameDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("ops.myAccount.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("ops.myAccount.displayName")} htmlFor="display-name">
            <input
              id="display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ops.myAccount.namePlaceholder")}
              className={inputClass}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("ops.myAccount.signInTitle")}
        description={t("ops.myAccount.signInDescription")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.myAccount.email")}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {user.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.myAccount.method")}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {signInMethodLabel(user.loginMethod, t)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.myAccount.role")}
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {user.role === "superadmin"
                ? t("ops.myAccount.platformOwner")
                : user.role}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("ops.myAccount.supportNote")}
        </p>
      </SettingsCard>

      <SettingsCard
        title={t("ops.myAccount.sessionTitle")}
        description={t("ops.myAccount.sessionDescription")}
      >
        <SecondaryButton onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          {t("ops.myAccount.signOut")}
        </SecondaryButton>
      </SettingsCard>
    </div>
  );
}
