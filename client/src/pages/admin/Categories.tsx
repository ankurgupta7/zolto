/**
 * Categories (store plane) — the tenant's own product category list.
 *
 * Seeded from the store's vertical preset at signup (shared/verticals.ts) and
 * fully editable here: rename (EN/DE/FR/IT labels or the key itself — key renames
 * cascade to every product), add, delete (products move to a category the
 * admin picks), and reorder. The storefront filter chips, admin selects, POS
 * apps, and AI prompts all follow this list.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  LoadingState,
} from "@/components/admin/ui";

const FALLBACK_KEY = "Other";

export default function Categories() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();
  const list = trpc.categories.list.useQuery();
  const categories = list.data ?? [];

  const invalidate = () => {
    utils.categories.list.invalidate();
    // Product views group/filter by category, so refresh them after renames.
    utils.products.invalidate();
  };

  const create = trpc.categories.create.useMutation({
    onSuccess: () => {
      invalidate();
      setNewKey("");
      setNewLabelDe("");
      setNewLabelFr("");
      setNewLabelIt("");
      toast.success(t("store.categories.addedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.categories.addError")),
  });
  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success(t("store.categories.updatedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.categories.updateError")),
  });
  const remove = trpc.categories.remove.useMutation({
    onSuccess: (res) => {
      invalidate();
      setDeleting(null);
      toast.success(
        res.reassigned > 0
          ? t("store.categories.deletedMovedToast", { count: res.reassigned })
          : t("store.categories.deletedToast"),
      );
    },
    onError: (e) => toast.error(e.message || t("store.categories.deleteError")),
  });
  const reorder = trpc.categories.reorder.useMutation({
    onSuccess: invalidate,
    onError: (e) =>
      toast.error(e.message || t("store.categories.reorderError")),
  });
  const applyPreset = trpc.categories.applyPreset.useMutation({
    onSuccess: (res) => {
      invalidate();
      toast.success(
        t("store.categories.presetAppliedToast", { vertical: res.vertical }),
      );
    },
    onError: (e) => toast.error(e.message || t("store.categories.presetError")),
  });

  const [newKey, setNewKey] = useState("");
  const [newLabelDe, setNewLabelDe] = useState("");
  const [newLabelFr, setNewLabelFr] = useState("");
  const [newLabelIt, setNewLabelIt] = useState("");
  const [editing, setEditing] = useState<{
    key: string;
    newKey: string;
    labelEn: string;
    labelDe: string;
    labelFr: string;
    labelIt: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    key: string;
    reassignTo: string;
  } | null>(null);

  const move = (key: string, dir: -1 | 1) => {
    const keys = categories.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    reorder.mutate({ keys });
  };

  const startDelete = (key: string) => {
    const firstOther = categories.find((c) => c.key !== key)?.key ?? "";
    setDeleting({ key, reassignTo: firstOther });
  };

  return (
    <div>
      <PageHeader
        title={t("store.categories.title")}
        description={t("store.categories.description")}
        actions={
          <SecondaryButton
            onClick={() => applyPreset.mutate()}
            loading={applyPreset.isPending}
          >
            {t("store.categories.applyPreset")}
          </SecondaryButton>
        }
      />

      <SettingsCard
        title={t("store.categories.listTitle")}
        description={t("store.categories.listDescription", {
          fallback: FALLBACK_KEY,
        })}
      >
        {list.isLoading ? (
          <LoadingState />
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((cat, idx) => (
              <li key={cat.key} className="py-3">
                {editing?.key === cat.key ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field
                      label={t("store.categories.nameKey")}
                      htmlFor={`key-${cat.key}`}
                    >
                      <input
                        id={`key-${cat.key}`}
                        value={editing.newKey}
                        disabled={cat.key === FALLBACK_KEY}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, newKey: e.target.value } : s,
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label={t("store.categories.labelEn")}
                      htmlFor={`len-${cat.key}`}
                    >
                      <input
                        id={`len-${cat.key}`}
                        value={editing.labelEn}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, labelEn: e.target.value } : s,
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label={t("store.categories.labelDe")}
                      htmlFor={`lde-${cat.key}`}
                    >
                      <input
                        id={`lde-${cat.key}`}
                        value={editing.labelDe}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, labelDe: e.target.value } : s,
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label={t("store.categories.labelFr")}
                      htmlFor={`lfr-${cat.key}`}
                    >
                      <input
                        id={`lfr-${cat.key}`}
                        value={editing.labelFr}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, labelFr: e.target.value } : s,
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label={t("store.categories.labelIt")}
                      htmlFor={`lit-${cat.key}`}
                    >
                      <input
                        id={`lit-${cat.key}`}
                        value={editing.labelIt}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, labelIt: e.target.value } : s,
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <div className="flex items-center gap-2 sm:col-span-3">
                      <PrimaryButton
                        loading={update.isPending}
                        onClick={() =>
                          update.mutate({
                            key: editing.key,
                            ...(editing.newKey.trim() &&
                            editing.newKey.trim() !== editing.key
                              ? { newKey: editing.newKey.trim() }
                              : {}),
                            labelEn:
                              editing.labelEn.trim() ||
                              editing.newKey.trim() ||
                              editing.key,
                            labelDe: editing.labelDe.trim() || null,
                            labelFr: editing.labelFr.trim() || null,
                            labelIt: editing.labelIt.trim() || null,
                          })
                        }
                      >
                        {t("store.categories.save")}
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setEditing(null)}>
                        {t("store.categories.cancel")}
                      </SecondaryButton>
                    </div>
                  </div>
                ) : deleting?.key === cat.key ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">
                      {t("store.categories.deletePrompt", { key: cat.key })}
                    </span>
                    <select
                      aria-label={t("store.categories.moveProductsAria")}
                      value={deleting.reassignTo}
                      onChange={(e) =>
                        setDeleting((s) =>
                          s ? { ...s, reassignTo: e.target.value } : s,
                        )
                      }
                      className={`${inputClass} w-auto`}
                    >
                      {categories
                        .filter((c) => c.key !== cat.key)
                        .map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.key}
                          </option>
                        ))}
                    </select>
                    <PrimaryButton
                      loading={remove.isPending}
                      onClick={() =>
                        remove.mutate({
                          key: cat.key,
                          reassignTo: deleting.reassignTo,
                        })
                      }
                    >
                      {t("store.categories.delete")}
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setDeleting(null)}>
                      {t("store.categories.cancel")}
                    </SecondaryButton>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={t("store.categories.moveUpAria", {
                          key: cat.key,
                        })}
                        disabled={idx === 0 || reorder.isPending}
                        onClick={() => move(cat.key, -1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("store.categories.moveDownAria", {
                          key: cat.key,
                        })}
                        disabled={
                          idx === categories.length - 1 || reorder.isPending
                        }
                        onClick={() => move(cat.key, 1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {cat.key}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          cat.labelDe ? `DE: ${cat.labelDe}` : null,
                          cat.labelFr ? `FR: ${cat.labelFr}` : null,
                          cat.labelIt ? `IT: ${cat.labelIt}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || t("store.categories.noLabels")}
                        {cat.extraIncludes.length > 0 &&
                          ` · ${t("store.categories.alsoShows", {
                            list: cat.extraIncludes.join(", "),
                          })}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={t("store.categories.editAria", {
                        key: cat.key,
                      })}
                      onClick={() =>
                        setEditing({
                          key: cat.key,
                          newKey: cat.key,
                          labelEn: cat.labelEn,
                          labelDe: cat.labelDe ?? "",
                          labelFr: cat.labelFr ?? "",
                          labelIt: cat.labelIt ?? "",
                        })
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {cat.key !== FALLBACK_KEY && (
                      <button
                        type="button"
                        aria-label={t("store.categories.deleteAria", {
                          key: cat.key,
                        })}
                        onClick={() => startDelete(cat.key)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("store.categories.addTitle")}
        description={t("store.categories.addDescription")}
        footer={
          <PrimaryButton
            loading={create.isPending}
            onClick={() => {
              if (!newKey.trim()) {
                toast.error(t("store.categories.nameRequired"));
                return;
              }
              create.mutate({
                key: newKey.trim(),
                ...(newLabelDe.trim() ? { labelDe: newLabelDe.trim() } : {}),
                ...(newLabelFr.trim() ? { labelFr: newLabelFr.trim() } : {}),
                ...(newLabelIt.trim() ? { labelIt: newLabelIt.trim() } : {}),
              });
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("store.categories.addCategory")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t("store.categories.newNameLabel")}
            htmlFor="new-cat-key"
          >
            <input
              id="new-cat-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={t("store.categories.newNamePlaceholder")}
              maxLength={64}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.categories.newDeLabel")}
            htmlFor="new-cat-de"
          >
            <input
              id="new-cat-de"
              value={newLabelDe}
              onChange={(e) => setNewLabelDe(e.target.value)}
              placeholder="z.B. Übertöpfe"
              maxLength={64}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.categories.newFrLabel")}
            htmlFor="new-cat-fr"
          >
            <input
              id="new-cat-fr"
              value={newLabelFr}
              onChange={(e) => setNewLabelFr(e.target.value)}
              placeholder="p.ex. Cache-pots"
              maxLength={64}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.categories.newItLabel")}
            htmlFor="new-cat-it"
          >
            <input
              id="new-cat-it"
              value={newLabelIt}
              onChange={(e) => setNewLabelIt(e.target.value)}
              placeholder="ad es. Portavasi"
              maxLength={64}
              className={inputClass}
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}
