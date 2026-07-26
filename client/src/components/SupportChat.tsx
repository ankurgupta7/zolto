/**
 * SupportChat — the AI shop assistant floating on the storefront.
 *
 * Catalog-grounded (server builds the prompt from live products + store
 * contact channels, see server/routers/chat.ts); stateless — history lives
 * only in this component's state and is sent with each question. Hidden on
 * admin/checkout flows and when the tenant has no products yet.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { MessageCircle, Send, X, Loader2, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const HIDDEN_PREFIXES = ["/admin", "/checkout", "/claim-staff", "/login"];

export default function SupportChat() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = trpc.chat.ask.useMutation({
    onSuccess: ({ reply }) => {
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    },
    onError: (err) => {
      setMessages((m) => [...m, { role: "assistant", content: err.message }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (HIDDEN_PREFIXES.some((p) => location.startsWith(p))) return null;

  const send = () => {
    const text = input.trim();
    if (!text || ask.isPending) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    ask.mutate({ message: text, history: next.slice(-20) });
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-96 w-80 flex-col overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--brand-text)]">
              <Sparkles size={14} className="text-[var(--brand-accent)]" />
              Ask us anything
            </span>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="text-[var(--brand-muted-2)] hover:text-[var(--brand-text)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-[var(--brand-muted-2)]">
                Questions about materials, sizing, availability or a specific
                piece? I'll answer from the shop's own catalog.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-[var(--brand-accent)] text-[var(--brand-ink)]"
                    : "bg-[var(--brand-surface)] text-[var(--brand-text)]"
                }`}
              >
                {m.content}
              </div>
            ))}
            {ask.isPending && (
              <div className="bg-[var(--brand-surface)] text-[var(--brand-muted-2)] max-w-[85%] rounded-lg px-3 py-2 text-sm">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-[var(--brand-border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              className="flex-1 rounded-md border border-[var(--brand-border)] px-3 py-2 text-sm"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={ask.isPending || !input.trim()}
              aria-label="Send"
              className="rounded-md bg-[var(--brand-accent)] px-3 text-[var(--brand-ink)] disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {!open && (
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setOpen(true)}
          className="grid h-12 w-12 place-items-center rounded-full bg-[var(--brand-accent)] text-[var(--brand-ink)] shadow-lg hover:opacity-90"
        >
          <MessageCircle size={22} />
        </button>
      )}
    </div>
  );
}
