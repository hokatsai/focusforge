import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。分析提供的教材内容片段，提取核心知识点和结构。

**重要规则：**
1. 提取 3-5 个核心知识点
2. 如果内容是章节开头，总结本章主题
3. 输出必须是有效的 JSON

**输出格式：**
{
  "summary": "本段内容总结（50字以上）",
  "keyPoints": ["知识点1", "知识点2", "知识点3"],
  "chapterHints": ["可能的章节主题"]
}`;

export async function POST(request: NextRequest) {
  try {
    const { chunk, chunkIndex, totalChunks, isLast, context } = await request.json();

    if (!chunk || typeof chunk !== 'string') {
      return NextResponse.json({ error: 'Chunk is required' }, { status: 400 });
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    // Build prompt with optional context from previous chunks
    let userPrompt = chunk;
    if (context) {
      userPrompt = `前文背景：${context}\n\n当前片段：\n${chunk}`;
    }

    if (miniMaxApiKey) {
      try {
        const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${miniMaxApiKey}`
          },
          body: JSON.stringify({
            model: 'MiniMax-M2.7',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt.slice(0, 8000) }
            ],
            temperature: 0.3,
            max_tokens: 1000
          })
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content?.trim();

          if (content) {
            if (content.startsWith('```')) {
              content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
            }
            const result = JSON.parse(content);
            return NextResponse.json({
              ...result,
              chunkIndex,
              isLast,
              totalChunks
            });
          }
        }
      } catch (e) {
        console.error('Chunk processing error:', e);
      }
    }

    // Fallback: basic extraction
    return NextResponse.json({
      summary: `第 ${chunkIndex + 1} 段内容分析完成`,
      keyPoints: extractKeyPoints(chunk),
      chapterHints: [],
      chunkIndex,
      isLast,
      totalChunks
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function extractKeyPoints(text: string): string[] {
  // Simple keyword extraction as fallback
  const lines = text.split('\n').filter(l => l.length > 20);
  const points: string[] = [];
  
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 50);
    if (cleaned.length > 10) {
      points.push(cleaned);
    }
  }
  
  return points.slice(0, 5);
}
