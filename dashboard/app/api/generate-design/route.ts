import { NextResponse } from 'next/server';

type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'text'; text: string };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 });
  }

  const { brief, design_type, client_name, company, brand_colors, width, height, reference_images } = await req.json();
  if (!brief || !design_type) {
    return NextResponse.json({ error: 'brief y design_type son requeridos' }, { status: 400 });
  }

  const svgWidth  = Number(width)  || 1080;
  const svgHeight = Number(height) || 1350;
  const aspect = svgWidth > svgHeight ? 'horizontal/landscape' : svgWidth < svgHeight ? 'vertical/portrait' : 'square';

  const mainPrompt = `Generate a complete, production-ready SVG for a ${design_type.replace(/_/g, ' ')} design.

CLIENT: ${client_name}${company ? ` / ${company}` : ''}
BRAND COLORS: ${brand_colors || 'Blue #0052CC, Purple #7C3AED, Cyan #06B6D4'}

CANVAS:
- viewBox="0 0 ${svgWidth} ${svgHeight}"
- width="${svgWidth}" height="${svgHeight}"
- Aspect ratio: ${aspect}

BRIEF (use as creative direction):
${brief.substring(0, 2000)}

STRICT REQUIREMENTS:
- Output ONLY raw SVG code. No explanation, no markdown fences, no backticks.
- First character must be < and the code must start with <svg
- Last characters must be </svg>
- The SVG must be fully self-contained and render correctly in any browser
- No external image references (no href to remote URLs)
- Use embedded gradient fills and shapes only
- Include company name "${company || client_name}" prominently
- Dark background with gradient (deep navy/purple: from #0a0a14 to #1a0a2e)
- Subtle decorative geometric/dot pattern in background
- Glassmorphism card (fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)")
- Main headline: large bold white text (main message from brief)
- Supporting details: smaller text in accent color
- CTA button at bottom: gradient pill
- Footer: client name and website hint
- Font: font-family="Inter, system-ui, -apple-system, sans-serif"
- No emojis in SVG text elements
- Adapt layout to ${aspect} canvas (${svgWidth}×${svgHeight}px)

Output the raw SVG now, starting immediately with <svg:`;

  // Build message content — prepend reference images if provided
  const userContent: ContentBlock[] = [];

  if (Array.isArray(reference_images) && reference_images.length > 0) {
    for (const imgUrl of reference_images) {
      try {
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) continue;
        const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
        const mediaType = contentType.startsWith('image/png') ? 'image/png'
          : contentType.startsWith('image/webp') ? 'image/webp'
          : contentType.startsWith('image/gif') ? 'image/gif'
          : 'image/jpeg';
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
        });
      } catch (e) {
        console.error('[generate-design] failed to fetch reference image:', e);
      }
    }
    if (userContent.length > 0) {
      userContent.push({
        type: 'text',
        text: 'Above are reference images. Use them as STYLE and COMPOSITION inspiration only — adapt the aesthetic, do not copy directly.',
      });
    }
  }

  userContent.push({ type: 'text', text: mainPrompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.DESIGN_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  let svg: string = data.content?.[0]?.text ?? '';

  const svgStart = svg.indexOf('<svg');
  const svgEnd   = svg.lastIndexOf('</svg>');
  if (svgStart !== -1 && svgEnd !== -1) {
    svg = svg.substring(svgStart, svgEnd + 6);
  }

  if (!svg.startsWith('<svg')) {
    return NextResponse.json({ error: 'No se pudo generar un SVG válido. Intenta de nuevo.' }, { status: 500 });
  }

  return NextResponse.json({ svg });
}
