import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { 
      questionId, 
      question, 
      options, 
      userAnswerIndex, 
      correctAnswerIndex,
      explanation: providedExplanation 
    } = await request.json();

    // Fallback if not enough data
    if (typeof userAnswerIndex !== 'number' || typeof correctAnswerIndex !== 'number') {
      return NextResponse.json({ error: 'Missing answer data' }, { status: 400 });
    }

    const isCorrect = userAnswerIndex === correctAnswerIndex;
    const userAnswer = options?.[userAnswerIndex] || '';
    const correctAnswer = options?.[correctAnswerIndex] || '';

    // Try MiniMax for smart feedback
    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    
    if (miniMaxApiKey && question) {
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
              { 
                role: 'system', 
                content: `你是一个苏格拉底式的学习导师。用户答错题时，引导他们自己思考出正确答案。
回复格式（严格JSON）：
{"explanation": "苏格拉底式解释", "hint": "引导性问题", "thinking": "思维误区分析"}
不要只给答案，要引导思考。用中文回复。`
              },
              { 
                role: 'user', 
                content: `题目：${question}
选项：${options?.map((o: string, i: number) => `${String.fromCharCode(65+i)}. ${o}`).join(' | ')}
用户选择：${userAnswerIndex} - ${userAnswer}
正确答案：${correctAnswerIndex} - ${correctAnswer}
${isCorrect ? '答对了，简单解释为什么对。' : '答错了，给出苏格拉底式引导。'}`
              }
            ],
            temperature: 0.7,
            max_tokens: 500
          })
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content?.trim();
          
          if (content) {
            if (content.startsWith('```')) {
              content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
            }
            const feedback = JSON.parse(content);
            return NextResponse.json({
              correct: isCorrect,
              explanation: feedback.explanation || (isCorrect ? '正确！' : '答错了'),
              hint: feedback.hint || '',
              thinking: feedback.thinking || ''
            });
          }
        }
      } catch (e) {
        console.error('Quiz AI error:', e);
      }
    }

    // Fallback feedback
    if (isCorrect) {
      return NextResponse.json({
        correct: true,
        explanation: '✅ 回答正确！',
        hint: '',
        thinking: ''
      });
    }

    // Default wrong answer feedback
    const wrongHints: Record<number, string> = {
      0: '回想一下这个概念的定义...',
      1: '注意区分相似概念...',
      2: '从另一个角度思考试试...',
      3: '回到基础概念重新分析...'
    };

    return NextResponse.json({
      correct: false,
      explanation: `你的选择是 ${String.fromCharCode(65 + userAnswerIndex)}，正确答案是 ${String.fromCharCode(65 + correctAnswerIndex)}。

关键在于理解为什么 ${String.fromCharCode(65 + correctAnswerIndex)} 是对的。`,
      hint: wrongHints[userAnswerIndex] || '再想想题目在问什么...',
      thinking: '可能混淆了相似概念，建议回到相关章节复习。'
    });

  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
