import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。根据多个片段的分析结果，生成完整的學習指南。

**输入：** 多个片段的摘要和知识点列表
**任务：** 整合所有片段，生成结构化的学习指南

**输出格式（严格JSON）：**
{
  "topic": "学习主题",
  "title": "完整学习指南标题",
  "overview": "整体概述（100字以上）",
  "chapters": [
    {
      "id": "ch_1",
      "chapter": "第一章：章节名称",
      "summary": "本章详细总结",
      "keyPoints": ["核心知识点1", "核心知识点2", "核心知识点3", "核心知识点4", "核心知识点5"],
      "importance": "high"
    }
  ],
  "practiceQuestions": [
    {
      "id": "q1",
      "chapter": "第一章",
      "question": "练习题问题",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctAnswerIndex": 0,
      "explanation": "答案解析"
    }
  ],
  "studyPlan": {
    "duration": "建议学习周期",
    "stages": [
      {"stage": "阶段1", "goal": "目标", "tasks": ["任务1", "任务2"]}
    ]
  },
  "tips": ["学习技巧"]
}`;

export async function POST(request: NextRequest) {
  try {
    const { chunks, topic } = await request.json();

    if (!chunks || !Array.isArray(chunks)) {
      return NextResponse.json({ error: 'Chunks array is required' }, { status: 400 });
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    // Combine chunk summaries
    const combinedAnalysis = chunks
      .map((c, i) => `片段 ${i + 1}：\n总结：${c.summary}\n知识点：${c.keyPoints?.join('、') || ''}`)
      .join('\n\n');

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
              { role: 'user', content: `请根据以下 ${chunks.length} 个片段的分析结果，生成完整的學習指南：\n\n${combinedAnalysis.slice(0, 10000)}` }
            ],
            temperature: 0.5,
            max_tokens: 4000
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
            return NextResponse.json(result);
          }
        }
      } catch (e) {
        console.error('Synthesis error:', e);
      }
    }

    // Fallback: generate basic guide from chunks
    return NextResponse.json(generateBasicGuide(chunks, topic));

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateBasicGuide(chunks: any[], topic: string): any {
  // Collect all key points
  const allPoints: string[] = [];
  for (const chunk of chunks) {
    if (chunk.keyPoints) {
      allPoints.push(...chunk.keyPoints);
    }
  }

  return {
    topic: topic || '学习内容',
    title: `${topic || '学习内容'} 完整指南`,
    overview: `基于 ${chunks.length} 个片段整合的学习指南，包含 ${allPoints.length} 个核心知识点。`,
    chapters: [
      {
        id: 'ch_1',
        chapter: '第一章：核心概念',
        summary: '整合所有片段形成的核心知识体系',
        keyPoints: allPoints.slice(0, 10),
        importance: 'high'
      }
    ],
    practiceQuestions: [
      { id: 'q1', chapter: '第一章', question: '关于本内容的说法正确的是？', options: ['A选项', 'B选项', 'C选项', 'D选项'], correctAnswerIndex: 0, explanation: '略' }
    ],
    studyPlan: {
      duration: '2-4周',
      stages: [
        { stage: '第一阶段', goal: '打牢基础', tasks: ['学习核心概念', '整理笔记'] },
        { stage: '第二阶段', goal: '强化巩固', tasks: ['做练习题', '查漏补缺'] }
      ]
    },
    tips: [
      '建议先理解整体框架，再深入细节',
      '多做练习题巩固知识点'
    ]
  };
}
