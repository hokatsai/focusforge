import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。分析提供的教材内容，生成一个详细的分阶段学习计划。

**输出格式要求（严格JSON）：**

{
  "learningGuide": {
    "title": "基于教材内容的学习指南标题",
    "overview": "教材概述，2-3句话说明内容和学习目标",
    "stages": [
      {
        "id": "stage_1",
        "stage": "第一阶段：基础理论",
        "goal": "本阶段的学习目标",
        "priority": "high",
        "keyPoints": ["知识点1", "知识点2", "知识点3"],
        "recommendations": "具体学习建议"
      }
    ],
    "coreKnowledge": [
      {
        "id": "knowledge_1",
        "title": "核心知识点标题",
        "description": "详细解释，3-5句话",
        "importance": "必会|重要|了解"
      }
    ],
    "studyTips": ["技巧1", "技巧2"]
  },
  "quizzes": []
}

**重要规则：**

1. **学习阶段（stages）**：
   - 生成3-5个学习阶段
   - 每个阶段有独立的知识点列表
   - 知识点要具体（不是泛泛的概念）
   - 按逻辑顺序排列（基础→进阶→应用）

2. **核心知识（coreKnowledge）**：
   - 提取8-12个核心知识点
   - 每个知识点有唯一ID用于追踪

3. **JSON格式必须正确，可以被解析**

4. **只返回JSON，不要任何其他内容**`;

// Quiz generation prompt
const QUIZ_PROMPT = `基于以下学习内容，生成3道测验题来验证学习效果：

学习主题：{topic}
学习内容：{content}

**输出格式（严格JSON）：**
{
  "quizzes": [
    {
      "id": "q1",
      "question": "测验问题",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctAnswerIndex": 0
    }
  ]
}

