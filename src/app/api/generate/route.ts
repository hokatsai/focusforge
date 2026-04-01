import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。你的任务是对提供的教材内容进行深度分析，提取核心知识点，并生成一个结构化的学习路径。

**输出格式要求：**

请严格按照以下JSON格式输出，不要Markdown代码块，只要纯JSON：

{
  "learningGuide": {
    "title": "学习指南标题（基于教材内容生成）",
    "overview": "对这份教材的整体概述，2-3句话说明这是什么内容、有什么特点",
    "stages": [
      {
        "stage": "第一阶段：阶段名称",
        "goal": "阶段学习目标",
        "priority": "high/medium/low",
        "keyPoints": ["重点1", "重点2", "重点3"],
        "recommendations": "具体行动建议"
      }
    ],
    "coreKnowledge": [
      {
        "title": "核心知识点标题",
        "description": "详细解释这个知识点，3-5句话",
        "importance": "必会|重要|了解"
      }
    ],
    "studyTips": ["学习技巧1", "学习技巧2", "学习技巧3"]
  },
  "quizzes": [
    {
      "id": "q1",
      "question": "测验问题（测试对核心内容的理解）",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctAnswerIndex": 0
    }
  ]
}

**重要规则：**

1. **学习阶段（stages）**：
   - 根据教材内容划分2-4个学习阶段
   - 每个阶段要有明确的学习目标和行动建议
   - 标注优先级（high/medium/low）
   - 包含具体的重点知识点列表

2. **核心知识（coreKnowledge）**：
   - 提取教材中最重要的5-10个核心知识点
   - 每个知识点要有详细的解释
   - 标注重要性等级

3. **测验题（quizzes）**：
   - 生成3-5道测验题
   - 题目要测试对核心内容的理解和应用
   - 不要考死记硬背，要考理解

4. **输出要求**：
   - 所有文本使用中文
   - JSON格式要严格正确，可以被解析
   - 只返回JSON，不要任何其他内容`;

// Split text into chunks
function splitTextIntoChunks(text: string, maxChunkSize: number = 150000): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + maxChunkSize, text.length);
    
    if (endPos < text.length) {
      const searchStart = endPos;
      
      let breakPos = text.lastIndexOf('\n\n', searchStart);
      if (breakPos > currentPos + maxChunkSize / 2) {
        endPos = breakPos + 2;
      } else {
        const sentenceBreaks = ['。', '！', '？', '.\n', '!\n', '?\n'];
        for (const sep of sentenceBreaks) {
          breakPos = text.lastIndexOf(sep, searchStart);
          if (breakPos > currentPos + maxChunkSize / 3) {
            endPos = breakPos + sep.length;
            break;
          }
        }
      }
    }
    
    chunks.push(text.slice(currentPos, endPos));
    currentPos = endPos;
  }
  
  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const { text, mode } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return NextResponse.json(
        { error: 'Text is empty' },
        { status: 400 }
      );
    }
    
    if (trimmedText.length > 250000) {
      return NextResponse.json(
        { error: 'Text exceeds 250,000 character limit' },
        { status: 400 }
      );
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    
    if (!miniMaxApiKey) {
      return getMockResponse(trimmedText);
    }

    const chunks = splitTextIntoChunks(trimmedText);
    const results: any[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
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
              { role: 'user', content: `请分析以下教材内容，生成结构化的学习指南：\n\n${chunk}` }
            ],
            temperature: 0.5,
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          console.error('MiniMax API error:', await response.text());
          continue;
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content;
        
        if (content) {
          content = content.trim();
          if (content.startsWith('```')) {
            content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
          }
          
          try {
            const parsed = JSON.parse(content);
            results.push(parsed);
          } catch {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                results.push(JSON.parse(jsonMatch[0]));
              } catch {
                // Skip
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error);
      }
    }
    
    if (results.length > 0) {
      const merged = mergeResults(results);
      return NextResponse.json(merged);
    }

    return getMockResponse(trimmedText);

  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function mergeResults(results: any[]): any {
  if (results.length === 1) {
    return results[0];
  }
  
  // Merge learning guides from all chunks
  const allStages: any[] = [];
  const allCoreKnowledge: any[] = [];
  const allQuizzes: any[] = [];
  
  for (const result of results) {
    if (result.learningGuide?.stages) {
      allStages.push(...result.learningGuide.stages);
    }
    if (result.learningGuide?.coreKnowledge) {
      allCoreKnowledge.push(...result.learningGuide.coreKnowledge);
    }
    if (result.quizzes) {
      allQuizzes.push(...result.quizzes);
    }
  }
  
  // Dedupe and limit
  const seenTitles = new Set<string>();
  const uniqueKnowledge = allCoreKnowledge.filter((k: any) => {
    if (seenTitles.has(k.title)) return false;
    seenTitles.add(k.title);
    return true;
  }).slice(0, 10);
  
  // Limit stages to 4
  const uniqueStages = allStages.slice(0, 4);
  
  // Limit quizzes to 5
  const quizzes = allQuizzes.slice(0, 5);
  
  const mergedGuide = results[0]?.learningGuide || {};
  
  return {
    learningGuide: {
      title: mergedGuide.title || '学习指南',
      overview: mergedGuide.overview || '基于提供的内容生成的学习指南',
      stages: uniqueStages,
      coreKnowledge: uniqueKnowledge,
      studyTips: mergedGuide.studyTips || ['深入理解核心概念', '多做练习题', '及时复习巩固']
    },
    quizzes
  };
}

function getMockResponse(text: string): any {
  return {
    learningGuide: {
      title: "学习指南",
      overview: `基于提供的内容生成的学习指南。内容涉及的主题可以帮助你系统性地学习相关知识。`,
      stages: [
        {
          stage: "第一阶段：基础概念",
          goal: "掌握核心理论基础",
          priority: "high",
          keyPoints: ["理解基本概念", "掌握核心原理", "建立知识框架"],
          recommendations: "仔细阅读教材的基础章节，确保理解每个核心概念的定义和含义。"
        },
        {
          stage: "第二阶段：深入学习",
          goal: "深化理解与应用",
          priority: "high",
          keyPoints: ["应用所学知识", "解决实际问题", "形成知识体系"],
          recommendations: "通过练习题和应用案例来加深对知识的理解。"
        }
      ],
      coreKnowledge: [
        {
          title: "核心概念",
          description: "这是本内容的核心基础概念，理解这个概念对后续学习至关重要。",
          importance: "必会"
        }
      ],
      studyTips: [
        "深入理解而非死记硬背",
        "多做练习巩固知识",
        "及时复习防止遗忘"
      ]
    },
    quizzes: [
      {
        id: "q1",
        question: "以下哪项最准确地描述了主要内容？",
        options: ["正确描述", "部分正确", "错误描述", "无关内容"],
        correctAnswerIndex: 0
      }
    ]
  };
}
