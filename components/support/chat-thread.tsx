"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ChatMessage, SendResult } from "@/lib/support/types";

type Props = {
  /** Who is looking at this chat. Their own messages show on the right. */
  viewer: "user" | "admin";
  /** The customer the conversation belongs to (used for the realtime filter). */
  ownerId: string;
  initialMessages: ChatMessage[];
  send: (body: string) => Promise<SendResult>;
  markRead: () => Promise<void>;
  otherLabel: string;
  emptyTitle: string;
  emptyHint: string;
  placeholder?: string;
};

function formatStamp(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}, ${time}`;
}

export function ChatThread({
  viewer,
  ownerId,
  initialMessages,
  send,
  markRead,
  otherLabel,
  emptyTitle,
  emptyHint,
  placeholder = "Type your message...",
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id)
        ? prev
        : [...prev, m].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
  }, []);

  // Mark as read when opened.
  useEffect(() => {
    void markReadRef.current().catch(() => {});
  }, []);

  // Live updates from the other side.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`support-chat:${ownerId}:${viewer}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          addMessage({ id: row.id, sender_role: row.sender_role, body: row.body, created_at: row.created_at });
          if (row.sender_role !== viewer) void markReadRef.current().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId, viewer, addMessage]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    addMessage({ id: tempId, sender_role: viewer, body, created_at: new Date().toISOString() });
    setText("");
    requestAnimationFrame(resizeInput);

    const res: SendResult = await send(body).catch(() => ({
      ok: false as const,
      error: "Network problem. Check your connection and try again.",
    }));

    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    if (res.ok) {
      addMessage(res.message);
    } else {
      setError(res.error);
      setText(body);
      requestAnimationFrame(resizeInput);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-[min(72dvh,680px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/40 px-3 py-4 sm:px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-base font-semibold">{emptyTitle}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === viewer;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {!mine && <span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">{otherLabel}</span>}
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-border bg-card text-foreground",
                    m.id.startsWith("temp-") && "opacity-60",
                  )}
                >
                  {m.body}
                </div>
                <span suppressHydrationWarning className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                  {m.id.startsWith("temp-") ? "Sending..." : formatStamp(m.created_at)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-end gap-2 border-t border-border bg-card p-2.5"
      >
        <label htmlFor={`chat-input-${viewer}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`chat-input-${viewer}`}
          ref={inputRef}
          value={text}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            resizeInput();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-[120px] min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-sm focus:bg-card"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={sending || !text.trim()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
        </button>
      </form>
    </div>
  );
}