规则：
- 3道题
- 测试理解而非死记
- 4个选项
- 只返回JSON`;

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
    const { text, mode, action, currentStage, currentKnowledge } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return NextResponse.json({ error: 'Text is empty' }, { status: 400 });
    }
    
    if (trimmedText.length > 250000) {
      return NextResponse.json({ error: 'Text exceeds 250,000 character limit' }, { status: 400 });
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    
    // Generate learning guide
    if (action === 'generateGuide' || !action) {
      if (!miniMaxApiKey) {
        return NextResponse.json(getMockGuide(trimmedText));
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
              { role: 'user', content: `分析以下教材内容，生成学习指南：\n\n${trimmedText.slice(0, 200000)}` }
            ],
            temperature: 0.5,
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          throw new Error('API request failed');
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          return NextResponse.json(getMockGuide(trimmedText));
        }

        content = content.trim();
        if (content.startsWith('```')) {
          content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
        }
        
        const result = JSON.parse(content);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Generate guide error:', error);
        return NextResponse.json(getMockGuide(trimmedText));
      }
    }
    
    // Generate quiz for specific stage or knowledge
    if (action === 'generateQuiz' && miniMaxApiKey) {
      const topic = currentStage || currentKnowledge || '本内容';
      const content = currentStage 
        ? `阶段：${currentStage}\n知识点：${currentKnowledge?.join(', ') || ''}`
        : currentKnowledge?.title + '\n' + currentKnowledge?.description || topic;
      
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
              { role: 'system', content: QUIZ_PROMPT.replace('{topic}', topic).replace('{content}', content) },
              { role: 'user', content: `生成测验题：${content.slice(0, 5000)}` }
            ],
            temperature: 0.5,
            max_tokens: 2000
          })
        });

        if (!response.ok) {
          throw new Error('Quiz API request failed');
        }

        const data = await response.json();
        let quizContent = data.choices?.[0]?.message?.content;
        
        if (!quizContent) {
          return NextResponse.json(getMockQuiz(topic));
        }

        quizContent = quizContent.trim();
        if (quizContent.startsWith('```')) {
          quizContent = quizContent.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
        }
        
        const result = JSON.parse(quizContent);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Generate quiz error:', error);
        return NextResponse.json(getMockQuiz(topic));
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getMockGuide(text: string): any {
  return {
    learningGuide: {
      title: "系统集成项目管理工程师学习指南",
      overview: "本教材针对软考中项的系统集成项目管理内容，包含计算题和案例分析两大模块。",
      stages: [
        {
          id: "stage_1",
          stage: "第一阶段：关键路径法",
          goal: "掌握网络图的绘制和关键路径计算",
          priority: "high",
          keyPoints: ["网络图绘制规范", "六标时图公式", "最早/最晚时间计算", "总时差与自由时差", "关键路径识别"],
          recommendations: "先理解概念，再通过例题练习掌握计算方法"
        },
        {
          id: "stage_2", 
          stage: "第二阶段：挣值管理",
          goal: "掌握项目成本和进度绩效分析",
          priority: "high",
          keyPoints: ["PV、AC、EV三参数", "SV、CV、SPI、CPI四指标", "ETC和EAC计算", "典型与非典型偏差"],
          recommendations: "牢记公式多做计算题，理解每个指标的含义"
        },
        {
          id: "stage_3",
          stage: "第三阶段：其他计算专题",
          goal: "掌握三点估算、决策树等计算方法",
          priority: "medium",
          keyPoints: ["三点估算与正态分布", "预期货币价值(EMV)", "决策树分析", "缩短工期方法"],
          recommendations: "理解原理后做练习题巩固"
        },
        {
          id: "stage_4",
          stage: "第四阶段：案例分析",
          goal: "掌握计算题在案例中的应用",
          priority: "high",
          keyPoints: ["前15道核心案例题", "典型题型的解题思路", "高项下放题目"],
          recommendations: "研究历年真题，总结解题套路"
        }
      ],
      coreKnowledge: [
        { id: "k1", title: "关键路径法", description: "在网络计划图中，寻找从起点到终点的最长路径，这条路径就是关键路径。关键路径上的活动没有任何机动时间。", importance: "必会" },
        { id: "k2", title: "六标时图", description: "也称为六时标注法，在网络图每个活动上标注最早开始(ES)、最早完成(EF)、最晚开始(LS)、最晚完成(LF)四个时间参数。", importance: "必会" },
        { id: "k3", title: "总时差与自由时差", description: "总时差是指在不影响项目总工期的前提下，活动的完工期可以推迟的时间。自由时差是指在不影响紧后活动最早开始的前提下，活动可以推迟的时间。", importance: "必会" },
        { id: "k4", title: "挣值管理三参数", description: "PV(计划值)是应该完成的工作预算；AC(实际成本)是已完成工作的实际花费；EV(挣值)是已完成工作的预算价值。", importance: "必会" },
        { id: "k5", title: "挣值管理四指标", description: "SV(进度偏差)=EV-PV；CV(成本偏差)=EV-AC；SPI(进度绩效指数)=EV/PV；CPI(成本绩效指数)=EV/AC。", importance: "必会" }
      ],
      studyTips: [
        "理解原理而非死记公式",
        "多做历年真题特别是2011-2017年的题目",
        "前15道案例题必须全部掌握"
      ]
    }
  };
}

function getMockQuiz(topic: string): any {
  return {
    quizzes: [
      {
        id: "q1",
        question: `关于${topic}的说法，哪项是正确的？`,
        options: ["正确选项", "错误选项A", "错误选项B", "错误选项C"],
        correctAnswerIndex: 0
      },
      {
        id: "q2", 
        question: `${topic}的核心要素是什么？`,
        options: ["核心要素", "次要要素A", "次要要素B", "无关要素"],
        correctAnswerIndex: 0
      },
      {
        id: "q3",
        question: `学习${topic}的最佳方法是什么？`,
        options: ["理解+应用", "死记硬背", "只看不做", "完全放弃"],
        correctAnswerIndex: 0
      }
    ]
  };
}
