'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

type View = 'home' | 'bookshelf' | 'learning' | 'topic';
type Step = 'input' | 'generating' | 'report';

interface Chapter {
  id: string;
  chapter: string;
  summary: string;
  keyPoints: string[];
  importance: 'high' | 'medium' | 'low';
}

interface Resources {
  textbooks?: { title: string; description: string; url?: string }[];
  pastPapers?: { title: string; description: string; url?: string; year?: string }[];
  onlineCourses?: { title: string; platform?: string; instructor?: string; description: string; url?: string }[];
  studyNotes?: { title: string; author?: string; description: string; url?: string }[];
}

interface StudyPlan {
  duration?: string;
  stages?: { stage: string; goal: string; resources?: string[]; tasks?: string[] }[];
}

interface LearningGuide {
  title: string;
  topic?: string;
  overview: string;
  chapters: Chapter[];
  studyTips?: string[];
  resources?: Resources;
  studyPlan?: StudyPlan;
  practiceQuestions?: any[];
  tableOfContents?: any[];
}

interface Book {
  id: string;
  name: string;
  topic?: string;
  createdAt: string;
  progress: number;
  learningGuide?: LearningGuide;
}

interface QuizAnswer {
  questionId: string;
  selected: number;
  correct: boolean;
}

interface QuizFeedback {
  correct: boolean;
  explanation: string;
  hint: string;
}

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

