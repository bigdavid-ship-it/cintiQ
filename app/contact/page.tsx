import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/support/chat-thread";
import { userMarkSupportReadAction, userSendSupportMessageAction } from "@/lib/support/actions";
import type { ChatMessage } from "@/lib/support/types";

export const metadata = { title: "Customer support" };

export default async function ContactPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
          <MessageCircle className="size-7" aria-hidden />
        </div>
        <h1 className="font-display mt-4 text-2xl font-semibold">Chat with cintiQ Support</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to message our team about an order, payment, or seller account. Replies appear right here in your chat.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button asChild>
            <Link href="/login?next=/contact">Sign in to chat</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: conversation }, { data: rows }] = await Promise.all([
    supabase.from("support_conversations").select("id, status").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("support_messages")
      .select("id, sender_role, body, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);
  const messages = (rows ?? []) as ChatMessage[];
  const firstName = user.fullName?.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold">Customer support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Message our team directly. You&apos;ll be notified here, on your phone (if alerts are on) and by email when we reply.
        </p>
      </div>

      {conversation?.status === "resolved" && (
        <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          This conversation was marked resolved. Send a new message any time to reopen it.
        </p>
      )}

      <ChatThread
        viewer="user"
        ownerId={user.id}
        initialMessages={messages}
        send={userSendSupportMessageAction}
        markRead={userMarkSupportReadAction}
        otherLabel="cintiQ Support"
        emptyTitle={firstName ? `Hi ${firstName}, how can we help?` : "How can we help?"}
        emptyHint="Ask about an order, a payment, delivery, or your seller account. Include the order number if you have one."
        placeholder="Write a message to cintiQ Support..."
      />
    </main>
  );
}
