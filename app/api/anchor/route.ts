import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const ALLOWED = ["https://anchor.architect-dna.ch", "http://localhost:3000"];

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED.includes(origin)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { loop, profile } = await req.json();

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
