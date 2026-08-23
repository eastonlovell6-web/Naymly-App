const EXTRACTION_SYSTEM_PROMPT = `You extract contact details from a short, casual spoken transcript recorded right after someone met a new person for the first time.

Extract only what is clearly and explicitly stated. Never invent or guess details that were not said.

Respond with ONLY a JSON object in exactly this shape, no prose, no markdown, no code fences:
{"name": string, "contextTags": string[]}

- "name": the person's full name if clearly stated, otherwise an empty string.
- "contextTags": an array of short (2-5 word) freeform phrases capturing role, company, physical description, or any other notable detail that was mentioned. Omit anything not explicitly said. Return an empty array if nothing notable was mentioned besides the name.`;

type Extraction = {
  name: string;
  contextTags: string[];
};

const EMPTY_EXTRACTION: Extraction = { name: '', contextTags: [] };

function isValidExtraction(value: unknown): value is Extraction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.contextTags) &&
    candidate.contextTags.every((tag) => typeof tag === 'string')
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let transcript: string;
  try {
    const body = await req.json();
    if (typeof body.transcript !== 'string' || body.transcript.trim().length === 0) {
      return Response.json(EMPTY_EXTRACTION);
    }
    transcript = body.transcript;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('extract-contact: ANTHROPIC_API_KEY is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      }),
    });
  } catch (err) {
    console.error('extract-contact: Anthropic request failed', err);
    return Response.json(EMPTY_EXTRACTION);
  }

  if (!anthropicResponse.ok) {
    console.error('extract-contact: Anthropic returned', anthropicResponse.status);
    return Response.json(EMPTY_EXTRACTION);
  }

  const anthropicBody = await anthropicResponse.json();
  const text = anthropicBody?.content?.[0]?.text;
  if (typeof text !== 'string') {
    return Response.json(EMPTY_EXTRACTION);
  }

  let cleanedText = text.trim();
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    return Response.json(EMPTY_EXTRACTION);
  }

  if (!isValidExtraction(parsed)) {
    return Response.json(EMPTY_EXTRACTION);
  }

  return Response.json(parsed);
});
