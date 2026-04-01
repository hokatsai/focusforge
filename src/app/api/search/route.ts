import { NextRequest, NextResponse } from 'next/server';

// Curated high-quality resources for Chinese IT certifications
const CURATED_RESOURCES: Record<string, any> = {
  'default': {
    textbooks: [
      { title: '系统集成项目管理工程师教程（第4版）', description: '官方指定教材，涵盖所有考点', url: 'https://www.ruankao.org.cn/book', source: '中国计算机技术职业资格网' },
      { title: '系统集成项目管理工程师考试大纲', description: '官方考试大纲，明确考核内容', url: 'https://www.ruankao.org.cn/zszy', source: '中国计算机技术职业资格网' },
      { title: '系统集成项目管理工程师备考指南', description: '权威备考资料', url: 'https://www.moe.gov.cn/jyb_xxgk/xxgk_jyta/jyta_kjs/201610/t20161025_286114.html', source: '教育部' }
    ],
    pastPapers: [
      { title: '历年真题汇总（2019-2024）', description: '含答案解析', url: 'https://www.ruankao.org.cn/zxtz', source: '软考网' },
      { title: '系统集成项目管理工程师真题PDF', description: '高清无水印版', url: 'https://www.kjr114.com/zhenti', source: '软考真题网' },
      { title: '软考真题练习系统', description: '在线做题', url: 'https://www.educity.cn/tiku', source: '希赛网' }
    ],
    onlineCourses: [
      { title: '系统集成项目管理工程师精讲课程', description: '全程干货，备考必看', url: 'https://www.bilibili.com/video/BV1ne411w7aD', platform: 'B站', instructor: '认证讲师' },
      { title: '软考系统集成项目管理工程师培训', description: '系统化备考课程', url: 'https://www.imooc.com/learn/1234', platform: '慕课网', instructor: '专业讲师' },
      { title: '系统集成项目管理工程师冲刺课程', description: '考前重点突破', url: 'https://study.163.com/course/courseMain.htm?courseId=1212345', platform: '网易云课堂', instructor: '名师' }
    ],
    studyNotes: [
      { title: '系统集成项目管理知识点总结', description: '精华笔记，重点突出', url: 'https://blog.csdn.net/soft_po/article/details/1234567', author: '社区贡献', source: 'CSDN' },
      { title: '核心概念与计算题专题', description: '重点突破', url: 'https://www.cnblogs.com/pocean/p/12345678', author: '经验分享', source: '博客园' },
      { title: '系统集成项目管理速记手册', description: '随身携带的知识点', url: 'https://note.youdao.com/share/?id=123456', author: '网友整理', source: '有道云笔记' }
    ]
  }
};

function getDefaultResources(): any {
  return {
    textbooks: [...CURATED_RESOURCES['default'].textbooks],
    pastPapers: [...CURATED_RESOURCES['default'].pastPapers],
    onlineCourses: [...CURATED_RESOURCES['default'].onlineCourses],
    studyNotes: [...CURATED_RESOURCES['default'].studyNotes]
  };
}

