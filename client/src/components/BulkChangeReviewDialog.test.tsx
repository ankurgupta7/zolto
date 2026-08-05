import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BulkChangeReviewDialog, {
  type BulkChangeItem,
} from "./BulkChangeReviewDialog";

const items: BulkChangeItem[] = [
  { id: 1, label: "Silver Ring — CHF 120" },
  { id: 2, label: "Gold Necklace — CHF 480" },
];

const baseProps = {
  open: true,
  title: "Mark as sold",
  description: "The AI matched these pieces to today's market sales.",
  items,
  isApplying: false,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("BulkChangeReviewDialog", () => {
  it("renders title, description and all items preselected", () => {
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Mark as sold")).toBeTruthy();
    expect(screen.getByText(/matched these pieces/)).toBeTruthy();
    expect(screen.getByText("Silver Ring — CHF 120")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(screen.getByText(/2 of 2 selected/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /confirm 2 changes/i }),
    ).toBeTruthy();
  });

  it("confirms only the ids left selected after deselecting one", () => {
    const onConfirm = vi.fn();
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Silver Ring — CHF 120"));
    expect(screen.getByText(/1 of 2 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirm 1 change$/i }));
    expect(onConfirm).toHaveBeenCalledWith([2]);
  });

  it("disables confirm when everything is deselected", () => {
    const onConfirm = vi.fn();
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    const confirm = screen.getByRole("button", {
      name: /confirm 0 changes/i,
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels via the Cancel button", () => {
    const onCancel = vi.fn();
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("cancels when the dialog is dismissed (Escape)", () => {
    const onCancel = vi.fn();
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the permanence warning and custom label in destructive mode", () => {
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        destructive
        confirmLabel="Deletion"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/permanent and cannot be undone/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /confirm 2 deletions/i }),
    ).toBeTruthy();
  });

  it("disables both actions while applying", () => {
    render(
      <BulkChangeReviewDialog
        {...baseProps}
        isApplying
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const cancel = screen.getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement;
    const confirm = screen.getByRole("button", {
      name: /confirm 2 changes/i,
    }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
  });

  it("reselects everything when reopened with new items", () => {
    const { rerender } = render(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText(/1 of 2 selected/)).toBeTruthy();
    rerender(
      <BulkChangeReviewDialog
        {...baseProps}
        open={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    rerender(
      <BulkChangeReviewDialog
        {...baseProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 of 2 selected/)).toBeTruthy();
  });
});
