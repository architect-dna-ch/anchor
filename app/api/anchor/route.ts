import Anthropic from "@anthropic-ai/sdk";
import { allow, clientIp, clip } from "@/app/lib/guard";

export const dynamic = "force-dynamic";

const ALLOWED = ["https://anchor.architect-dna.ch", "http://localhost:3000"];

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED.includes(origin)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Emergency mode stays free (tiny, cheap answers), but capped against scripted abuse.
  if (!allow(`anchor:${clientIp(req)}`, 20, 3_600_000)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const loop = clip(body?.loop, 600);
  const profile = { name: clip(body?.profile?.name, 60) };
  if (!loop.trim()) return Response.json({ error: "Missing loop" }, { status: 400 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 60,
    system: `You are Anchor in emergency mode.${profile?.name ? ` User: ${profile.name}.` : ""}
Return ONE physical action. Under 20 words. No analysis. No advice. No labels. Just the anchor.
Good examples:
"Cold water on your face. 30 seconds. Go."
"Step outside. Name 5 sounds. Come back."
"Put your feet flat on the floor. Breathe out slow. You're here."
"Stand up. Walk to the nearest window. Look out for 60 seconds."`,
    messages: [{ role: "user", content: `Loop: ${loop}` }],
  });

  return Response.json({ anchor: (msg.content[0] as { text: string }).text.trim() });
}
