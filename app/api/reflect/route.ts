import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const ALLOWED = ["https://anchor.architect-dna.ch", "http://localhost:3000"];

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED.includes(origin)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { profile, entry, followUpResponse } = await req.json();

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

  return Response.json({ reflection, followUp });
}
