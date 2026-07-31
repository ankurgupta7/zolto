import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { toast } from "sonner";
import CsvImport from "./CsvImport";

const mocks = vi.hoisted(() => ({
  csvImportMutate: vi.fn(),
  parseHandwrittenMutate: vi.fn(),
  adminListInvalidate: vi.fn(),
  listInvalidate: vi.fn(),
  fetchSheetMutateAsync: vi.fn(),
  authState: {
    user: { role: "admin" } as { role: string } | null,
    isAuthenticated: true,
    loading: false,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        products: {
          csvImport: { mutate: mocks.csvImportMutate },
          parseHandwrittenInventory: { mutate: mocks.parseHandwrittenMutate },
        },
      },
      products: {
        adminList: { invalidate: mocks.adminListInvalidate },
        list: { invalidate: mocks.listInvalidate },
      },
    }),
    products: {
      fetchSheetCsv: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mocks.fetchSheetMutateAsync,
          isPending: false,
        }),
      },
      adminList: {
        useQuery: () => ({ data: [] }),
      },
    },
    // Used by the signed-out state's SignInOptions.
    auth: {
      requestMagicLink: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeCsvFile(text: string) {
  return new File([text], "inventory.csv", { type: "text/csv" });
}

beforeEach(() => {
  mocks.csvImportMutate.mockReset();
  mocks.parseHandwrittenMutate.mockReset();
  mocks.adminListInvalidate.mockReset();
  mocks.listInvalidate.mockReset();
  mocks.fetchSheetMutateAsync.mockReset();
  mocks.authState.user = { role: "admin" };
  mocks.authState.isAuthenticated = true;
  mocks.authState.loading = false;
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("CsvImport preview: selection + chunked import", () => {
  it("imports only the selected rows, split into IMPORT_CHUNK_SIZE-sized batches", async () => {
    mocks.csvImportMutate.mockImplementation(
      async ({ rows }: { rows: unknown[] }) => ({
        created: rows.length,
        updated: 0,
        failed: [],
      }),
    );

    const { container } = render(<CsvImport />);

    const csvRows = Array.from(
      { length: 7 },
      (_, i) => `"Item ${i}","Desc ${i}",${10 + i},Rings,1`,
    ).join("\n");
    const csvText = `name,description,price,category,quantity\n${csvRows}`;

    const input = screen.getByTestId("csv-file-input");
    fireEvent.change(input, { target: { files: [makeCsvFile(csvText)] } });

    await waitFor(() =>
      expect(container.textContent).toContain("7 valid rows"),
    );
    expect(container.textContent).toContain("7 selected for import");

    // Deselect the first row via its row checkbox (index 0 is the header
    // "select all" checkbox).
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    await waitFor(() =>
      expect(container.textContent).toContain("6 selected for import"),
    );

    const importButton = screen.getByRole("button", {
      name: /Import 6 Products/i,
    });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mocks.csvImportMutate).toHaveBeenCalledTimes(2);
    });

    const [firstCall, secondCall] = mocks.csvImportMutate.mock.calls;
    expect(firstCall[0].rows).toHaveLength(5);
    expect(secondCall[0].rows).toHaveLength(1);

    await waitFor(() =>
      expect(container.textContent).toContain("6 products created"),
    );
    expect(mocks.adminListInvalidate).toHaveBeenCalled();
    expect(mocks.listInvalidate).toHaveBeenCalled();
  });

  it("lets you edit an invalid row so it becomes valid and importable", async () => {
    mocks.csvImportMutate.mockResolvedValue({
      created: 1,
      updated: 0,
      failed: [],
    });

    const { container } = render(<CsvImport />);

    const csvText = 'name,description,price,category\n"Broken","desc",0,Rings';
    const input = screen.getByTestId("csv-file-input");
    fireEvent.change(input, { target: { files: [makeCsvFile(csvText)] } });

    await waitFor(() =>
      expect(container.textContent).toContain("rows with errors"),
    );
    expect(container.textContent).toContain("0 valid rows");

    const priceInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "50" } });

    await waitFor(() =>
      expect(container.textContent).toContain("1 valid rows"),
    );
    expect(container.textContent).not.toContain("rows with errors");

    const importButton = screen.getByRole("button", {
      name: /Import 1 Product/i,
    });
    expect((importButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mocks.csvImportMutate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.csvImportMutate.mock.calls[0][0].rows[0]).toMatchObject({
      name: "Broken",
      price: 50,
    });
  });

  it("does not send deselected or invalid rows when a mix is present", async () => {
    mocks.csvImportMutate.mockResolvedValue({
      created: 1,
      updated: 0,
      failed: [],
    });
    const { container } = render(<CsvImport />);

    const csvText =
      "name,description,price,category\n" +
      '"Good One","desc",10,Rings\n' +
      '"Bad One","desc",0,Rings';
    const input = screen.getByTestId("csv-file-input");
    fireEvent.change(input, { target: { files: [makeCsvFile(csvText)] } });

    await waitFor(() =>
      expect(container.textContent).toContain("1 valid rows"),
    );

    const importButton = screen.getByRole("button", {
      name: /Import 1 Product/i,
    });
    expect((importButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(importButton);
    await waitFor(() => expect(mocks.csvImportMutate).toHaveBeenCalledTimes(1));
    expect(mocks.csvImportMutate.mock.calls[0][0].rows).toHaveLength(1);
    expect(mocks.csvImportMutate.mock.calls[0][0].rows[0].name).toBe(
      "Good One",
    );
  });
});

