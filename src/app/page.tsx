'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

type View = 'home' | 'bookshelf' | 'learning' | 'topic';
type Step = 'input' | 'generating' | 'report';

interface Chapter {
  id: string;
  chapter: string;
  sections?: string[];
  summary: string;
  keyPoints: string[];
  importance: 'high' | 'medium' | 'low';
}

interface Resource {
  title: string;
  description: string;
  url?: string;
  year?: string;
  platform?: string;
  instructor?: string;
  author?: string;
}

interface Resources {
  textbooks?: Resource[];
  pastPapers?: Resource[];
  onlineCourses?: Resource[];
  studyNotes?: Resource[];
}

interface StudyStage {
  stage: string;
  goal: string;
  resources?: string[];
  tasks?: string[];
}

interface StudyPlan {
  duration?: string;
  dailyTime?: string;
  stages?: StudyStage[];
}

interface LearningGuide {
  title: string;
  topic?: string;
  overview: string;
  tableOfContents?: { chapter: string; sections: string[] }[];
  chapters: Chapter[];
  studyTips?: string[];
  resources?: Resources;
  studyPlan?: StudyPlan;
}

interface Book {
  id: string;
  name: string;
  topic?: string;
  content?: string;
  createdAt: string;
  lastLearnedAt?: string;
  progress: number;
  completedChapters: string[];
  learningGuide?: LearningGuide;
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
    await new Promise<void>((resolve) => {
      script.onload = () => resolve();
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = window.pdfjsLib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
  }

  return fullText;
}

function cleanText(text: string): string {
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s\n]{5,}/gi, '');
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

  const lines = cleaned.split('\n').filter(line => {
    const t = line.trim();
    if (!t) return true;
    if (/^[\d\s.。,，、;；:：]+$/.test(t)) return false;
    if (t.length < 10 && !/[的一是不了在和人中有]/.test(t)) return false;
    return true;
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [step, setStep] = useState<Step>('input');
  const [inputText, setInputText] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedPdfText, setExtractedPdfText] = useState<string>('');
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [learningGuide, setLearningGuide] = useState<LearningGuide | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfScanning, setPdfScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('focusforge_books');
    if (saved) {
      try {
        setBooks(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load books:', e);
      }
    }
  }, []);

  const saveBooks = useCallback((updated: Book[]) => {
    setBooks(updated);
    localStorage.setItem('focusforge_books', JSON.stringify(updated));
  }, []);

  const triggerConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const processPDFFile = async (file: File) => {
    setSelectedFile(file);
    setPdfExtracting(true);
    setPdfScanning(true);

    try {
      const text = await extractTextFromPDF(file);
      const cleaned = cleanText(text);
      setExtractedPdfText(cleaned);
    } catch (error) {
      console.error('PDF extraction failed:', error);
      alert('PDF 提取失败');
      setSelectedFile(null);
    } finally {
      setPdfExtracting(false);
      setPdfScanning(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        await processPDFFile(file);
      } else {
        alert('请上传 PDF 文件');
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        await processPDFFile(file);
      } else {
        alert('请选择 PDF 文件');
      }
    }
  };

  const searchByTopic = async () => {
    if (!topicInput.trim()) return;
    setStep('generating');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicInput }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setLearningGuide(data);

      const newBook: Book = {
        id: Date.now().toString(),
        name: data.title || data.topic || topicInput,
        topic: topicInput,
        createdAt: new Date().toISOString(),
        progress: 0,
        completedChapters: [],
        learningGuide: data,
      };
      saveBooks([newBook, ...books]);

      setStep('report');
    } catch (err: any) {
      setErrorMessage(err.message || '搜索失败');
      setStep('input');
    }
  };

  const generateFromPdf = async () => {
    if (!extractedPdfText.trim()) return;
    setStep('generating');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedPdfText }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const guide = data.learningGuide || data;
      setLearningGuide(guide);
      setStep('report');
    } catch (err: any) {
      setErrorMessage(err.message || '生成失败');
      setStep('input');
    }
  };

  const getChapterStatus = (ch: Chapter, index: number): 'completed' | 'learning' | 'locked' => {
    if (completedChapters.has(ch.id)) return 'completed';
    if (index === 0 || completedChapters.has(learningGuide?.chapters[index - 1]?.id || '')) return 'learning';
    return 'locked';
  };

  const completeChapter = () => {
    const ch = learningGuide?.chapters[currentChapterIndex];
    if (!ch) return;
    const newCompleted = new Set(completedChapters);
    newCompleted.add(ch.id);
    setCompletedChapters(newCompleted);
    triggerConfetti();
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  // Home View
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            FocusForge
          </h1>
          <p className="text-slate-400 text-lg">AI 驱动的智能学习引擎</p>
        </div>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          <button
            onClick={() => { setView('topic'); setStep('input'); }}
            className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl p-8 text-left hover:from-cyan-500/30 hover:to-blue-500/30 transition-all border border-cyan-500/30"
          >
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold mb-2">智能搜索学习</h2>
            <p className="text-slate-400 text-sm">输入主题，AI 自动搜集资料、教材、网课</p>
          </button>
          <button
            onClick={() => { setView('learning'); setStep('input'); }}
            className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700"
          >
            <div className="text-4xl mb-4">📄</div>
            <h2 className="text-2xl font-bold mb-2">PDF 学习</h2>
            <p className="text-slate-400 text-sm">上传 PDF 提取内容学习</p>
          </button>
          <button
            onClick={() => setView('bookshelf')}
            className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700"
          >
            <div className="text-4xl mb-4">📖</div>
            <h2 className="text-2xl font-bold mb-2">我的书架</h2>
            <p className="text-slate-400 text-sm">{books.length > 0 ? `${books.length} 本学习资料` : '查看历史学习'}</p>
          </button>
        </div>
      </div>
    );
  }

  // Topic Search View
  if (view === 'topic') {
    if (step === 'input') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => setView('home')} className="text-slate-400 hover:text-white mb-8">
              返回主页
            </button>
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🔍</div>
              <h1 className="text-3xl font-bold mb-2">智能搜索学习</h1>
              <p className="text-slate-400">输入你想学习的主题，AI 会自动上网搜集资料、教材、网课</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl p-6">
              <textarea
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="例如：系统集成项目管理工程师软考"
                className="w-full h-32 p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none mb-4"
              />
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">提供主题名称、考试名称或学习方向</span>
                <button
                  onClick={searchByTopic}
                  disabled={!topicInput.trim()}
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium disabled:opacity-50"
                >
                  🔍 开始搜索
                </button>
              </div>
              {errorMessage && (
                <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl">
                  <p className="text-red-400 text-center">{errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (step === 'generating') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">🔍</div>
            <h2 className="text-2xl font-bold mb-2">AI 正在搜索资料...</h2>
            <p className="text-slate-400">搜集官方教材，真题、网课等资源</p>
            <div className="mt-6 flex justify-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: 150 }} />
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: 300 }} />
            </div>
          </div>
        </div>
      );
    }

    if (step === 'report' && learningGuide) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => { setStep('input'); setTopicInput(''); }}
              className="text-slate-400 hover:text-white mb-4"
            >
              新搜索
            </button>
            <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl p-6 border border-cyan-500/30 mb-6">
              <h1 className="text-2xl font-bold mb-2">📚 {learningGuide.title || learningGuide.topic}</h1>
              <p className="text-slate-300">{learningGuide.overview}</p>
            </div>

            {learningGuide.resources && (
              <div className="space-y-6 mb-6">
                {learningGuide.resources.textbooks && learningGuide.resources.textbooks.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-xl font-bold mb-3">📖 官方教材</h3>
                    <div className="grid gap-3">
                      {learningGuide.resources.textbooks.map((r, i) => (
                        <a
                          key={i}
                          href={r.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-all"
                        >
                          <h4 className="font-medium text-cyan-400">{r.title}</h4>
                          <p className="text-sm text-slate-400">{r.description}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {learningGuide.resources.pastPapers && learningGuide.resources.pastPapers.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-xl font-bold mb-3">📝 历年真题</h3>
                    <div className="grid gap-3">
                      {learningGuide.resources.pastPapers.map((r, i) => (
                        <a
                          key={i}
                          href={r.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-all"
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-purple-400">{r.title}</h4>
                            {r.year && <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded">{r.year}</span>}
                          </div>
                          <p className="text-sm text-slate-400">{r.description}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {learningGuide.resources.onlineCourses && learningGuide.resources.onlineCourses.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-xl font-bold mb-3">🎬 优质网课</h3>
                    <div className="grid gap-3">
                      {learningGuide.resources.onlineCourses.map((r, i) => (
                        <a
                          key={i}
                          href={r.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-all"
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-green-400">{r.title}</h4>
                            {r.platform && <span className="text-xs bg-green-500/30 px-2 py-0.5 rounded">{r.platform}</span>}
                          </div>
                          {r.instructor && <p className="text-sm text-slate-400">讲师：{r.instructor}</p>}
                          <p className="text-sm text-slate-400">{r.description}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {learningGuide.resources.studyNotes && learningGuide.resources.studyNotes.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-xl font-bold mb-3">📒 学习笔记</h3>
                    <div className="grid gap-3">
                      {learningGuide.resources.studyNotes.map((r, i) => (
                        <a
                          key={i}
                          href={r.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-all"
                        >
                          <h4 className="font-medium text-yellow-400">{r.title}</h4>
                          {r.author && <p className="text-sm text-slate-400">作者：{r.author}</p>}
                          <p className="text-sm text-slate-400">{r.description}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {learningGuide.studyPlan && (
              <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                <h3 className="text-xl font-bold mb-3">📅 学习计划</h3>
                {learningGuide.studyPlan.duration && <p className="text-cyan-400 mb-2">建议周期：{learningGuide.studyPlan.duration}</p>}
                {learningGuide.studyPlan.stages?.map((s, i) => (
                  <div key={i} className="bg-slate-700/30 rounded-lg p-3 mb-2">
                    <h4 className="font-medium text-purple-400">{s.stage}</h4>
                    <p className="text-sm text-slate-400">目标：{s.goal}</p>
                    {s.resources && <p className="text-xs text-slate-500">资源：{s.resources.join(', ')}</p>}
                    {s.tasks && <p className="text-xs text-slate-500">任务：{s.tasks.join(', ')}</p>}
                  </div>
                ))}
              </div>
            )}

            {learningGuide.chapters && learningGuide.chapters.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-xl font-bold mb-3">🗺️ 知识框架</h3>
                <div className="space-y-3">
                  {learningGuide.chapters.map((ch, i) => (
                    <div key={ch.id} className="bg-slate-700/30 rounded-lg p-3">
                      <h4 className="font-medium">{i + 1}. {ch.chapter}</h4>
                      <p className="text-sm text-slate-400">{ch.summary}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ch.keyPoints.slice(0, 4).map((kp, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 bg-slate-600/50 rounded">{kp}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {learningGuide.studyTips && learningGuide.studyTips.length > 0 && (
              <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30 mt-6">
                <h3 className="font-bold mb-2">💡 学习建议</h3>
                <ul className="space-y-1">
                  {learningGuide.studyTips.map((t, i) => (
                    <li key={i} className="text-slate-300 text-sm">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // Bookshelf View
  if (view === 'bookshelf') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <button onClick={() => setView('home')} className="text-slate-400 hover:text-white mb-2">
                返回主页
              </button>
              <h1 className="text-3xl font-bold">📖 我的书架</h1>
            </div>
            <button
              onClick={() => setView('topic')}
              className="px-6 py-3 bg-cyan-500 rounded-xl"
            >
              + 新建学习
            </button>
          </div>

          {books.length === 0 ? (
            <div className="bg-slate-800/50 rounded-2xl p-12 text-center">
              <div className="text-6xl mb-4">📚</div>
              <h2 className="text-xl font-bold mb-2">书架是空的</h2>
              <p className="text-slate-400 mb-6">开始搜索主题或上传 PDF 来学习</p>
              <button
                onClick={() => setView('topic')}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl"
              >
                开始学习
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {books.map((book) => (
                <div key={book.id} className="bg-slate-800/50 rounded-xl p-4 flex items-center gap-4">
                  <div className="text-3xl">📕</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">{book.name}</h3>
                    <p className="text-slate-400 text-sm">{book.topic || 'PDF学习'}</p>
                    <div className="mt-2">
                      <div className="h-2 bg-slate-700 rounded-full">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                          style={{ width: `${book.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{book.progress}%</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (book.learningGuide) {
                        setLearningGuide(book.learningGuide);
                        setStep('report');
                      } else {
                        setView('topic');
                      }
                    }}
                    className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg"
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

  // Learning/PDF View
  if (view === 'learning') {
    if (step === 'input') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => setView('home')} className="text-slate-400 hover:text-white mb-8">
              返回主页
            </button>
            <div className="bg-slate-800/50 rounded-2xl p-6">
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center ${
                  isDragging ? 'border-cyan-500 bg-cyan-500/20' : 'border-slate-600'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  {pdfScanning ? (
                    <div>
                      <div className="text-4xl mb-2 animate-pulse">🔍</div>
                      <p className="text-cyan-400">扫描内容...</p>
                    </div>
                  ) : pdfExtracting ? (
                    <div>
                      <div className="text-4xl mb-2 animate-pulse">⚡</div>
                      <p className="text-cyan-400">提取中...</p>
                    </div>
                  ) : selectedFile ? (
                    <div>
                      <div className="text-4xl mb-2">✅</div>
                      <p className="text-cyan-400">{selectedFile.name}</p>
                      <p className="text-slate-400 text-sm">
                        ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-4xl mb-2">{isDragging ? '📥' : '📎'}</div>
                      <p className="text-slate-300">
                        {isDragging ? '松开上传' : '点击或拖拽 PDF'}
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {extractedPdfText && (
                <div className="mt-4">
                  <p className="text-sm text-slate-500 mb-2">
                    预览（{extractedPdfText.length.toLocaleString()} 字）
                  </p>
                  <div className="p-3 bg-slate-900/50 rounded text-sm text-slate-400 max-h-32 overflow-auto">
                    {extractedPdfText.slice(0, 1500)}...
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mt-6">
                <span className="text-sm text-slate-500">
                  {selectedFile
                    ? `已加载 ${(extractedPdfText.length / 1024).toFixed(0)}K 字`
                    : '上传 PDF'}
                </span>
                <button
                  onClick={generateFromPdf}
                  disabled={!extractedPdfText || pdfExtracting}
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl disabled:opacity-50"
                >
                  🚀 开始学习
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  return null;
}
