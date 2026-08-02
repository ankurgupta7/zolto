import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import SupportChat from "./SupportChat";

type AskOpts = {
  onSuccess?: (data: { reply: string }) => void;
  onError?: (err: { message: string }) => void;
};

const mocks = vi.hoisted(() => ({
  location: "/",
  askMutate: vi.fn(),
  askOpts: null as AskOpts | null,
  askPending: false,
}));

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, vi.fn()],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: {
      ask: {
        useMutation: (opts: AskOpts) => {
          mocks.askOpts = opts;
          return { mutate: mocks.askMutate, isPending: mocks.askPending };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.location = "/";
  mocks.askPending = false;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

function openChat() {
  fireEvent.click(screen.getByLabelText("Open chat"));
}

function sendMessage(text: string) {
  fireEvent.change(screen.getByPlaceholderText("Type your question…"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByLabelText("Send"));
}

describe("SupportChat", () => {
  it.each(["/admin", "/checkout", "/claim-staff", "/login"])(
    "renders nothing on %s",
    (path) => {
      mocks.location = path;
      const { container } = render(<SupportChat />);
      expect(container.firstChild).toBeNull();
    },
  );

  it("opens from the launcher and closes again", () => {
    render(<SupportChat />);
    openChat();
    expect(screen.getByText("Ask us anything")).toBeTruthy();
    expect(screen.getByText(/materials, sizing, availability/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close chat"));
    expect(screen.queryByText("Ask us anything")).toBeNull();
    expect(screen.getByLabelText("Open chat")).toBeTruthy();
  });

  it("sends a question with history, echoes it and clears the input", () => {
    render(<SupportChat />);
    openChat();
    sendMessage("Do you ship to Germany?");
    expect(mocks.askMutate).toHaveBeenCalledWith({
      message: "Do you ship to Germany?",
      history: [{ role: "user", content: "Do you ship to Germany?" }],
    });
    expect(screen.getByText("Do you ship to Germany?")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("Type your question…") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("appends the assistant reply on success", () => {
    render(<SupportChat />);
    openChat();
    sendMessage("Sizing?");
    act(() => mocks.askOpts?.onSuccess?.({ reply: "We stock sizes 50-60." }));
    expect(screen.getByText("We stock sizes 50-60.")).toBeTruthy();
  });

  it("shows the error message as an assistant bubble on failure", () => {
    render(<SupportChat />);
    openChat();
    sendMessage("Hello?");
    act(() => mocks.askOpts?.onError?.({ message: "Chat is unavailable." }));
    expect(screen.getByText("Chat is unavailable.")).toBeTruthy();
  });

  it("does not send blank input", () => {
    render(<SupportChat />);
    openChat();
    fireEvent.change(screen.getByPlaceholderText("Type your question…"), {
      target: { value: "   " },
    });
    fireEvent.submit(
      screen
        .getByPlaceholderText("Type your question…")
        .closest("form") as HTMLFormElement,
    );
    expect(mocks.askMutate).not.toHaveBeenCalled();
  });

  it("disables the send button while a reply is pending", () => {
    mocks.askPending = true;
    render(<SupportChat />);
    openChat();
    fireEvent.change(screen.getByPlaceholderText("Type your question…"), {
      target: { value: "still there?" },
    });
    expect((screen.getByLabelText("Send") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
