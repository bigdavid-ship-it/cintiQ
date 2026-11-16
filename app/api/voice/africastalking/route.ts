import { NextResponse } from "next/server";

const VOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman" playBeep="false">
    Hello! This is cintiQ. You have a new unattended paid order waiting in your seller dashboard. Please open your cintiQ app now to accept and fulfil it. Thank you!
  </Say>
</Response>`;

function xmlResponse() {
  return new NextResponse(VOICE_XML, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

/**
 * Africa's Talking Voice callback URL.
 * When the seller answers the automated call, AT requests this URL and plays the <Say> message.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  const params = new URLSearchParams(raw);
  const isActive = params.get("isActive");

  if (isActive === "0") {
    return new NextResponse("", { status: 200 });
  }
  return xmlResponse();
}

export async function GET() {
  return xmlResponse();
}
