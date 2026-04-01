import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习专家。你的任务是从教材内容中提取核心知识点，并创建有效的测验题来验证学习效果。

请仔细阅读以下教材内容，提取其中最重要的概念和知识点。

**重要原则：**
1. 只提取教材中明确提到的核心概念和知识点
2. 不要添加教材中没有的内容
3. 优先提取定义、原理、公式、重要结论等关键内容
4. 忽略目录、页眉页脚、出版信息等非知识内容

必须只返回JSON格式，不要Markdown，不要解释，不要代码块，只要纯JSON。

JSON格式必须严格遵循这个结构：
{
  "concepts": [
    {
      "title": "核心概念标题（中文）",
      "description": "详细解释这个概念的含义、原理和应用，3-5句话"
    }
  ],
  "quizzes": [
    {
      "id": "q1",
      "question": "测验问题（中文）",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctAnswerIndex": 0
    }
  ]
}

规则：
- 生成5-8个核心概念（越多越好，覆盖教材主要内容）
- 生成3道测验题（id分别是q1, q2, q3）
- 每道测验必须有4个选项
- correctAnswerIndex必须是0-3之间的数字
- 所有文本使用中文
- 测验应该测试对概念的实际理解，而不是死记硬背
- 只返回JSON，不要其他任何内容`;

// Split text into chunks of approximately maxChunkSize characters
function splitTextIntoChunks(text: string, maxChunkSize: number = 150000): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + maxChunkSize, text.length);
    
    // Try to break at a sentence or paragraph boundary
    if (endPos < text.length) {
      // Look for paragraph break first (\n\n), then sentence break (。！？)
      const searchStart = endPos;
      const searchEnd = Math.min(endPos + 1000, text.length);
      
      // Try to find a paragraph break
      let breakPos = text.lastIndexOf('\n\n', searchStart);
      if (breakPos > currentPos + maxChunkSize / 2) {
        endPos = breakPos + 2;
      } else {
        // Try sentence breaks
        const sentenceBreaks = ['。', '！', '？', '.\n', '!\n', '?\n'];
        let foundBreak = false;
        for (const sep of sentenceBreaks) {
          breakPos = text.lastIndexOf(sep, searchStart);
          if (breakPos > currentPos + maxChunkSize / 3) {
            endPos = breakPos + sep.length;
            foundBreak = true;
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
    
    // Hard limit to prevent abuse
    if (trimmedText.length > 250000) {
      return NextResponse.json(
        { error: 'Text exceeds 200,000 character limit. Please summarize or split the content.' },
        { status: 400 }
      );
    }

    // Check for API keys
    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    // Split text into chunks if needed
    const chunks = splitTextIntoChunks(trimmedText);
    const isChunked = chunks.length > 1;
    
    // Use MiniMax if available
    if (miniMaxApiKey) {
      const results = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
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
                { role: 'user', content: `学习内容 (第${i + 1}/${chunks.length}部分): ${chunk}` }
              ],
              temperature: 0.3,
              max_tokens: 2500
            })
          });

          if (!miniMaxResponse.ok) {
            console.error('MiniMax API error:', await miniMaxResponse.text());
            continue;
          }

          const data = await miniMaxResponse.json();
          let content = data.choices?.[0]?.message?.content;
          
          if (content && content.trim()) {
            content = content.trim();
            if (content.startsWith('```')) {
              content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
            }
            
            try {
              const parsed = JSON.parse(content);
              results.push(parsed);
            } catch {
              // Try to extract JSON
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  results.push(JSON.parse(jsonMatch[0]));
                } catch {
                  // Skip this chunk
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error processing chunk ${i + 1}:`, error);
        }
      }
      
      if (results.length > 0) {
        // Merge results from all chunks
        const merged = mergeResults(results);
        if (merged.concepts && merged.concepts.length > 0) {
          return NextResponse.json(merged);
        }
      }
    }
    
    // Use Gemini if available
    if (geminiApiKey) {
      const results = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `System: ${SYSTEM_PROMPT}\n\nUser: 学习内容 (第${i + 1}/${chunks.length}部分): ${chunk}` }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 2500 }
              })
            }
          );

          if (!geminiResponse.ok) {
            console.error('Gemini API error:', await geminiResponse.text());
            continue;
          }

          const data = await geminiResponse.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (content) {
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```')) {
              cleanContent = cleanContent.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
            }
            
            try {
              results.push(JSON.parse(cleanContent));
            } catch {
              const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
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
        if (merged.concepts && merged.concepts.length > 0) {
          return NextResponse.json(merged);
        }
      }
    }

    // Fallback: generate mock data
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
  
  // Merge concepts from all chunks
  const allConcepts: any[] = [];
  const allQuizzes: any[] = [];
  
  for (const result of results) {
    if (result.concepts) {
      allConcepts.push(...result.concepts);
    }
    if (result.quizzes) {
      allQuizzes.push(...result.quizzes);
    }
  }
  
  // Dedupe and limit concepts
  const seenTitles = new Set<string>();
  const uniqueConcepts = allConcepts.filter((c: any) => {
    if (seenTitles.has(c.title)) return false;
    seenTitles.add(c.title);
    return true;
  }).slice(0, 5);
  
  // Take quizzes from first result only (to avoid duplication)
  const quizzes = results[0]?.quizzes?.slice(0, 3) || [
    {
      id: "q1",
      question: "关于学习内容的理解测验",
      options: ["正确", "错误", "不确定", "以上都不对"],
      correctAnswerIndex: 0
    }
  ];
  
  return { concepts: uniqueConcepts, quizzes };
}

function getMockResponse(text: string): any {
  return {
    concepts: [
      {
        title: "基础概念",
        description: `${text.slice(0, 30)}... 的核心基础概念是这个学习内容的第一块基石。理解这个概念将为后续深入学习打下坚实基础。`
      },
      {
        title: "核心原理",
        description: "这是理解整体知识体系的关键环节，连接了基础与进阶内容。"
      },
      {
        title: "实践应用",
        description: "将理论知识应用到实际场景中，加深理解和记忆。"
      }
    ],
    quizzes: [
      {
        id: "q1",
        question: `关于 "${text.slice(0, 15)}..." 描述正确的是？`,
        options: ["正确描述了核心概念", "描述不够准确", "完全错误", "与主题无关"],
        correctAnswerIndex: 0
      },
      {
        id: "q2",
        question: "以下哪项最能概括这个主题的本质？",
        options: ["理论与实践的结合", "纯粹的背诵记忆", "机械的重复练习", "被动的信息接收"],
        correctAnswerIndex: 0
      },
      {
        id: "q3",
        question: "学习这个内容的最佳方式是什么？",
        options: ["理解 + 应用", "单纯阅读", "死记硬背", "不做任何准备"],
        correctAnswerIndex: 0
      }
    ]
  };
}
