import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt, context } = await req.json();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurado en variables de entorno" },
      { status: 500 }
    );
  }

  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.GENERATION_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: fullPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as any)?.error?.message ?? `Anthropic API error ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  const result = (data.content?.[0]?.text ?? "") as string;
  return NextResponse.json({ result });
}
