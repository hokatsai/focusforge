import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are an expert learning assistant. When a user gets a quiz question wrong, provide surgical, precise feedback.

The feedback should:
1. Explain WHY the wrong answer is incorrect
2. Point to the correct answer with a hint
3. Keep it short and actionable (under 50 words total)
4. Be encouraging, not discouraging
5. Use Chinese language

Return JSON in this format ONLY:
{
  "feedback": "Your feedback text here"
}`;

export async function POST(request: NextRequest) {
  try {
    const { question, wrongOption } = await request.json();

    if (!question || !wrongOption) {
      return NextResponse.json(
        { error: 'Question and wrongOption are required' },
        { status: 400 }
      );
    }

    // Check for MiniMax API key
    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    if (!miniMaxApiKey) {
      // Fallback mock feedback
      const mockFeedback = {
        feedback: `你选择的 "${wrongOption}" 虽然有一定道理，但不是最佳答案。这个题目考查的是对概念本质的理解。建议回顾相关概念，从更深层次思考问题本质。答对的同学往往理解了这个知识点的核心原理。`
      };
      return NextResponse.json(mockFeedback);
    }

    // Use MiniMax API
    const miniMaxResponse = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${miniMaxApiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Question: ${question}\nWrong Answer: ${wrongOption}` }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!miniMaxResponse.ok) {
      const errorText = await miniMaxResponse.text();
      console.error('MiniMax API error:', errorText);
      throw new Error('MiniMax API request failed');
    }

    const data = await miniMaxResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No feedback generated');
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response');
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
