import Anthropic from "@anthropic-ai/sdk";
import { allow, clientIp, clip, creditsLeft, spendCredit } from "@/app/lib/guard";

export const dynamic = "force-dynamic";

const ALLOWED = ["https://anchor.architect-dna.ch", "http://localhost:3000"];

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED.includes(origin)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const p = body?.profile ?? {};
  const profile = { name: clip(p.name, 60), situation: clip(p.situation, 800), loops: clip(p.loops, 600), building: clip(p.building, 600) };
  const entry = clip(body?.entry, 3000), followUpResponse = clip(body?.followUpResponse, 1500);
  const token = body?.token;
  if (!entry.trim()) return Response.json({ error: "Missing entry" }, { status: 400 });
  const ip = clientIp(req);
  if (!allow(`reflect:${ip}`, 30, 3_600_000)) return Response.json({ error: "rate_limited" }, { status: 429 });

  // A new reflection costs one session: from a paid pack, or from the small free allowance per
  // connection and day. Follow-ups belong to the same session and cost nothing.
  let paid = false;
  if (!followUpResponse) {
    if (token && (await creditsLeft(token, "anchor_sessions")) > 0) paid = true;
    else if (token || !allow(`free:${ip}`, 5, 86_400_000)) return Response.json({ error: "no_sessions" }, { status: 402 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const isClosing = !!followUpResponse;

  const system = `You are Anchor — a personal AI companion for ${profile.name}.

Their profile:
Current situation: ${profile.situation}
Patterns they fall into: ${profile.loops}
Building toward: ${profile.building}

Rules:
- Reference their specific situation naturally — not robotically
- Surface wins they didn't notice or frame as wins
- Connect what they logged to what they're building
- Tone: direct, warm, like a brutally honest best friend — no therapy speak
- Never give unsolicited advice or generic tips
- Hype only what was genuinely earned based on what they wrote
- Maximum 3 short paragraphs. Each paragraph 1-2 sentences. Separate paragraphs with a blank line. No walls of text.
${isClosing
  ? "- This is their follow-up. ONE closing paragraph only. No question. Feel conclusive."
  : "- End with exactly ONE follow-up question on its own line — make it count, make it personal"}`;

  const userMessage = isClosing
    ? `They followed up: ${followUpResponse}`
    : `Today's log: ${entry}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = (msg.content[0] as { text: string }).text.trim();

  const remaining = paid && text ? await spendCredit(token, "anchor_sessions") : undefined;

  if (isClosing) {
    return Response.json({ reflection: text, followUp: "" });
  }

  // Split the last question from the body
  const parts = text.split(/\n+/);
  const lastPart = parts[parts.length - 1].trim();
  const isQuestion = lastPart.endsWith("?");

  const followUp = isQuestion ? lastPart : "";
  const reflection = isQuestion
    ? parts.slice(0, -1).join("\n\n").trim()
    : text;

  return Response.json({ reflection, followUp, remaining });
}
