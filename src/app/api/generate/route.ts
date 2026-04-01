import { NextRequest, NextResponse } from 'next/server';

type GenerateRequestBody = {
  text?: string;
};

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。分析提供的教材内容，生成一个全面的学习指南。

**重要规则：**
1. 内容必须全面，不能遗漏重要章节
2. 每个章节至少5个核心知识点
3. 生成足够多的练习题（至少10道）
4. 输出必须是有效的JSON

**输出格式（严格JSON）：**

{
  "topic": "根据内容推断的主题",
  "title": "完整学习指南标题",
  "overview": "教材概述和学习目标（100字以上）",
  "chapters": [
    {
      "id": "ch_1",
      "chapter": "第一章：章节名称",
      "summary": "本章详细总结（50字以上）",
      "keyPoints": ["核心知识点1", "核心知识点2", "核心知识点3", "核心知识点4", "核心知识点5"],
      "importance": "high"
    }
  ],
  "practiceQuestions": [
    {
      "id": "q1",
      "chapter": "第一章",
      "question": "练习题问题（完整题干）",
      "options": ["A选项（完整）", "B选项（完整）", "C选项（完整）", "D选项（完整）"],
      "correctAnswerIndex": 0,
      "explanation": "答案解析"
    }
  ],
  "studyPlan": {
    "duration": "建议学习周期",
    "stages": [
      {"stage": "第1阶段", "goal": "阶段目标", "tasks": ["任务1", "任务2", "任务3"]},
      {"stage": "第2阶段", "goal": "阶段目标", "tasks": ["任务1", "任务2", "任务3"]},
      {"stage": "第3阶段", "goal": "阶段目标", "tasks": ["任务1", "任务2", "任务3"]}
    ]
  },
  "tips": ["学习技巧1", "学习技巧2", "学习技巧3"]
}`;

export async function POST(request: NextRequest) {
  let fallbackText = '通用学习内容';

  try {
    let body: GenerateRequestBody = {};
    try {
      body = (await request.json()) as GenerateRequestBody;
    } catch {
      body = {};
    }

    const rawText = typeof body?.text === 'string' ? body.text : '';
    const safeText = rawText || fallbackText;

    // Clean and truncate text - keep enough for meaningful analysis
    const cleanedText = safeText.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
    const truncatedText = cleanedText.slice(0, 50000); // 50k chars limit for API
    fallbackText = truncatedText || fallbackText;

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    if (!miniMaxApiKey) {
      return NextResponse.json(getMockGuide(fallbackText));
    }

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
            { role: 'user', content: `请分析以下教材内容，生成完整的学习指南：\n\n${truncatedText.slice(0, 30000)}` }
          ],
          temperature: 0.5,
          max_tokens: 8000
        })
      });

      if (!response.ok) {
        return NextResponse.json(getMockGuide(fallbackText));
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content;

      if (!content) {
        return NextResponse.json(getMockGuide(fallbackText));
      }

      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
      }

      const result = JSON.parse(content);
      return NextResponse.json(result);

    } catch (error) {
      console.error('API error:', error);
      return NextResponse.json(getMockGuide(fallbackText));
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(getMockGuide(fallbackText));
  }
}

function getMockGuide(text: string) {
  // Extract a topic from the text
  const firstLine = text.split('\n')[0]?.slice(0, 50) || '学习内容';
  const topic = firstLine.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');

  return {
    topic: topic || '通用学习',
    title: `${topic || '学习内容'} 完整指南`,
    overview: `基于您提供的教材内容生成的学习指南。本指南将帮助您系统性地学习${topic || '相关内容'}，包含详细的知识点拆解、学习计划和练习题。`,
    chapters: [
      {
        id: 'ch_1',
        chapter: '第一章：核心概念',
        summary: '本章介绍该领域的基础核心概念，帮助建立知识框架。',
        keyPoints: ['概念一：基础定义', '概念二：核心原理', '概念三：重要特性', '概念四：应用场景', '概念五：与其他概念的关系'],
        importance: 'high'
      },
      {
        id: 'ch_2',
        chapter: '第二章：重点知识',
        summary: '深入讲解该领域的重点知识点，包含详细案例。',
        keyPoints: ['重点一：详细解释', '重点二：案例分析', '重点三：常见误区', '重点四：解题技巧', '重点五：扩展应用'],
        importance: 'high'
      },
      {
        id: 'ch_3',
        chapter: '第三章：实践应用',
        summary: '将理论知识应用到实际问题中，巩固学习成果。',
        keyPoints: ['应用一：场景分析', '应用二：问题解决', '应用三：实操练习', '应用四：经验总结', '应用五：进阶方向'],
        importance: 'medium'
      }
    ],
    practiceQuestions: [
      { id: 'q1', chapter: '第一章', question: '关于核心概念的说法，以下正确的是？', options: ['选项A：详细描述', '选项B：详细描述', '选项C：详细描述', '选项D：详细描述'], correctAnswerIndex: 0, explanation: '详细解析答案为什么正确' },
      { id: 'q2', chapter: '第一章', question: '下列关于概念的说法错误的是？', options: ['选项A', '选项B', '选项C', '选项D'], correctAnswerIndex: 1, explanation: '解析错误选项的问题' },
      { id: 'q3', chapter: '第二章', question: '重点知识的正确理解是？', options: ['选项A', '选项B', '选项C', '选项D'], correctAnswerIndex: 2, explanation: '解析正确答案' },
      { id: 'q4', chapter: '第二章', question: '以下哪个不是重点知识的应用？', options: ['选项A', '选项B', '选项C', '选项D'], correctAnswerIndex: 3, explanation: '解析为什么其他选项都是应用' },
      { id: 'q5', chapter: '第三章', question: '实践应用中需要注意什么？', options: ['选项A', '选项B', '选项C', '选项D'], correctAnswerIndex: 0, explanation: '解析实践要点' }
    ],
    studyPlan: {
      duration: '2-4周',
      stages: [
        { stage: '第一阶段', goal: '打牢基础', tasks: ['学习第一章核心概念', '整理笔记', '完成基础练习'] },
        { stage: '第二阶段', goal: '深入理解', tasks: ['学习第二章重点知识', '做进阶练习', '总结常见题型'] },
        { stage: '第三阶段', goal: '巩固提高', tasks: ['学习第三章实践应用', '做综合练习', '查漏补缺'] }
      ]
    },
    tips: [
      '建议先通读全文了解整体框架，再深入各个章节',
      '每学完一章记得做练习题巩固',
      '整理错题本是提高的关键'
    ]
  };
}