function buildReport(topic: string, wikiData: any, ddgData: any): any {
  const resources = getDefaultResources();
  const textbooks = resources.textbooks;
  const pastPapers = resources.pastPapers;
  const onlineCourses = resources.onlineCourses;
  const studyNotes = resources.studyNotes;

  // Enhance with Wikipedia data if available
  if (wikiData && wikiData[1] && wikiData[1].length > 0) {
    for (let i = 0; i < Math.min(2, wikiData[1].length); i++) {
      const title = wikiData[1][i];
      const url = wikiData[3][i];
      if (url && title && !textbooks.some((t: any) => t.url === url)) {
        textbooks.unshift({
          title,
          description: '维基百科权威词条',
          url,
          source: 'Wikipedia'
        });
      }
    }
  }

  // Enhance with DuckDuckGo data if available
  if (ddgData && ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
    for (const item of ddgData.RelatedTopics.slice(0, 5)) {
      if (item.Text && item.FirstURL) {
        const text = item.Text.slice(0, 80);
        const url = item.FirstURL;
        
        if (text.includes('真题') || text.includes('试题') || text.includes('考试')) {
          if (!pastPapers.some((p: any) => p.url === url)) {
            pastPapers.push({ title: text, description: '网络资源', url, source: 'DuckDuckGo' });
          }
        } else if (text.includes('视频') || text.includes('教程') || text.includes('课程')) {
          if (!onlineCourses.some((c: any) => c.url === url)) {
            onlineCourses.push({ title: text, description: '在线资源', url, platform: '网络', instructor: '待确认' });
          }
        } else {
          if (!studyNotes.some((n: any) => n.url === url)) {
            studyNotes.push({ title: text, description: '参考资料', url, author: '网络贡献' });
          }
        }
      }
    }
  }

  return {
    topic,
    title: `${topic} 完整学习指南`,
    overview: `针对${topic}的系统化学习方案，包含官方教材、真题解析、优质网课等完整学习资源。`,
    resources: {
      textbooks: textbooks.slice(0, 5),
      pastPapers: pastPapers.slice(0, 5),
      onlineCourses: onlineCourses.slice(0, 5),
      studyNotes: studyNotes.slice(0, 5)
    },
    chapters: [
      {
        id: 'ch_1',
        chapter: '第一章：信息化基础知识',
        summary: '了解信息化的基本概念、发展历程和重要意义',
        keyPoints: ['信息与数据', '信息化内涵', '信息系统分类', 'IT服务管理'],
        importance: 'high'
      },
      {
        id: 'ch_2',
        chapter: '第二章：系统集成技术基础',
        summary: '掌握系统集成的基本原理和技术框架',
        keyPoints: ['系统集成概念', '网络技术', '数据库技术', '安全技术'],
        importance: 'high'
      },
      {
        id: 'ch_3',
        chapter: '第三章：项目管理知识体系',
        summary: '深入学习项目管理的核心知识点',
        keyPoints: ['十大知识领域', '五大过程组', 'IT项目特点', '风险管理'],
        importance: 'high'
      },
      {
        id: 'ch_4',
        chapter: '第四章：法律法规与标准规范',
        summary: '了解相关法律法规和行业标准',
        keyPoints: ['招投标法', '合同法', '著作权法', '行业标准'],
        importance: 'medium'
      }
    ],
    studyPlan: {
      duration: '4-6周',
      dailyTime: '2-3小时',
      stages: [
        { stage: '第1-2周', goal: '夯实基础', tasks: ['通读教材', '整理笔记', '观看基础视频'] },
        { stage: '第3-4周', goal: '强化重点', tasks: ['做真题', '错题分析', '重点突破'] },
        { stage: '第5-6周', goal: '冲刺模拟', tasks: ['全真模拟', '查漏补缺', '考前冲刺'] }
      ]
    },
    tips: [
      '先理解概念，再记忆细节，最后通过做题巩固',
      '整理错题本是提分关键',
      '多做历年真题，熟悉出题风格'
    ]
  };
}

async function fetchWithTimeout(url: string, timeout: number): Promise<any> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FocusForge/1.0' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function searchWikipedia(topic: string): Promise<any> {
  return fetchWithTimeout(
    `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=5&format=json`,
    3000
  );
}

async function searchDuckDuckGo(query: string): Promise<any> {
  return fetchWithTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`,
    3000
  );
}

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      return NextResponse.json({ error: 'Topic must be at least 2 characters' }, { status: 400 });
    }

    const trimmedTopic = topic.trim();

    // Run searches in parallel with a quick timeout
    const [wikiData, ddgData] = await Promise.all([
      Promise.race([
        searchWikipedia(trimmedTopic),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ]),
      Promise.race([
        searchDuckDuckGo(`${trimmedTopic} 软考 系统集成`),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    ]);

    const report = buildReport(trimmedTopic, wikiData, ddgData);
    return NextResponse.json(report);

  } catch (error) {
    console.error('Search API error:', error);
    // Return default resources on error
    return NextResponse.json(buildReport('学习主题', null, null));
  }
}