async function extractTextFromPDF(file: File): Promise<string> {
  if (!window.pdfjsLib) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.head.appendChild(script);
    await new Promise<void>((resolve) => { script.onload = () => resolve(); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return text;
}

// Chunked PDF extraction for large files
async function extractTextFromPDFChunked(
  file: File, 
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  if (!window.pdfjsLib) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.head.appendChild(script);
    await new Promise<void>((resolve) => { script.onload = () => resolve(); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const totalPages = pdf.numPages;
  let text = '';
  
  const CHUNK_SIZE = 50; // Extract 50 pages at a time
  
  for (let i = 1; i <= totalPages; i += CHUNK_SIZE) {
    const endPage = Math.min(i + CHUNK_SIZE - 1, totalPages);
    let chunkText = '';
    
    for (let j = i; j <= endPage; j++) {
      const page = await pdf.getPage(j);
      const content = await page.getTextContent();
      chunkText += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    
    text += chunkText + '\n';
    
    if (onProgress) {
      onProgress(endPage, totalPages);
    }
    
    // Small delay to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return text;
}

function cleanText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .replace(/https?:\/\/[^\s\n]{5,}/gi, '').replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .split('\n').filter(l => {
      const t = l.trim();
      if (!t) return true;
      if (/^[\d\s.。,，、;；:：]+$/.test(t)) return false;
      if (t.length < 10 && !/[的一是不了在和人中有]/.test(t)) return false;
      return true;
    }).join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}

// Demo data for landing page
const DEMO_CONTENT = `关键路径法是项目管理中最重要的概念之一。
关键路径是指项目中时间最长的活动序列，它决定了项目的最短完成时间。
关键路径上的活动没有浮动时间，任何延迟都会导致整个项目延迟。
总时差是指在不延误项目完工日期的前提下，活动可以延迟的时间。
自由时差是指在不影响紧后活动最早开始时间的前提下，活动可以延迟的时间。
挣值管理是项目成本和进度绩效分析的标准化方法。
计划值(PV)是应该完成工作的预算成本。
实际成本(AC)是已完成工作的实际花费。
挣值(EV)是已完成工作的预算价值。
进度绩效指数(SPI) = EV/PV，SPI大于1表示进度超前。
成本绩效指数(CPI) = EV/AC，CPI大于1表示成本节约。`;

const DEMO_GUIDE: LearningGuide = {
  title: '系统集成项目管理 - 关键路径与挣值管理',
  topic: '项目管理',
  overview: '掌握项目管理的核心计算方法：关键路径法和挣值管理',
  chapters: [
    {
      id: 'ch1',
      chapter: '第一章：关键路径法',
      summary: '理解关键路径的概念和计算方法',
      keyPoints: ['关键路径定义', '总时差计算', '自由时差计算', '六标时图'],
      importance: 'high'
    },
    {
      id: 'ch2',
      chapter: '第二章：挣值管理',
      summary: '掌握成本和进度绩效分析',
      keyPoints: ['PV/AC/EV三参数', 'SPI/CPI两指标', '完工估算EAC', '绩效分析'],
      importance: 'high'
    }
  ],
  studyTips: ['先理解概念再做计算', '多做真题练习']
};

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [step, setStep] = useState<Step>('input');
  const [topicInput, setTopicInput] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [learningGuide, setLearningGuide] = useState<LearningGuide | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractingProgress, setExtractingProgress] = useState({ current: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Demo flow state
  const [demoStarted, setDemoStarted] = useState(false);
  const [demoStep, setDemoStep] = useState(0); // 0:input 1:concepts 2:timer 3:quiz
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<QuizFeedback | null>(null);
  
  // Timer state
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ff_books');
    if (saved) setBooks(JSON.parse(saved));
  }, []);

  // Timer effect
  useEffect(() => {
    if (timerStatus === 'running') {
      timerRef.current = setInterval(() => {
        setTimerElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerStatus]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTimer = () => setTimerStatus('running');
  const pauseTimer = () => setTimerStatus('paused');
  const resetTimer = () => { setTimerElapsed(0); setTimerStatus('idle'); };

  const saveBooks = (updated: Book[]) => {
    setBooks(updated);
    localStorage.setItem('ff_books', JSON.stringify(updated));
  };

  const triggerConfetti = () => confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });

  // Demo functions
  const startDemo = () => {
    setDemoStarted(true);
    setDemoStep(0);
    setQuizAnswers([]);
    setQuizFeedback(null);
    resetTimer();
  };

  const submitDemoInput = () => {
    setLoading(true);
    setTimeout(() => {
      setLearningGuide(DEMO_GUIDE);
      setDemoStep(1);
      setLoading(false);
    }, 1500);
  };

  const startDemoQuiz = () => {
    setDemoStep(3); // Go to timer first
    setQuizAnswers([]);
    setQuizFeedback(null);
    resetTimer();
  };

  const submitQuizAnswer = async (selected: number) => {
    const correctAnswer = 0;
    const isCorrect = selected === correctAnswer;
    
    setQuizAnswers([...quizAnswers, { questionId: 'q1', selected, correct: isCorrect }]);
    
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: 'q1',
          question: '关键路径是指什么？',
          options: ['项目中最长的活动序列', '最短的活动序列', '任意一条路径', '成本最低的路径'],
          userAnswerIndex: selected,
          correctAnswerIndex: correctAnswer
        })
      });
      const data = await res.json();
      setQuizFeedback(data);
    } catch {
      setQuizFeedback({
        correct: isCorrect,
        explanation: isCorrect ? '正确！关键路径确实是项目中最长的活动序列。' : '不对，关键路径不是最短的...',
        hint: isCorrect ? '' : '回想一下关键路径的定义——它是决定项目最短工期的那个路径。'
      });
    }
    
    if (isCorrect) triggerConfetti();
  };

  const finishDemo = () => {
    setDemoStarted(false);
    setDemoStep(0);
    setLearningGuide(null);
  };

  const searchByTopic = async () => {
    if (!topicInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Try new explore API first (MiniMax with web search)
      let res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicInput })
      });
      
      let data = await res.json();
      
      // If explore fails or returns error, fallback to search API
      if (data.error) {
        res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topicInput })
        });
        data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      
      // Convert the new learning_map format to the old resources format
      const guide: any = {
        topic: data.topic || topicInput,
        title: data.topic ? `${data.topic} 學習資源` : `${topicInput} 學習資源`,
        overview: `為您搜索到與「${topicInput}」相關的學習資源`,
        resources: {
          textbooks: data.learning_map?.textbooks?.map((t: any) => ({
            title: t.title,
            description: t.summary,
            url: t.url,
            source: '教材'
          })) || [],
          pastPapers: data.learning_map?.exams?.map((e: any) => ({
            title: e.title,
            description: e.summary,
            url: e.url,
            source: '真題'
          })) || [],
          onlineCourses: data.learning_map?.courses?.map((c: any) => ({
            title: c.title,
            description: c.platform || '在線課程',
            url: c.url,
            platform: c.platform || '網絡'
          })) || [],
          studyNotes: data.learning_map?.notes?.map((n: any) => ({
            title: n.title,
            description: n.author || '網絡筆記',
            url: n.url,
            author: n.author
          })) || []
        }
      };
      
      setLearningGuide(guide);
      setStep('report');
      
      const book: Book = {
        id: Date.now().toString(),
        name: guide.title,
        topic: topicInput,
        createdAt: new Date().toISOString(),
        progress: 0,
        learningGuide: guide
      };
      saveBooks([book, ...books]);
    } catch (e: any) {
      setError(e.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
      setSelectedFile(file);
      setExtracting(true);
      setExtractingProgress({ current: 0, total: 0 });
      setError('');
      try {
        // Use chunked extraction for progress feedback
        const text = await extractTextFromPDFChunked(file, (current, total) => {
          setExtractingProgress({ current, total });
        });
        setExtractedText(cleanText(text));
      } catch (err) {
        setError('PDF 提取失败，请尝试粘贴文本');
        console.error('PDF error:', err);
      }
      setExtracting(false);
      setExtractingProgress({ current: 0, total: 0 });
    } else {
      setError('请上传 PDF 文件');
    }
  };

  const generateFromPdf = async () => {
    if (!extractedText) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const guide = data.learningGuide || data;
      setLearningGuide(guide);
      setStep('report');
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  // Home View with Demo
  // Home View - Light Minimal Theme
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="max-w-3xl mx-auto pt-16 px-6 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-3">
            FocusForge
          </h1>
          <p className="text-lg text-gray-500 mb-2">
            把時間投入轉化為真正的肌肉記憶
          </p>
          <p className="text-sm text-gray-400">
            粘貼任何學習材料，開始刻意練習
          </p>
        </div>

        {/* Three Feature Cards */}
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="grid gap-4">
            {/* Card 1: Smart Search */}
            <button
              onClick={() => setView('topic')}
              className="group bg-white rounded-2xl p-6 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">🔍</div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">智能搜索學習</h3>
                  <p className="text-gray-500 text-sm">輸入主題，AI 主動搜集官方教材、真題、網課</p>
                </div>
                <div className="text-gray-300 group-hover:text-gray-400 transition-colors">→</div>
              </div>
            </button>

            {/* Card 2: PDF Learning */}
            <button
              onClick={() => setView('learning')}
              className="group bg-white rounded-2xl p-6 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">📄</div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">PDF 學習</h3>
                  <p className="text-gray-500 text-sm">上傳教材或粘貼內容，生成學習路徑</p>
                </div>
                <div className="text-gray-300 group-hover:text-gray-400 transition-colors">→</div>
              </div>
            </button>

            {/* Card 3: Bookshelf */}
            <button
              onClick={() => setView('bookshelf')}
              className="group bg-white rounded-2xl p-6 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">📖</div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">我的書架</h3>
                  <p className="text-gray-500 text-sm">{books.length} 本學習資料</p>
                </div>
                <div className="text-gray-300 group-hover:text-gray-400 transition-colors">→</div>
              </div>
            </button>
          </div>
        </div>

        {/* Demo Section - Light version */}
        <div className="max-w-3xl mx-auto px-6 pb-16">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">⚡ 免費試用</h2>
              {!demoStarted && (
                <button 
                  onClick={startDemo} 
                  className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition"
                >
                  點擊試用 Demo
                </button>
              )}
            </div>

            {!demoStarted ? (
              <p className="text-gray-500 text-sm">
                粘貼內容太麻煩？直接點擊試用，體驗完整學習流程
              </p>
            ) : (
              <div className="space-y-4">
                {/* Demo Steps */}
                <div className="flex gap-2 mb-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`flex-1 h-1 rounded ${demoStep >= i ? 'bg-gray-900' : 'bg-gray-200'}`} />
                  ))}
                </div>

                {/* Step 0: Input */}
                {demoStep === 0 && (
                  <div className="space-y-3">
                    <p className="text-gray-600 text-sm">預填充了「關鍵路徑法」相關內容，點擊開始學習：</p>
                    <textarea
                      value={DEMO_CONTENT.slice(0, 200)}
                      readOnly
                      className="w-full h-20 p-3 bg-gray-50 rounded-xl text-gray-500 text-sm resize-none border border-gray-200"
                    />
                    {loading ? (
                      <div className="flex items-center gap-2 text-gray-600">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        AI 分析中...
                      </div>
                    ) : (
                      <button onClick={submitDemoInput} className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition">
                        🚀 開始學習
                      </button>
                    )}
                  </div>
                )}

                {/* Step 1: Concepts */}
                {demoStep === 1 && learningGuide && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900">📖 概念拆解</h3>
                    {learningGuide.chapters.map((ch, i) => (
                      <div key={ch.id} className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-medium text-gray-900">{i + 1}. {ch.chapter}</h4>
                        <p className="text-sm text-gray-500 mt-1">{ch.summary}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {ch.keyPoints.map((kp, j) => (
                            <span key={j} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">{kp}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={startDemoQuiz} className="w-full py-3 bg-purple-500 text-white rounded-xl font-medium mt-4 hover:bg-purple-600 transition">
                      ⏱️ 開始計時練習
                    </button>
                  </div>
                )}

                {/* Step 2: Timer */}
                {demoStep === 2 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900">⏱️ 專注計時器</h3>
                    <div className="bg-gray-50 rounded-xl p-6 text-center">
                      <div className="text-5xl font-mono font-bold text-gray-900 mb-4">
                        {formatTime(timerElapsed)}
                      </div>
                      <div className="flex justify-center gap-3">
                        {timerStatus === 'idle' && (
                          <button onClick={startTimer} className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition">
                            ▶ 開始
                          </button>
                        )}
                        {timerStatus === 'running' && (
                          <button onClick={pauseTimer} className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition">
                            ⏸ 暫停
                          </button>
                        )}
                        {timerStatus === 'paused' && (
                          <button onClick={startTimer} className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition">
                            ▶ 繼續
                          </button>
                        )}
                        <button onClick={resetTimer} className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition">
                          🔄 重置
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={() => { pauseTimer(); setDemoStep(3); }} 
                      className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition"
                    >
                      📝 完成計時，開始答題
                    </button>
                  </div>
                )}

                {/* Step 3: Quiz */}
                {demoStep === 3 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900">📝 測驗</h3>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="font-medium text-gray-900 mb-3">關鍵路徑是指什麼？</p>
                      {['項目中最長的活動序列', '最短的活動序列', '任意一條路徑', '成本最低的路徑'].map((opt, i) => {
                        const lastAnswer = quizAnswers[quizAnswers.length - 1];
                        const answered = !!lastAnswer;
                        const isSelected = lastAnswer?.selected === i;
                        const isCorrect = i === 0;
                        let bgClass = 'bg-white border border-gray-200 hover:border-gray-300';
                        if (answered) {
                          if (isCorrect) bgClass = 'bg-green-50 border border-green-300';
                          else if (isSelected) bgClass = 'bg-red-50 border border-red-300';
                        }
                        return (
                          <button
                            key={i}
                            onClick={() => !answered && submitQuizAnswer(i)}
                            disabled={answered}
                            className={`w-full p-3 rounded-lg text-left mb-2 transition ${bgClass}`}
                          >
                            <span className="text-gray-700">{String.fromCharCode(65 + i)}. {opt}</span>
                            {answered && isCorrect && <span className="float-right text-green-500">✓</span>}
                            {answered && isSelected && !isCorrect && <span className="float-right text-red-500">✗</span>}
                          </button>
                        );
                      })}
                    </div>
                    
                    {quizFeedback && (
                      <div className={`p-4 rounded-xl ${quizFeedback.correct ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
                        <p className="text-sm text-gray-700">{quizFeedback.explanation}</p>
                        {!quizFeedback.correct && quizFeedback.hint && (
                          <p className="text-sm text-blue-600 mt-2">💡 {quizFeedback.hint}</p>
                        )}
                      </div>
                    )}

                    {quizAnswers.length > 0 && (
                      <div className="flex gap-3">
                        <button 
                          onClick={finishDemo} 
                          className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition"
                        >
                          結束 Demo
                        </button>
                        {quizAnswers[quizAnswers.length - 1].correct ? (
                          <button 
                            onClick={() => { setDemoStarted(false); setDemoStep(0); setQuizAnswers([]); setQuizFeedback(null); }} 
                            className="flex-1 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition"
                          >
                            🚀 開始真實學習
                          </button>
                        ) : (
                          <button 
                            onClick={() => { setQuizAnswers([]); setQuizFeedback(null); }} 
                            className="flex-1 py-3 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition"
                          >
                            🔄 再試一次
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  // Topic Search View
  if (view === 'topic') {
    // Show report if search completed
    if (step === 'report' && learningGuide) {
      return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => { setView('home'); setStep('input'); setLearningGuide(null); }} className="text-gray-400 hover:text-gray-600 mb-4">
              ← 返回首頁
            </button>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-6">
              <h1 className="text-2xl font-bold mb-2">📚 {learningGuide.title}</h1>
              <p className="text-gray-500">{learningGuide.overview}</p>
            </div>

            {/* Resources */}
            {learningGuide.resources && (
              <div className="space-y-4 mb-6">
                {learningGuide.resources.textbooks && learningGuide.resources.textbooks.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-bold mb-3">📖 官方教材</h3>
                    <div className="space-y-2">
                      {learningGuide.resources.textbooks.map((r: any, i: number) => (
                        <a key={i} href={r.url} target="_blank" className="block p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                          <div className="text-gray-900 font-medium">{r.title}</div>
                          <div className="text-sm text-gray-500">{r.description} · {r.source}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {learningGuide.resources.pastPapers && learningGuide.resources.pastPapers.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-bold mb-3">📝 历年真题</h3>
                    <div className="space-y-2">
                      {learningGuide.resources.pastPapers.map((r: any, i: number) => (
                        <a key={i} href={r.url} target="_blank" className="block p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                          <div className="text-gray-900 font-medium">{r.title}</div>
                          <div className="text-sm text-gray-500">{r.description} · {r.year || r.source}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {learningGuide.resources.onlineCourses && learningGuide.resources.onlineCourses.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-bold mb-3">🎬 优质网课</h3>
                    <div className="space-y-2">
                      {learningGuide.resources.onlineCourses.map((r: any, i: number) => (
                        <a key={i} href={r.url} target="_blank" className="block p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                          <div className="flex justify-between">
                            <span className="text-gray-900 font-medium">{r.title}</span>
                            {r.platform && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{r.platform}</span>}
                          </div>
                          <div className="text-sm text-gray-500">{r.description}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {learningGuide.resources.studyNotes && learningGuide.resources.studyNotes.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-bold mb-3">📚 学习笔记</h3>
                    <div className="space-y-2">
                      {learningGuide.resources.studyNotes.map((r: any, i: number) => (
                        <a key={i} href={r.url} target="_blank" className="block p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                          <div className="text-gray-900 font-medium">{r.title}</div>
                          <div className="text-sm text-gray-500">{r.description} · {r.author || r.source}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Study Plan */}
            {learningGuide.studyPlan && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-bold mb-3">📅 学习计划</h3>
                {learningGuide.studyPlan.duration && <p className="text-cyan-600 text-sm mb-2">{learningGuide.studyPlan.duration}</p>}
                <div className="space-y-2">
                  {learningGuide.studyPlan.stages?.map((s: any, i: number) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-purple-600 font-medium">{s.stage}：{s.goal}</div>
                      <div className="text-sm text-gray-500 mt-1">任务：{s.tasks?.join('、')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save to bookshelf */}
            <button
              onClick={() => {
                const book: Book = {
                  id: Date.now().toString(),
                  name: learningGuide.title,
                  topic: topicInput,
                  createdAt: new Date().toISOString(),
                  progress: 0,
                  learningGuide
                };
                saveBooks([book, ...books]);
                setView('bookshelf');
              }}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium"
            >
              💾 保存到书架
            </button>
          </div>
        </div>
      );
    }

    // Topic input form
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 mb-6">
            ← 返回
          </button>
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔍</div>
            <h1 className="text-2xl font-bold mb-2">智能搜索學習</h1>
            <p className="text-gray-400">輸入主題，AI 自動搜集資料、教材、網課</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <textarea
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              placeholder="例如：系統集成項目管理工程師軟考"
              className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none mb-4"
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">提供主題名稱或考試名稱</span>
              <button
                onClick={searchByTopic}
                disabled={!topicInput.trim() || loading}
                className="px-6 py-3 bg-gray-900 rounded-xl font-medium disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    搜索中...
                  </span>
                ) : '🔍 開始搜索'}
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Learning/PDF View
  if (view === 'learning') {
    // Show report if generation completed
    if (step === 'report' && learningGuide) {
      return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => { setView('home'); setStep('input'); setLearningGuide(null); }} className="text-gray-400 hover:text-gray-600 mb-4">
              ← 返回首頁
            </button>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-6">
              <h1 className="text-2xl font-bold mb-2">📚 {learningGuide.title || '學習指南'}</h1>
              <p className="text-gray-500">{learningGuide.overview || 'AI 分析生成的學習內容'}</p>
            </div>

            {/* Chapters */}
            {learningGuide.chapters && learningGuide.chapters.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-bold mb-3">🗺️ 知識框架</h3>
                <div className="space-y-2">
                  {learningGuide.chapters.map((ch: any, i: number) => (
                    <div key={ch.id || i} className="p-3 bg-gray-50 rounded-xl">
                      <h4 className="font-medium text-gray-900">{i + 1}. {ch.chapter}</h4>
                      <p className="text-sm text-gray-500 mt-1">{ch.summary}</p>
                      {ch.keyPoints && ch.keyPoints.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {ch.keyPoints.map((kp: string, j: number) => (
                            <span key={j} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">{kp}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Study Plan */}
            {learningGuide.studyPlan && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-bold mb-3">📅 學習計劃</h3>
                {learningGuide.studyPlan.duration && <p className="text-cyan-600 text-sm mb-2">{learningGuide.studyPlan.duration}</p>}
                <div className="space-y-2">
                  {learningGuide.studyPlan.stages?.map((s: any, i: number) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-purple-600 font-medium">{s.stage}：{s.goal}</div>
                      <div className="text-sm text-gray-500 mt-1">任務：{s.tasks?.join('、')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Practice Questions */}
            {learningGuide.practiceQuestions && learningGuide.practiceQuestions.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-bold mb-3">📝 練習題</h3>
                <div className="space-y-4">
                  {learningGuide.practiceQuestions.map((q: any, i: number) => (
                    <div key={q.id || i} className="p-4 bg-gray-50 rounded-xl">
                      <p className="font-medium text-gray-900 mb-2">{q.chapter} - {q.question}</p>
                      <div className="space-y-1">
                        {q.options?.map((opt: string, j: number) => (
                          <div key={j} className="text-sm text-gray-600">
                            {String.fromCharCode(65 + j)}. {opt}
                            {j === q.correctAnswerIndex && <span className="text-green-500 ml-2">✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save to bookshelf */}
            <button
              onClick={() => {
                const book: Book = {
                  id: Date.now().toString(),
                  name: learningGuide.title || '未命名學習',
                  topic: learningGuide.topic || '',
                  createdAt: new Date().toISOString(),
                  progress: 0,
                  learningGuide
                };
                saveBooks([book, ...books]);
                setView('bookshelf');
              }}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium"
            >
              💾 保存到書架
            </button>
          </div>
        </div>
      );
    }

    // Learning input form
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 mb-6">
            ← 返回
          </button>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition ${isDragging ? 'border-cyan-500 bg-gray-100' : 'border-gray-300'}`}
            >
              <input ref={fileRef} type="file" accept=".pdf" onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  setSelectedFile(f);
                  setExtracting(true);
                  setExtractingProgress({ current: 0, total: 0 });
                  setError('');
                  extractTextFromPDFChunked(f, (current, total) => {
                    setExtractingProgress({ current, total });
                  }).then(t => {
                    setExtractedText(cleanText(t));
                    setExtracting(false);
                    setExtractingProgress({ current: 0, total: 0 });
                  }).catch(() => {
                    setError('PDF 提取失敗');
                    setExtracting(false);
                    setExtractingProgress({ current: 0, total: 0 });
                  });
                }
              }} className="hidden" id="pdf" />
              <label htmlFor="pdf" className="cursor-pointer">
                {extracting ? (
                  <div className="text-gray-600">
                    {extractingProgress.total > 0 ? (
                      <div className="text-center">
                        <div className="text-sm mb-1">⚡ 提取中... {extractingProgress.current}/{extractingProgress.total} 页</div>
                        <div className="w-32 h-1 bg-gray-200 rounded-full mx-auto">
                          <div 
                            className="h-full bg-cyan-500 rounded-full transition-all" 
                            style={{ width: `${(extractingProgress.current / extractingProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : '⚡ 提取中...'}
                  </div>
                ) : selectedFile ? (
                  <div>
                    <div className="text-3xl mb-2">✅</div>
                    <div className="text-gray-600">{selectedFile.name}</div>
                    <div className="text-gray-400 text-sm">點擊更換</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">{isDragging ? '📥' : '📎'}</div>
                    <div className="text-gray-600">{isDragging ? '鬆開上傳' : '點擊或拖拽 PDF'}</div>
                  </div>
                )}
              </label>
            </div>
            
            {extractedText && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">預覽（{extractedText.length.toLocaleString()} 字）</p>
                <p className="text-sm text-gray-400 line-clamp-3">{extractedText.slice(0, 300)}...</p>
              </div>
            )}

            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-400">
                {selectedFile ? `已加載 ${(extractedText.length / 1024).toFixed(0)}K 字` : '或粘貼文本'}
              </span>
              <button
                onClick={generateFromPdf}
                disabled={!extractedText || loading}
                className="px-6 py-3 bg-gray-900 rounded-xl font-medium disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    生成中...
                  </span>
                ) : '🚀 開始學習'}
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
            
            {/* Also show textarea for text input */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <textarea
                value={extractedText}
                onChange={e => { setExtractedText(e.target.value); setSelectedFile(null); }}
                placeholder="或者直接粘貼學習內容..."
                className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bookshelf View
  if (view === 'bookshelf') {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 mb-1">
                ← 返回
              </button>
              <h1 className="text-2xl font-bold">📖 我的書架</h1>
            </div>
            <button onClick={() => setView('topic')} className="px-4 py-2 bg-cyan-500 rounded-lg">
              + 新建
            </button>
          </div>

          {books.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
              <div className="text-5xl mb-3">📚</div>
              <h2 className="text-xl font-bold mb-2">書架是空的</h2>
              <p className="text-gray-400 mb-4">開始搜索主題或上傳 PDF 來學習</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setView('topic')} className="px-6 py-3 bg-gray-900 rounded-xl">
                  🔍 智能搜索
                </button>
                <button onClick={() => setView('learning')} className="px-6 py-3 bg-gray-100 rounded-xl">
                  📄 PDF 學習
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {books.map(book => (
                <div key={book.id} className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm border border-gray-100">
                  <div className="text-3xl">📕</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{book.name}</h3>
                    <p className="text-gray-400 text-sm">{book.topic || 'PDF學習'}</p>
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-200 rounded-full">
                        <div className="h-full bg-gray-900 rounded-full" style={{ width: `${book.progress}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{book.progress}% 完成</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { 
                      if (book.learningGuide) { 
                        setLearningGuide(book.learningGuide); 
                        setStep('report'); 
                        setView('learning');
                      } else {
                        setView('topic');
                      }
                    }}
                    className="px-4 py-2 bg-cyan-500/20 text-gray-600 rounded-lg"
                  >
                    查看
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Report View
  if (step === 'report' && learningGuide) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => { setStep('input'); setLearningGuide(null); }} className="text-gray-400 hover:text-gray-600 mb-4">
            ← 新搜索
          </button>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
            <h1 className="text-2xl font-bold mb-2">📚 {learningGuide.title}</h1>
            <p className="text-gray-600">{learningGuide.overview}</p>
          </div>

          {/* Resources */}
          {learningGuide.resources && (
            <div className="space-y-4 mb-6">
              {learningGuide.resources.textbooks?.length ? (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="font-bold mb-3">📖 官方教材</h3>
                  <div className="space-y-2">
                    {learningGuide.resources.textbooks.map((r, i) => (
                      <a key={i} href={r.url || '#'} target="_blank" className="block p-3 bg-gray-100 rounded-lg hover:bg-gray-200">
                        <div className="text-gray-600 font-medium">{r.title}</div>
                        <div className="text-sm text-gray-400">{r.description}</div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {learningGuide.resources.onlineCourses?.length ? (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="font-bold mb-3">🎬 優質網課</h3>
                  <div className="space-y-2">
                    {learningGuide.resources.onlineCourses.map((r, i) => (
                      <a key={i} href={r.url || '#'} target="_blank" className="block p-3 bg-gray-100 rounded-lg hover:bg-gray-200">
                        <div className="flex justify-between">
                          <span className="text-green-400 font-medium">{r.title}</span>
                          {r.platform && <span className="text-xs bg-green-500/30 px-2 py-0.5 rounded">{r.platform}</span>}
                        </div>
                        {r.instructor && <div className="text-sm text-gray-400">講師：{r.instructor}</div>}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Chapters */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
            <h3 className="font-bold mb-3">🗺️ 知識框架</h3>
            <div className="space-y-2">
              {learningGuide.chapters.map((ch, i) => (
                <div key={ch.id} className="p-3 bg-gray-100 rounded-lg">
                  <h4 className="font-medium">{i + 1}. {ch.chapter}</h4>
                  <p className="text-sm text-gray-400">{ch.summary}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ch.keyPoints.map((kp, j) => (
                      <span key={j} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">{kp}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Study Plan */}
          {learningGuide.studyPlan?.stages?.length ? (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
              <h3 className="font-bold mb-3">📅 學習計劃</h3>
              {learningGuide.studyPlan.duration && <p className="text-gray-600 text-sm mb-2">{learningGuide.studyPlan.duration}</p>}
              {learningGuide.studyPlan.stages.map((s, i) => (
                <div key={i} className="p-3 bg-gray-100 rounded-lg mb-2">
                  <div className="text-purple-400 font-medium">{s.stage}</div>
                  <div className="text-sm text-gray-400">目標：{s.goal}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Tips */}
          {learningGuide.studyTips?.length ? (
            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30">
              <h3 className="font-bold mb-2">💡 學習建議</h3>
              <ul className="space-y-1">
                {learningGuide.studyTips.map((t, i) => (
                  <li key={i} className="text-sm text-gray-600">• {t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
