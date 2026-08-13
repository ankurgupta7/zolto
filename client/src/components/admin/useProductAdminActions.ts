import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import "@/lib/i18n";
import type { ProductCategory } from "@shared/types";

/**
 * A catalogue row as the admin list returns it. Shared by the table row and
 * the thumbnail card so the two views cannot drift apart on what a product is.
 */
export interface AdminProduct {
  id: number;
  name: string;
  nameEn: string | null;
  nameFr: string | null;
  nameIt: string | null;
  description: string;
  descriptionEn: string | null;
  descriptionFr: string | null;
  descriptionIt: string | null;
  price: string;
  category: string;
  imageUrl: string | null;
  visible: boolean;
  sold: boolean;
  quantity: number;
  source: string;
}

export interface EditForm {
  name: string;
  nameEn: string;
  nameFr: string;
  nameIt: string;
  description: string;
  descriptionEn: string;
  descriptionFr: string;
  descriptionIt: string;
  price: string;
  category: ProductCategory;
}

function formFor(product: AdminProduct): EditForm {
  return {
    name: product.name,
    nameEn: product.nameEn ?? "",
    nameFr: product.nameFr ?? "",
    nameIt: product.nameIt ?? "",
    description: product.description,
    descriptionEn: product.descriptionEn ?? "",
    descriptionFr: product.descriptionFr ?? "",
    descriptionIt: product.descriptionIt ?? "",
    price: String(Number(product.price).toFixed(2)),
    category: product.category as ProductCategory,
  };
}

/**
 * Everything a merchant can do to one product from the catalogue list:
 * stock steps, visibility, delete-with-confirm, and the inline editor.
 *
 * It lives in a hook because the list has two skins — a table row and a
 * thumbnail card — and quantity that commits in one but not the other would be
 * a bug nobody notices until stock is wrong.
 */
export function useProductAdminActions(
  product: AdminProduct,
  onRefetch: () => void,
) {
  const { t } = useTranslation("admin");
  const [qtyValue, setQtyValue] = useState(String(product.quantity));
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(() => formFor(product));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setQtyValue(String(product.quantity));
  }, [product.quantity]);

  const qtyMutation = trpc.products.setQuantity.useMutation({
    onSuccess: onRefetch,
    onError: () => toast.error(t("catalog.admin.toasts.quantityFailed")),
  });

  const toggleMutation = trpc.products.toggleVisibility.useMutation({
    onSuccess: onRefetch,
    onError: () => toast.error(t("catalog.admin.toasts.visibilityFailed")),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      onRefetch();
      toast.success(t("catalog.admin.toasts.productDeleted"));
    },
    onError: () => toast.error(t("catalog.admin.toasts.productDeleteFailed")),
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      onRefetch();
      setEditing(false);
      toast.success(t("catalog.admin.toasts.productUpdated"));
    },
    onError: () => toast.error(t("catalog.admin.toasts.productUpdateFailed")),
  });

  const commitQty = () => {
    const n = parseInt(qtyValue, 10);
    if (Number.isNaN(n) || n < 0) {
      setQtyValue(String(product.quantity));
      return;
    }
    if (n === product.quantity) return;
    qtyMutation.mutate({ id: product.id, quantity: n });
  };

  const stepQty = (delta: number) => {
    const n = Math.max(0, (parseInt(qtyValue, 10) || 0) + delta);
    setQtyValue(String(n));
    qtyMutation.mutate({ id: product.id, quantity: n });
  };

  const handleSaveEdit = () => {
    const price = parseFloat(editForm.price);
    if (!editForm.name.trim() || !editForm.description.trim()) {
      toast.error(t("catalog.admin.toasts.nameDescriptionRequired"));
      return;
    }
    if (Number.isNaN(price) || price <= 0) {
      toast.error(t("catalog.admin.toasts.enterValidPrice"));
      return;
    }
    updateMutation.mutate({
      id: product.id,
      name: editForm.name.trim(),
      nameEn: editForm.nameEn.trim() || null,
      nameFr: editForm.nameFr.trim() || null,
      nameIt: editForm.nameIt.trim() || null,
      description: editForm.description.trim(),
      descriptionEn: editForm.descriptionEn.trim() || null,
      descriptionFr: editForm.descriptionFr.trim() || null,
      descriptionIt: editForm.descriptionIt.trim() || null,
      price,
      category: editForm.category,
    });
  };

  const startEdit = () => {
    setEditForm(formFor(product));
    setEditing(true);
  };

  const toggleVisible = () =>
    toggleMutation.mutate({ id: product.id, visible: !product.visible });

  const confirmDelete = () => {
    setConfirmingDelete(false);
    deleteMutation.mutate({ id: product.id });
  };

  const isBusy =
    qtyMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    updateMutation.isPending;

  return {
    t,
    qtyValue,
    setQtyValue,
    commitQty,
    stepQty,
    editing,
    setEditing,
    startEdit,
    editForm,
    setEditForm,
    handleSaveEdit,
    confirmingDelete,
    setConfirmingDelete,
    confirmDelete,
    toggleVisible,
    toggleMutation,
    deleteMutation,
    updateMutation,
    isBusy,
  };
}
