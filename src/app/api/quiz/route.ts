import { NextRequest, NextResponse } from 'next/server';

const QUIZ_FEEDBACK_PROMPT = `你是一个苏格拉底式的学习导师。当用户答错题时，你的任务是引导他们自己思考出正确答案，而不是直接给答案。

**回复格式（严格JSON）：**
{
  "correct": boolean,
  "explanation": "苏格拉底式的解释，引导用户理解",
  "hint": "给答错用户的引导性提示，让他自己推导",
  "thinking": "用户的思维误区分析"
}

**重要规则：**
- 如果答对了：解释为什么正确，但不要傲慢地庆祝
- 如果答错了：分析常见误区，用问题引导思考
- hint 应该是问题形式，让用户自己回答
- explanation 要有深度，不只是表面的"因为A对所以选A"
- 用中文回复
- JSON必须正确`;

export async function POST(request: NextRequest) {
  try {
    const { questionId, question, options, userAnswerIndex, correctAnswerIndex, context } = await request.json();

    if (typeof userAnswerIndex !== 'number') {
      return NextResponse.json({ error: 'userAnswerIndex is required' }, { status: 400 });
    }

    const isCorrect = userAnswerIndex === correctAnswerIndex;
    const userAnswer = options?.[userAnswerIndex] || '';
    const correctAnswer = options?.[correctAnswerIndex] || '';

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    if (miniMaxApiKey) {
      try {
        const prompt = `用户答题反馈请求：
题目：${question}
选项：${options?.map((o: string, i: number) => `${String.fromCharCode(65+i)}. ${o}`).join(' | ')}
用户选择：${userAnswerIndex} - ${userAnswer}
正确答案：${correctAnswerIndex} - ${correctAnswer}
${context ? `学习上下文：${context}` : ''}

请给出苏格拉底式的反馈。`;

        const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${miniMaxApiKey}`
          },
          body: JSON.stringify({
            model: 'MiniMax-M2.7',
            messages: [
              { role: 'system', content: QUIZ_FEEDBACK_PROMPT },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 500
          })
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content;
          
          if (content) {
            content = content.trim();
            if (content.startsWith('```')) {
              content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
            }
            
            const feedback = JSON.parse(content);
            return NextResponse.json({
              correct: isCorrect,
              explanation: feedback.explanation || (isCorrect ? '正确！' : '答错了'),
              hint: feedback.hint || '再想想...',
              thinking: feedback.thinking || ''
            });
          }
        }
      } catch (error) {
        console.error('Quiz feedback API error:', error);
      }
    }

    // Fallback feedback
    if (isCorrect) {
      return NextResponse.json({
        correct: true,
        explanation: '回答正确！',
        hint: '',
        thinking: ''
      });
    }

    // Default wrong answer feedback
    const wrongFeedback = getDefaultFeedback(question, userAnswerIndex, correctAnswerIndex);
    return NextResponse.json(wrongFeedback);

  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getDefaultFeedback(question: string, userIndex: number, correctIndex: number): any {
  // 苏格拉底式的默认反馈
  const hints: Record<number, string> = {
    0: '仔细回想一下这个概念的原始定义...',
    1: '这个选项混淆了哪两个概念？',
    2: '如果从另一个角度思考会怎样？',
    3: '试着从第一章的基础概念出发...'
  };

  return {
    correct: false,
    explanation: `你的选择是 ${String.fromCharCode(65 + userIndex)}，正确答案是 ${String.fromCharCode(65 + correctIndex)}。

这不是终点——关键在于理解为什么 ${String.fromCharCode(65 + correctIndex)} 是对的。

建议：回到题目描述，仔细分析每个选项的关键词。`,
    hint: hints[userIndex] || '再想想题目在问什么...',
    thinking: `常见误区：可能是把相近的概念搞混了。建议复习一下相关定义。`
  };
}
