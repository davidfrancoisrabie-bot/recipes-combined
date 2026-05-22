export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64, mediaType } = req.body;

  if (!base64 || !mediaType) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const systemPrompt = `You are a recipe parser. The user sends a photo of a recipe (printed, handwritten, or screenshot).

Extract the recipe and return ONLY a valid JSON object — no markdown, no backticks, no preamble, nothing else.

Schema:
{
  "title": "Recipe name",
  "servings": "e.g. Serves 4",
  "time": "e.g. 35 minutes total",
  "steps": [
    {
      "label": "Short step name (3-5 words)",
      "instruction": "Full instruction text for this step.",
      "ingredients": ["ingredient name + quantity used in this step only"]
    }
  ]
}

Rules:
- Split the method into logical named steps (4-8 steps is ideal)
- For each step, list ONLY the ingredients actually used in that step with their quantity
- If a step uses no ingredients (e.g. resting, plating), set ingredients to []
- If image quality is poor, do your best and still return valid JSON
- Return ONLY the JSON object — no other text`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Parse this recipe.' }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'API error', detail: data });
    }

    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const recipe = JSON.parse(clean);

    return res.status(200).json(recipe);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
