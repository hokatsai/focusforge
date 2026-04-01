import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `# Role
你是一位資深的「知識獵人」與「學習路徑規劃師」。你擅長在海量的互聯網信息中，精準篩選出含金量最高、最適合自學者的學習資源，並將其結構化。

# Task
根據用戶提供的【學習主題】，進行全網實時搜索，並整理出一份閉環式的學習資源清單。

# Search Strategy
請針對以下四個維度進行深度搜索：
1. **官方/權威教材**：尋找該領域公認的經典教材、官方大綱或 PDF 手冊。
2. **歷年真題/模擬題**：尋找備考必備的真題集、刷題網站或 GitHub 上的題庫倉庫。
3. **優質網課/影片**：優先搜索 Bilibili、YouTube 或 MOOC 上的高評分課程鏈接。
4. **學霸筆記/精華總結**：尋找知乎專欄、CSDN 深度文章或 GitHub 上的 Awesome 資源列表。

# Output Constraints (極其重要)
1. **輸出格式**：必須僅輸出一個嚴格的 JSON 對象，不允許包含任何解釋性文字或 Markdown 標籤。
2. **鏈接有效性**：請確保提供的 URL 是真實存在且與主題高度相關的。
3. **語言要求**：搜索結果的標題和簡介請使用繁體中文（或根據資料原文顯示）。

# JSON Schema
{
  "topic": "學習主題名稱",
  "learning_map": {
    "textbooks": [
      { "title": "教材名稱", "summary": "簡短描述該教材的權威性或特色", "url": "鏈接地址" }
    ],
    "exams": [
      { "title": "題庫名稱", "summary": "描述題庫年份或覆蓋範圍", "url": "鏈接地址" }
    ],
    "courses": [
      { "title": "課程標題", "platform": "平台名稱", "url": "鏈接地址" }
    ],
    "notes": [
      { "title": "筆記標題", "author": "作者或來源", "url": "鏈接地址" }
    ]
  }
}`;

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const trimmedTopic = topic.trim();
    const miniMaxApiKey = process.env.MINIMAX_API_KEY;

    if (!miniMaxApiKey) {
      return NextResponse.json(getMockResults(trimmedTopic));
    }

    try {
      // Try MiniMax with web search capability
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
            { role: 'user', content: `我想學習的主題是：${trimmedTopic}` }
          ],
          temperature: 0.3,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content;

      if (!content) {
        return NextResponse.json(getMockResults(trimmedTopic));
      }

      content = content.trim();
      
      // Remove markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
      }
      
      // Try to parse as JSON
      try {
        const result = JSON.parse(content);
        return NextResponse.json(result);
      } catch {
        // If JSON parsing fails, try to extract JSON from the content
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]);
            return NextResponse.json(result);
          } catch {
            // Fall through to mock data
          }
        }
        return NextResponse.json(getMockResults(trimmedTopic));
      }

    } catch (error) {
      console.error('Explore API error:', error);
      return NextResponse.json(getMockResults(trimmedTopic));
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getMockResults(topic: string): any {
  // Fallback mock data when API is unavailable
  return {
    topic,
    learning_map: {
      textbooks: [
        { 
          title: `${topic} 官方教程`, 
          summary: '權威教材，涵蓋所有考點', 
          url: 'https://www.ruankao.org.cn/book' 
        }
      ],
      exams: [
        { 
          title: `${topic} 歷年真題`, 
          summary: '2019-2024年真題彙總', 
          url: 'https://www.ruankao.org.cn/zxtz' 
        }
      ],
      courses: [
        { 
          title: `${topic} 精講課程`, 
          platform: 'B站', 
          url: 'https://www.bilibili.com' 
        }
      ],
      notes: [
        { 
          title: `${topic} 學習筆記`, 
          author: '社區貢獻', 
          url: 'https://blog.csdn.net' 
        }
      ]
    }
  };
}
