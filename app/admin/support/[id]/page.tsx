import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/support/chat-thread";
import { adminMarkSupportReadAction, adminReplySupportMessageAction, setSupportStatusAction } from "@/lib/support/actions";
import type { ChatMessage } from "@/lib/support/types";

export const metadata = { title: "Support conversation" };

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["admin"], `/admin/support/${id}`);
  const supabase = await createClient();

  const { data: convo } = await supabase
    .from("support_conversations")
    .select("id, user_id, status, profiles(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (!convo) notFound();

  const profile = convo.profiles as unknown as { full_name: string | null; email: string | null } | null;
  const name = profile?.full_name?.trim() || profile?.email || "User";

  const { data: rows } = await supabase
    .from("support_messages")
    .select("id, sender_role, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(300);
  const messages = (rows ?? []) as ChatMessage[];
  const resolved = convo.status === "resolved";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/admin/support" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All conversations
      </Link>

      <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl font-semibold">{name}</h1>
          {profile?.email && <p className="truncate text-xs text-muted-foreground">{profile.email}</p>}
        </div>
        <form action={setSupportStatusAction.bind(null, convo.id, resolved ? "open" : "resolved")}>
          <Button type="submit" variant="outline" className="h-9 text-xs">
            {resolved ? "Reopen conversation" : "Mark as resolved"}
          </Button>
        </form>
      </div>

      {resolved && (
        <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          Marked resolved. It reopens automatically if the user writes again.
        </p>
      )}

      <ChatThread
        viewer="admin"
        ownerId={convo.user_id}
        initialMessages={messages}
        send={adminReplySupportMessageAction.bind(null, convo.user_id)}
        markRead={adminMarkSupportReadAction.bind(null, convo.id)}
        otherLabel={name}
        emptyTitle="No messages yet"
        emptyHint="When this user writes in, their messages will appear here."
        placeholder={`Reply to ${name}...`}
      />
    </main>
  );
}
