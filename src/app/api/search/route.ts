import { NextRequest, NextResponse } from 'next/server';

async function fetchWithTimeout(url: string, timeout: number): Promise<any> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'FocusForge/1.0' }
    });
    clearTimeout(id);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string): Promise<any[]> {
  const data = await fetchWithTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`,
    5000
  );
  
  if (!data) return [];
  
  const results: any[] = [];
  
  // Get related topics
  if (data.RelatedTopics) {
    for (const item of data.RelatedTopics.slice(0, 8)) {
      if (item.Text && item.FirstURL) {
        results.push({
          title: item.Text.slice(0, 100),
          url: item.FirstURL,
          snippet: ''
        });
      }
    }
  }
  
  // Get abstract if available
  if (data.AbstractText) {
    results.unshift({
      title: data.Heading || query,
      url: data.AbstractURL || '',
      snippet: data.AbstractText.slice(0, 200)
    });
  }
  
  return results;
}

function buildSearchQueries(topic: string): string[] {
  return [
    `${topic} 官方教材`,
    `${topic} 历年真题`,
    `${topic} 视频教程 学习`,
    `${topic} 学习笔记`,
    `${topic} 考试大纲`
  ];
}

function categorizeResults(results: any[], topic: string): any {
  const textbooks: any[] = [];
  const pastPapers: any[] = [];
  const onlineCourses: any[] = [];
  const studyNotes: any[] = [];
  
  const lowerTopic = topic.toLowerCase();
  
  for (const r of results) {
    const title = r.title.toLowerCase();
    const url = r.url || '';
    
    // Classify based on URL and title keywords
    if (
      url.includes('gov.cn') || 
      url.includes('ruankao') ||
      title.includes('教材') || 
      title.includes('教程') ||
      title.includes('官方')
    ) {
      textbooks.push(r);
    } else if (
      title.includes('真题') || 
      title.includes('试题') || 
      title.includes('考试') ||
      url.includes('exam') ||
      url.includes('tiku')
    ) {
      pastPapers.push(r);
    } else if (
      title.includes('视频') || 
      title.includes('课程') || 
      title.includes('教程') ||
      title.includes('b站') ||
      url.includes('bilibili') ||
      url.includes('youtube') ||
      url.includes('imooc') ||
      url.includes('慕课')
    ) {
      onlineCourses.push(r);
    } else {
      studyNotes.push(r);
    }
  }
  
  return { textbooks, pastPapers, onlineCourses, studyNotes };
}

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      return NextResponse.json({ error: 'Topic must be at least 2 characters' }, { status: 400 });
    }

    const trimmedTopic = topic.trim();

    // Build search queries
    const queries = buildSearchQueries(trimmedTopic);
    
    // Execute searches in parallel
    const searchResults = await Promise.all(
      queries.map(q => searchDuckDuckGo(q))
    );
    
    // Flatten and dedupe results
    const allResults: any[] = [];
    const seenUrls = new Set<string>();
    
    for (const results of searchResults) {
      for (const r of results) {
        if (r.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }

    // Categorize results
    const categorized = categorizeResults(allResults, trimmedTopic);

    return NextResponse.json({
      topic: trimmedTopic,
      title: `${trimmedTopic} 学习资源`,
      overview: `为您搜索到${allResults.length}个与「${trimmedTopic}」相关的学习资源，包括教材、真题、网课和笔记。`,
      resources: {
        textbooks: categorized.textbooks.slice(0, 5),
        pastPapers: categorized.pastPapers.slice(0, 5),
        onlineCourses: categorized.onlineCourses.slice(0, 5),
        studyNotes: categorized.studyNotes.slice(0, 5)
      },
      chapters: [
        { id: 'ch_1', chapter: '搜索结果', summary: '基于搜索结果整理的学习资源', keyPoints: ['善用搜索资源', '结合多种学习材料', '理论与实践结合'], importance: 'high' }
      ],
      studyPlan: {
        duration: '根据个人情况',
        stages: [
          { stage: '搜索阶段', goal: '收集资料', tasks: ['浏览搜索结果', '筛选优质资源', '建立学习计划'] },
          { stage: '学习阶段', goal: '系统学习', tasks: ['观看网课', '阅读教材', '做练习题'] },
          { stage: '巩固阶段', goal: '查漏补缺', tasks: ['做真题', '整理笔记', '考前冲刺'] }
        ]
      },
      tips: [
        '搜索结果来自网络，请自行验证链接有效性',
        '建议从官方教材开始学习',
        '结合视频课程效果更好'
      ]
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
