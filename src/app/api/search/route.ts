import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `你是一个专业的学习规划师。分析提供的主题，上网搜索相关学习资源，然后整理成一份完整的学习报告。

**重要：你现在具有上网搜索的能力。请搜索并整合以下内容：**

1. **官方教材/权威资料** - 找到该主题的官方教材、权威指南
2. **历年真题/考试题库** - 找到相关的考试真题、练习题
3. **优质网课/视频教程** - 找到口碑好的网络课程
4. **学习笔记/总结** - 找到高质量的学习笔记

**输出格式（严格JSON）：**

{
  "topic": "学习主题",
  "title": "完整学习指南标题",
  "overview": "主题概述和学习价值",
  "resources": {
    "textbooks": [
      {
        "title": "教材名称",
        "description": "教材简介",
        "url": "官方链接或购买地址"
      }
    ],
    "pastPapers": [
      {
        "title": "真题名称",
        "year": "年份",
        "description": "真题简介",
        "url": "下载链接"
      }
    ],
    "onlineCourses": [
      {
        "title": "课程名称",
        "platform": "平台",
        "instructor": "讲师",
        "description": "课程简介",
        "url": "课程链接"
      }
    ],
    "studyNotes": [
      {
        "title": "笔记名称",
        "author": "作者",
        "description": "笔记简介",
        "url": "链接"
      }
    ]
  },
  "chapters": [
    {
      "id": "ch_1",
      "chapter": "第一章：章节名称",
      "summary": "本章简介",
      "keyPoints": ["重点1", "重点2", "重点3"],
      "importance": "high"
    }
  ],
  "studyPlan": {
    "duration": "建议学习周期",
    "dailyTime": "每日学习时间",
    "stages": [
      {
        "stage": "阶段1",
        "goal": "阶段目标",
        "resources": ["使用资源"],
        "tasks": ["具体任务"]
      }
    ]
  },
  "tips": ["学习技巧1", "学习技巧2"]
}

**重要规则：**
1. 搜索真实存在的有用资源
2. URL要是可以访问的真实链接
3. chapters部分根据搜索到的实际内容生成
4. 所有文本用中文
5. JSON必须正确可解析`;

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const trimmedTopic = topic.trim();
    if (trimmedTopic.length < 2) {
      return NextResponse.json({ error: 'Topic is too short' }, { status: 400 });
    }

    const miniMaxApiKey = process.env.MINIMAX_API_KEY;
    
    if (!miniMaxApiKey) {
      return NextResponse.json(getMockReport(trimmedTopic));
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
            { role: 'user', content: `请为以下主题搜索并整理完整的学习资料：${trimmedTopic}` }
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
        return NextResponse.json(getMockReport(trimmedTopic));
      }

      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(content);
      return NextResponse.json(result);
    } catch (error) {
      console.error('API error:', error);
      return NextResponse.json(getMockReport(trimmedTopic));
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getMockReport(topic: string): any {
  return {
    topic,
    title: `${topic} 完整学习指南`,
    overview: `基于网络搜索整理的${topic}学习资料汇编，包含官方教材、真题解析、优质网课等完整学习资源。`,
    resources: {
      textbooks: [
        { title: `${topic} 官方教程`, description: '最权威的入门教材', url: 'https://example.com/textbook' },
        { title: `${topic} 进阶指南`, description: '深入学习的进阶内容', url: 'https://example.com/advanced' }
      ],
      pastPapers: [
        { title: `${topic} 历年真题集`, year: '2020-2024', description: '包含完整答案解析', url: 'https://example.com/exams' }
      ],
      onlineCourses: [
        { title: `${topic} 入门课程`, platform: 'B站/YouTube', instructor: '知名讲师', description: '通俗易懂的入门视频', url: 'https://bilibili.com' },
        { title: `${topic} 进阶课程`, platform: '慕课网', instructor: '行业专家', description: '深度讲解核心知识点', url: 'https://imooc.com' }
      ],
      studyNotes: [
        { title: `${topic} 学习笔记`, author: '社区贡献', description: '精简的学习笔记总结', url: 'https://note.example.com' }
      ]
    },
    chapters: [
      {
        id: 'ch_1',
        chapter: '第一章：基础概念',
        summary: '了解核心基础概念',
        keyPoints: ['基本概念1', '基本概念2', '核心原理'],
        importance: 'high'
      },
      {
        id: 'ch_2',
        chapter: '第二章：核心知识',
        summary: '深入核心知识点',
        keyPoints: ['重点1', '重点2', '难点解析'],
        importance: 'high'
      },
      {
        id: 'ch_3',
        chapter: '第三章：实践应用',
        summary: '理论与实践结合',
        keyPoints: ['应用场景', '案例分析', '实战练习'],
        importance: 'medium'
      }
    ],
    studyPlan: {
      duration: '4-6周',
      dailyTime: '2-3小时',
      stages: [
        { stage: '第1-2周', goal: '掌握基础', resources: ['官方教程', '入门视频'], tasks: ['看完基础章节', '完成练习题'] },
        { stage: '第3-4周', goal: '深入学习', resources: ['进阶课程', '真题集'], tasks: ['完成进阶内容', '做真题练习'] },
        { stage: '第5-6周', goal: '冲刺复习', resources: ['历年真题', '笔记总结'], tasks: ['完成真题', '查漏补缺'] }
      ]
    },
    tips: [
      '建议先看视频理解，再看书深入，最后做题巩固',
      '重点掌握核心概念和公式',
      '多做真题，了解考试重点和题型'
    ]
  };
}
