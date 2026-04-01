import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的教材学习规划师。分析提供的教材内容，生成一个基于目录结构的详细学习计划。

**重要：先分析目录结构，然后按章节组织内容**

**输出格式（严格JSON）：**

{
  "learningGuide": {
    "title": "学习指南标题",
    "overview": "教材概述和学习目标",
    "tableOfContents": [
      {"chapter": "第一章", "sections": ["1.1 节", "1.2 节"]},
      {"chapter": "第二章", "sections": ["2.1 节", "2.2 节"]}
    ],
    "chapters": [
      {
        "id": "ch_1",
        "chapter": "第一章：章节名称",
        "sections": ["小节1.1", "小节1.2"],
        "summary": "本章内容总结",
        "keyPoints": ["核心知识点1", "核心知识点2", "核心知识点3"],
        "importance": "high"
      }
    ],
    "studyTips": ["学习技巧"]
  },
  "practiceQuestions": [
    {
      "id": "q1",
      "chapter": "第一章",
      "question": "练习题问题",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctAnswerIndex": 0
    }
  ]
}

**重要规则：**

1. **目录分析（tableOfContents）**：
   - 如果教材有目录，按目录章节结构组织
   - 每个章节列出其包含的小节
   - 这是学习的主要路径

2. **章节内容（chapters）**：
   - 每个章节包含：章节名称、小节列表、本章总结、核心知识点
   - 核心知识点要详细（3-8个）
   - 标注重要性（high/medium/low）
   - 这是学习的主要内容

3. **练习题（practiceQuestions）**：
   - 单独存放，学完内容后练习
   - 按章节分组
   - 测试对内容的理解和应用

4. **JSON必须正确可解析，只返回JSON**`;

export async function POST(request: NextRequest) {
  try {
    const { text, action } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return NextResponse.json({ error: 'Text is empty' }, { status: 400 });
    }
    
    if (trimmedText.length > 300000) {
      return NextResponse.json({ error: 'Text exceeds 300,000 character limit' }, { status: 400 });
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    
    if (!miniMaxApiKey) {
      return NextResponse.json(getMockGuide());
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
            { role: 'user', content: `分析以下教材内容，按目录结构生成学习计划：\n\n${trimmedText.slice(0, 250000)}` }
          ],
          temperature: 0.5,
          max_tokens: 5000
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        return NextResponse.json(getMockGuide());
      }

      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(content);
      return NextResponse.json(result);
    } catch (error) {
      console.error('API error:', error);
      return NextResponse.json(getMockGuide());
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getMockGuide(): any {
  return {
    learningGuide: {
      title: "系统集成项目管理工程师学习指南",
      overview: "基于教材内容生成的学习指南，包含章节结构和核心知识点",
      tableOfContents: [
        { chapter: "第一章：关键路径法", sections: ["1.1 网络图基础", "1.2 六标时图", "1.3 关键路径计算"] },
        { chapter: "第二章：挣值管理", sections: ["2.1 三参数", "2.2 四指标", "2.3 ETC/EAC计算"] },
        { chapter: "第三章：其他计算", sections: ["3.1 三点估算", "3.2 决策树", "3.3 缩短工期"] },
        { chapter: "第四章：案例分析", sections: ["4.1 解题思路", "4.2 历年真题"] }
      ],
      chapters: [
        {
          id: "ch_1",
          chapter: "第一章：关键路径法",
          sections: ["1.1 网络图基础", "1.2 六标时图", "1.3 关键路径计算"],
          summary: "本章介绍网络计划图的基本概念和关键路径法",
          keyPoints: [
            "网络图：由活动和节点组成的进度模型",
            "关键路径：项目中时间最长的路径，决定项目最短工期",
            "六标时图：标注ES、EF、LS、LF四个时间参数",
            "总时差：在不延误项目的前提下可延误的时间",
            "自由时差：在不影响紧后活动最早开始时可延误的时间"
          ],
          importance: "high"
        },
        {
          id: "ch_2",
          chapter: "第二章：挣值管理",
          sections: ["2.1 三参数", "2.2 四指标", "2.3 ETC/EAC计算"],
          summary: "本章学习项目成本和进度的绩效分析方法",
          keyPoints: [
            "PV（计划值）：应完成工作的预算成本",
            "AC（实际成本）：已完成工作的实际花费",
            "EV（挣值）：已完成工作的预算价值",
            "SPI>1表示进度超前，SPI<1表示进度落后",
            "CPI>1表示成本节约，CPI<1表示成本超支"
          ],
          importance: "high"
        }
      ],
      studyTips: [
        "先理解概念和公式，再通过做题巩固",
        "重点掌握前两章（关键路径和挣值）",
        "历年真题要反复练习"
      ]
    },
    practiceQuestions: [
      { id: "q1", chapter: "第一章", question: "关于关键路径的说法正确的是？", options: ["关键路径是时间最长的路径", "关键路径上的活动没有时差", "关键路径可能有多条", "以上都对"], correctAnswerIndex: 3 },
      { id: "q2", chapter: "第一章", question: "总时差和自由时差的关系是？", options: ["总时差≥自由时差", "总时差≤自由时差", "两者相等", "无法比较"], correctAnswerIndex: 0 },
      { id: "q3", chapter: "第二章", question: "当SPI=1.2时，表示？", options: ["进度落后20%", "进度超前20%", "成本节约20%", "成本超支20%"], correctAnswerIndex: 1 },
      { id: "q4", chapter: "第二章", question: "典型偏差的EAC公式是？", options: ["BAC/CPI", "AC+(BAC-EV)", "AC+ETC", "BAC/SPI"], correctAnswerIndex: 0 }
    ]
  };
}
