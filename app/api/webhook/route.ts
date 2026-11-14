import { stripe, creditsLeft } from "@/app/lib/guard";

export const dynamic = "force-dynamic";

// Called by Stripe (signed) or by the browser after the success redirect (session_id in body).
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");

  if (sig) {
    const body = await req.text();
    try {
      stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
      return Response.json({ received: true });
    } catch {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  // How many sessions this purchase still has. The session id is the token the browser keeps;
  // the count lives on the server, so a payment can't be replayed.
  const { session_id } = await req.json().catch(() => ({}));
  const left = await creditsLeft(session_id, "anchor_sessions");
  if (left <= 0) return Response.json({ granted: 0 }, { status: 402 });
  return Response.json({ granted: left, token: session_id });
}
