import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { AIChatBox, type Message } from "./AIChatBox";

// Streamdown is a streaming-markdown renderer; here we only care that
// assistant content is routed through it.
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="streamdown">{children}</div>
  ),
}));

// The storefront falls back to German when the browser asks for it; pin
// English so the default placeholder assertions below read the source string.
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  // jsdom implements neither smooth scrolling API.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

const getSendButton = (container: HTMLElement) =>
  container.querySelector('button[type="submit"]') as HTMLButtonElement;

describe("AIChatBox", () => {
  it("shows the empty state and sends a suggested prompt on click", () => {
    const onSend = vi.fn();
    render(
      <AIChatBox
        messages={[]}
        onSendMessage={onSend}
        emptyStateMessage="Ask me anything"
        suggestedPrompts={["Explain rings", "Write a caption"]}
      />,
    );
    expect(screen.getByText("Ask me anything")).toBeTruthy();
    fireEvent.click(screen.getByText("Write a caption"));
    expect(onSend).toHaveBeenCalledWith("Write a caption");
  });

  it("sends trimmed input via the send button and clears the field", () => {
    const onSend = vi.fn();
    const { container } = render(
      <AIChatBox messages={[]} onSendMessage={onSend} />,
    );
    const textarea = screen.getByPlaceholderText(
      "Type your message...",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  hello there  " } });
    fireEvent.click(getSendButton(container));
    expect(onSend).toHaveBeenCalledWith("hello there");
    expect(textarea.value).toBe("");
  });

  it("sends on Enter but not on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<AIChatBox messages={[]} onSendMessage={onSend} />);
    const textarea = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("line one");
  });

  it("refuses to send whitespace-only input", () => {
    const onSend = vi.fn();
    const { container } = render(
      <AIChatBox messages={[]} onSendMessage={onSend} />,
    );
    const textarea = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(textarea, { target: { value: "   " } });
    const button = getSendButton(container);
    expect(button.disabled).toBe(true);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("blocks sending while the assistant is responding", () => {
    const onSend = vi.fn();
    const { container } = render(
      <AIChatBox messages={[]} onSendMessage={onSend} isLoading />,
    );
    const textarea = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(textarea, { target: { value: "hi" } });
    expect(getSendButton(container).disabled).toBe(true);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders user and assistant messages but filters system messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is your return policy?" },
      { role: "assistant", content: "30 days, no questions asked." },
    ];
    render(<AIChatBox messages={messages} onSendMessage={vi.fn()} />);
    expect(screen.getByText("What is your return policy?")).toBeTruthy();
    // Assistant content goes through the markdown renderer.
    expect(screen.getByTestId("streamdown").textContent).toBe(
      "30 days, no questions asked.",
    );
    expect(screen.queryByText("You are a helpful assistant.")).toBeNull();
  });
});
