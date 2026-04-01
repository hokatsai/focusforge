import { NextRequest, NextResponse } from 'next/server';

// Tavily API key - better search results than DuckDuckGo
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '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';

interface SearchResult {
  title: string;
  url: string;
  content: string;
  relevanceScore: number;
}

async function searchWithTavily(query: string, maxResults = 8): Promise<SearchResult[]> {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        max_results: maxResults,
        include_answer: true,
        include_domains: [
          'ruankao.org.cn',      // 软考网
          'gov.cn',              // 政府网站
          'bilibili.com',        // B站
          'youku.com',           // 优酷
          'icourse163.org',      // 网易公开课
          'csdn.net',            // CSDN
          'cnblogs.com',         // 博客园
          'github.com',          // GitHub
          'educity.cn',          // 希赛网
          'exam8.com',           // 考试吧
        ]
      })
    });

    if (!response.ok) {
      throw new Error('Tavily API failed');
    }

    const data = await response.json();
    
    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      relevanceScore: r.score || 0
    }));
  } catch (error) {
    console.error('Tavily search error:', error);
    return [];
  }
}

async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function buildLearningMap(results: SearchResult[], topic: string): any {
  const textbooks: any[] = [];
  const exams: any[] = [];
  const courses: any[] = [];
  const notes: any[] = [];
  
  const lowerTopic = topic.toLowerCase();
  
  for (const r of results) {
    const title = r.title.toLowerCase();
    const url = r.url.toLowerCase();
    const content = r.content.toLowerCase();
    
    // Skip if no meaningful content
    if (r.content.length < 20) continue;
    
    // Classify based on URL and content
    if (
      url.includes('ruankao') ||
      url.includes('gov.cn') ||
      url.includes('exam') ||
      title.includes('教材') ||
      title.includes('教程') ||
      title.includes('大纲')
    ) {
      textbooks.push({
        title: r.title,
        summary: r.content.slice(0, 100),
        url: r.url
      });
    } else if (
      title.includes('真题') ||
      title.includes('试题') ||
      title.includes('考试') ||
      url.includes('tiku') ||
      url.includes('exam')
    ) {
      exams.push({
        title: r.title,
        summary: r.content.slice(0, 100),
        url: r.url
      });
    } else if (
      title.includes('视频') ||
      title.includes('课程') ||
      title.includes('教程') ||
      url.includes('bilibili') ||
      url.includes('youku') ||
      url.includes('icourse') ||
      url.includes('imooc')
    ) {
      courses.push({
        title: r.title,
        platform: url.includes('bilibili') ? 'B站' : 
                  url.includes('youku') ? '优酷' : 
                  url.includes('imooc') ? '慕课网' : '在线课程',
        url: r.url
      });
    } else {
      notes.push({
        title: r.title,
        author: '网络贡献',
        url: r.url
      });
    }
  }
  
  // If categories are empty, use top results
  if (textbooks.length === 0 && results.length > 0) {
    textbooks.push({
      title: results[0].title,
      summary: results[0].content.slice(0, 100),
      url: results[0].url
    });
  }
  
  return {
    textbooks: textbooks.slice(0, 5),
    exams: exams.slice(0, 5),
    courses: courses.slice(0, 5),
    notes: notes.slice(0, 5)
  };
}

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const trimmedTopic = topic.trim();
    
    // Build optimized search queries for better relevance
    const queries = [
      `${trimmedTopic} 官方教材 2024`,
      `${trimmedTopic} 历年真题 备考`,
      `${trimmedTopic} 视频教程 学习`,
      `${trimmedTopic} 学习笔记 总结`
    ];

    // Search with Tavily (parallel)
    const searchResults = await Promise.all(
      queries.map(q => searchWithTavily(q, 5))
    );

    // Flatten and dedupe results
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();
    
    for (const results of searchResults) {
      for (const r of results) {
        if (r.url && !seenUrls.has(r.url) && r.relevanceScore > 0.5) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }

    // Sort by relevance
    allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Build learning map
    const learningMap = buildLearningMap(allResults.slice(0, 15), trimmedTopic);

    return NextResponse.json({
      topic: trimmedTopic,
      learning_map: learningMap,
      meta: {
        total_results: allResults.length,
        search_time: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Explore API error:', error);
    return NextResponse.json({ 
      error: 'Search failed',
      topic: '',
      learning_map: { textbooks: [], exams: [], courses: [], notes: [] }
    }, { status: 500 });
  }
}
