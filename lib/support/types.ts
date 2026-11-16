export type ChatMessage = {
  id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string };