describe("CsvImport: multiple handwritten inventory photos", () => {
  it("merges items extracted from every uploaded photo into one preview", async () => {
    mocks.parseHandwrittenMutate
      .mockResolvedValueOnce({
        items: [
          {
            name: "Lemon Quartz",
            description: "Lemon Quartz Ring",
            price: 50,
            category: "Rings",
            quantity: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            name: "Peridot",
            description: "Peridot Ring",
            price: 45,
            category: "Rings",
            quantity: 1,
          },
        ],
      });

    const { container } = render(<CsvImport />);

    const input = screen.getByTestId("handwriting-file-input");
    const file1 = new File(["fake-bytes-1"], "page1.jpg", {
      type: "image/jpeg",
    });
    const file2 = new File(["fake-bytes-2"], "page2.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() =>
      expect(mocks.parseHandwrittenMutate).toHaveBeenCalledTimes(2),
    );

    await waitFor(() =>
      expect(container.textContent).toContain("2 valid rows"),
    );
    expect(container.textContent).toContain("2 selected for import");
  });

  it("still shows successfully-parsed items when one photo fails", async () => {
    mocks.parseHandwrittenMutate
      .mockResolvedValueOnce({
        items: [
          {
            name: "Lemon Quartz",
            description: "Lemon Quartz Ring",
            price: 50,
            category: "Rings",
            quantity: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("AI parsing failed"));

    const { container } = render(<CsvImport />);

    const input = screen.getByTestId("handwriting-file-input");
    const file1 = new File(["fake-bytes-1"], "page1.jpg", {
      type: "image/jpeg",
    });
    const file2 = new File(["fake-bytes-2"], "page2.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() =>
      expect(mocks.parseHandwrittenMutate).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(container.textContent).toContain("1 valid rows"),
    );
  });
});

describe("CsvImport: auth guards", () => {
  it("shows a loading spinner while auth is resolving", () => {
    mocks.authState.loading = true;
    const { container } = render(<CsvImport />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("prompts sign-in when unauthenticated, offering every method", () => {
    mocks.authState.isAuthenticated = false;
    mocks.authState.user = null;
    render(<CsvImport />);
    screen.getByText("Admin Required");
    // Not a single-provider link: a merchant without a Google account has to
    // be able to get back in from here too.
    screen.getByRole("link", { name: /continue with google/i });
    screen.getByRole("link", { name: /continue with apple/i });
    screen.getByRole("button", { name: /continue with email/i });
  });

  it("denies access to a signed-in non-admin", () => {
    mocks.authState.user = { role: "user" };
    render(<CsvImport />);
    screen.getByText("Access Denied");
  });
});

describe("CsvImport: input-stage validation and template download", () => {
  it("rejects a non-CSV file", () => {
    render(<CsvImport />);
    const input = screen.getByTestId("csv-file-input");
    const file = new File(["not a csv"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.csvImportMutate).not.toHaveBeenCalled();
  });

  it("shows an error when the CSV has no data rows", async () => {
    const { container } = render(<CsvImport />);
    const input = screen.getByTestId("csv-file-input");
    fireEvent.change(input, {
      target: { files: [makeCsvFile("name,description,price,category")] },
    });
    // Stays on the input stage — no preview table summary appears.
    await waitFor(() =>
      expect(container.textContent).not.toContain("valid rows"),
    );
  });

  it("rejects an oversized photo upload", () => {
    render(<CsvImport />);
    const input = screen.getByTestId("handwriting-file-input");
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(mocks.parseHandwrittenMutate).not.toHaveBeenCalled();
  });

  it("rejects a photo with an unsupported mime type", () => {
    render(<CsvImport />);
    const input = screen.getByTestId("handwriting-file-input");
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.parseHandwrittenMutate).not.toHaveBeenCalled();
  });

  it("downloads the CSV template on click", () => {
    // jsdom doesn't implement these, so stub them before spying.
    if (!URL.createObjectURL) (URL as any).createObjectURL = () => "";
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<CsvImport />);
    fireEvent.click(screen.getByRole("button", { name: /Download Template/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it("loads rows fetched from a Google Sheet URL", async () => {
    mocks.fetchSheetMutateAsync.mockResolvedValue({
      csv: 'name,description,price,category\n"Sheet Item","desc",20,Rings',
    });

    const { container } = render(<CsvImport />);
    const urlInput = screen.getByPlaceholderText(
      "https://docs.google.com/spreadsheets/d/...",
    );
    fireEvent.change(urlInput, {
      target: { value: "https://docs.google.com/spreadsheets/d/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Load Sheet/i }));

    await waitFor(() =>
      expect(container.textContent).toContain("1 valid rows"),
    );
    expect(mocks.fetchSheetMutateAsync).toHaveBeenCalledWith({
      url: "https://docs.google.com/spreadsheets/d/abc",
    });
  });
});

describe("CsvImport: full field editing and post-import navigation", () => {
  async function loadSingleRowPreview(container: HTMLElement) {
    const input = screen.getByTestId("csv-file-input");
    fireEvent.change(input, {
      target: {
        files: [
          makeCsvFile(
            'name,description,price,category,quantity\n"Ring","desc",10,Rings,1',
          ),
        ],
      },
    });
    await waitFor(() =>
      expect(container.textContent).toContain("1 valid rows"),
    );
  }

  it("edits category, quantity, image URL, and the English translation fields", async () => {
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    fireEvent.change(screen.getByDisplayValue("Rings"), {
      target: { value: "Bracelets" },
    });
    fireEvent.change(screen.getByPlaceholderText("Name (English)"), {
      target: { value: "Ring EN" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description (English)"), {
      target: { value: "Desc EN" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://…"), {
      target: { value: "https://example.com/ring.jpg" },
    });

    const qtyInput = container.querySelector(
      'input[type="number"][step="1"]',
    ) as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: "4" } });
    expect(qtyInput.value).toBe("4");

    mocks.csvImportMutate.mockResolvedValue({
      created: 1,
      updated: 0,
      failed: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /Import 1 Product/i }));

    await waitFor(() => expect(mocks.csvImportMutate).toHaveBeenCalledTimes(1));
    expect(mocks.csvImportMutate.mock.calls[0][0].rows[0]).toMatchObject({
      category: "Bracelets",
      nameEn: "Ring EN",
      descriptionEn: "Desc EN",
      imageUrl: "https://example.com/ring.jpg",
      quantity: 4,
    });
  });

  it("shows failed items after a partial import and lets you start a new import", async () => {
    mocks.csvImportMutate.mockResolvedValue({
      created: 0,
      updated: 0,
      failed: ["Ring"],
    });
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    fireEvent.click(screen.getByRole("button", { name: /Import 1 Product/i }));

    await waitFor(() =>
      expect(container.textContent).toContain("0 products created"),
    );
    expect(container.textContent).toContain("1 failed");
    expect(container.textContent).toContain("Ring");

    fireEvent.click(screen.getByRole("button", { name: /Import More/i }));
    expect(container.textContent).toContain("Upload CSV File");
  });

  it("returns to the input stage from the preview via the Back button", async () => {
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(container.textContent).toContain("Upload CSV File");
    expect(container.textContent).not.toContain("valid rows");
  });

  it("edits the name and description fields directly", async () => {
    mocks.csvImportMutate.mockResolvedValue({
      created: 1,
      updated: 0,
      failed: [],
    });
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    fireEvent.change(screen.getByPlaceholderText("Name"), {
      target: { value: "Renamed Ring" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "A renamed description" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Import 1 Product/i }));
    await waitFor(() => expect(mocks.csvImportMutate).toHaveBeenCalledTimes(1));
    expect(mocks.csvImportMutate.mock.calls[0][0].rows[0]).toMatchObject({
      name: "Renamed Ring",
      description: "A renamed description",
    });
  });

  it("clamps a negative quantity edit to zero", async () => {
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    const qtyInput = container.querySelector(
      'input[type="number"][step="1"]',
    ) as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: "-5" } });
    expect(qtyInput.value).toBe("0");
  });

  it("toggles every row via the header select-all checkbox", async () => {
    const { container } = render(<CsvImport />);
    const csvText =
      "name,description,price,category\n" +
      '"A","desc",10,Rings\n' +
      '"B","desc",20,Rings';
    fireEvent.change(screen.getByTestId("csv-file-input"), {
      target: { files: [makeCsvFile(csvText)] },
    });
    await waitFor(() =>
      expect(container.textContent).toContain("2 selected for import"),
    );

    const headerCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(headerCheckbox); // deselect all
    await waitFor(() =>
      expect(container.textContent).toContain("0 selected for import"),
    );

    fireEvent.click(headerCheckbox); // reselect all
    await waitFor(() =>
      expect(container.textContent).toContain("2 selected for import"),
    );
  });

  it("marks an entire batch as failed when the import request itself rejects", async () => {
    mocks.csvImportMutate.mockRejectedValue(new Error("network down"));
    const { container } = render(<CsvImport />);
    await loadSingleRowPreview(container);

    fireEvent.click(screen.getByRole("button", { name: /Import 1 Product/i }));

    await waitFor(() =>
      expect(container.textContent).toContain("0 products created"),
    );
    expect(container.textContent).toContain("1 failed");
    expect(container.textContent).toContain("Ring");
  });
});

describe("CsvImport: multi-photo edge cases", () => {
  it("shows progress while photos are being read", async () => {
    let resolveFirst!: (v: { items: unknown[] }) => void;
    mocks.parseHandwrittenMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mocks.parseHandwrittenMutate.mockResolvedValueOnce({ items: [] });

    const { container } = render(<CsvImport />);
    const file1 = new File(["a"], "page1.jpg", { type: "image/jpeg" });
    const file2 = new File(["b"], "page2.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("handwriting-file-input"), {
      target: { files: [file1, file2] },
    });

    await waitFor(() =>
      expect(container.textContent).toContain("Reading your inventory"),
    );
    expect(container.textContent).toContain("Photo 1 of 2");

    resolveFirst({ items: [] });
    await waitFor(() =>
      expect(mocks.parseHandwrittenMutate).toHaveBeenCalledTimes(2),
    );
  });

  it("stays on the input stage and shows an error when no photo yields any items", async () => {
    mocks.parseHandwrittenMutate.mockResolvedValue({ items: [] });

    const { container } = render(<CsvImport />);
    fireEvent.change(screen.getByTestId("handwriting-file-input"), {
      target: {
        files: [new File(["a"], "page1.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() =>
      expect(mocks.parseHandwrittenMutate).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(container.textContent).toContain("Upload photos of your notes"),
    );
    expect(container.textContent).not.toContain("valid rows");
  });

  it("shows an error when a photo can't be read", async () => {
    const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      setTimeout(() => this.onerror?.(new ProgressEvent("error") as any));
    };

    render(<CsvImport />);
    fireEvent.change(screen.getByTestId("handwriting-file-input"), {
      target: {
        files: [new File(["a"], "page1.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(mocks.parseHandwrittenMutate).not.toHaveBeenCalled();
    });

    FileReader.prototype.readAsDataURL = originalReadAsDataURL;
  });
});
