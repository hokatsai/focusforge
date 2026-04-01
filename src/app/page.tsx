'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

type View = 'home' | 'bookshelf' | 'learning';
type Step = 'input' | 'generating' | 'learning' | 'practicing' | 'complete';
type ChapterStatus = 'locked' | 'learning' | 'completed';

interface Chapter {
  id: string;
  chapter: string;
  sections?: string[];
  summary: string;
  keyPoints: string[];
  importance: 'high' | 'medium' | 'low';
}

interface PracticeQuestion {
  id: string;
  chapter: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

interface LearningGuide {
  title: string;
  overview: string;
  tableOfContents?: { chapter: string; sections: string[] }[];
  chapters: Chapter[];
  studyTips?: string[];
}

interface Book {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  lastLearnedAt?: string;
  progress: number;
  completedChapters: string[];
  learningGuide?: LearningGuide;
  practiceQuestions?: PracticeQuestion[];
}

declare global {
  interface Window { pdfjsLib: any; }
}

async function extractTextFromPDF(file: File): Promise<string> {
  if (!window.pdfjsLib) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.head.appendChild(script);
    await new Promise<void>((resolve) => { script.onload = () => resolve(); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const loadingTask = window.pdfjsLib.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedPdfText, setExtractedPdfText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'pdf'>('text');
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [learningGuide, setLearningGuide] = useState<LearningGuide | null>(null);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfScanning, setPdfScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Map<string, number>>(new Map());
  const [showQuizResult, setShowQuizResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('focusforge_books');
    if (saved) try { setBooks(JSON.parse(saved)); } catch {}
  }, []);

  const saveBooks = useCallback((updated: Book[]) => {
    setBooks(updated);
    localStorage.setItem('focusforge_books', JSON.stringify(updated));
  }, []);

  const triggerConfetti = () => confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

  const processPDFFile = async (file: File) => {
    setSelectedFile(file);
    setInputMode('pdf');
    setPdfExtracting(true);
    setPdfScanning(true);
    try {
      const text = await extractTextFromPDF(file);
      const cleaned = cleanText(text);
      setExtractedPdfText(cleaned);
      setInputText(cleaned.slice(0, 300000));
    } catch { alert('PDF 提取失败'); setInputMode('text'); setSelectedFile(null); }
    finally { setPdfExtracting(false); setPdfScanning(false); }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files?.[0]) {
      const isPdf = files[0].type === 'application/pdf' || files[0].name.toLowerCase().endsWith('.pdf');
      if (isPdf) await processPDFFile(files[0]);
      else alert('请上传 PDF');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) await processPDFFile(file);
      else alert('请选择 PDF');
    }
  };

  const generateLearning = async () => {
    const text = inputMode === 'pdf' ? extractedPdfText : inputText;
    if (!text.trim()) return;
    setStep('generating');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLearningGuide(data.learningGuide || data);
      setPracticeQuestions(data.practiceQuestions || []);
      setStep('learning');
      if (currentBook) {
        const updated = books.map(b => b.id === currentBook.id ? { ...b, learningGuide: data.learningGuide || data, practiceQuestions: data.practiceQuestions || [] } : b);
        saveBooks(updated);
      }
    } catch (err: any) {
      setErrorMessage(err.message || '生成失败');
      setStep('input');
    }
  };

  const startChapter = (index: number) => setCurrentChapterIndex(index);

  const completeChapter = () => {
    const ch = learningGuide?.chapters[currentChapterIndex];
    if (!ch) return;
    const newCompleted = new Set(completedChapters);
    newCompleted.add(ch.id);
    setCompletedChapters(newCompleted);
    triggerConfetti();
    if (currentBook) {
      const progress = Math.round((newCompleted.size / (learningGuide?.chapters.length || 1)) * 100);
      const updated = books.map(b => b.id === currentBook.id ? { ...b, completedChapters: Array.from(newCompleted), progress } : b);
      saveBooks(updated);
    }
  };

  const startPractice = () => {
    setQuizMode(true);
    setQuizIndex(0);
    setQuizAnswers(new Map());
    setShowQuizResult(false);
  };

  const handleQuizAnswer = (answerIndex: number) => {
    const q = practiceQuestions[quizIndex];
    if (!q) return;
    const newAnswers = new Map(quizAnswers);
    newAnswers.set(q.id, answerIndex);
    setQuizAnswers(newAnswers);
  };

  const nextQuestion = () => {
    if (quizIndex < practiceQuestions.length - 1) setQuizIndex(quizIndex + 1);
    else setShowQuizResult(true);
  };

  const getQuizResult = () => {
    let correct = 0;
    practiceQuestions.forEach(q => {
      const ans = quizAnswers.get(q.id);
      if (ans === q.correctAnswerIndex) correct++;
    });
    return { correct, total: practiceQuestions.length, rate: Math.round((correct / practiceQuestions.length) * 100) };
  };

  const getChapterStatus = (ch: Chapter, index: number): ChapterStatus => {
    if (completedChapters.has(ch.id)) return 'completed';
    if (index === 0 || completedChapters.has(learningGuide?.chapters[index - 1]?.id || '')) return 'learning';
    return 'locked';
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  // Home View
  if (view === 'home') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">⚡ FocusForge</h1>
        <p className="text-slate-400 text-lg">AI 驱动的分阶段学习引擎</p>
      </div>
      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        <button onClick={() => setView('learning')} className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700 hover:border-cyan-500/50">
          <span className="text-4xl mb-4 block">📚</span>
          <h2 className="text-2xl font-bold mb-2">开始学习</h2>
          <p className="text-slate-400">上传 PDF 获取学习路径</p>
        </button>
        <button onClick={() => setView('bookshelf')} className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700 hover:border-purple-500/50">
          <span className="text-4xl mb-4 block">📖</span>
          <h2 className="text-2xl font-bold mb-2">我的书架</h2>
          <p className="text-slate-400">{books.length > 0 ? `${books.length} 本书籍` : '书架是空的'}</p>
        </button>
      </div>
    </div>
  );

  // Bookshelf View
  if (view === 'bookshelf') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div><button onClick={() => setView('home')} className="text-slate-400 hover:text-white mb-2">← 返回</button><h1 className="text-3xl font-bold">📖 我的书架</h1></div>
          <button onClick={() => setView('learning')} className="px-6 py-3 bg-cyan-500 rounded-xl">+ 添加新书</button>
        </div>
        {books.length === 0 ? (
          <div className="bg-slate-800/50 rounded-2xl p-12 text-center">
            <span className="text-6xl mb-4 block">📚</span>
            <h2 className="text-xl font-bold mb-2">书架是空的</h2>
            <p className="text-slate-400 mb-6">开始学习来添加第一本书</p>
            <button onClick={() => setView('learning')} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl">开始学习</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {books.map(book => (
              <div key={book.id} className="bg-slate-800/50 rounded-xl p-4 flex items-center gap-4">
                <div className="text-3xl">📕</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{book.name}</h3>
                  <p className="text-slate-400 text-sm">{formatDate(book.createdAt)}</p>
                  <div className="mt-2"><div className="h-2 bg-slate-700 rounded-full"><div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${book.progress}%` }} /></div><p className="text-xs text-slate-500 mt-1">{book.progress}% 完成</p></div>
                </div>
                <button onClick={() => { setCurrentBook(book); setLearningGuide(book.learningGuide || null); setPracticeQuestions(book.practiceQuestions || []); setCompletedChapters(new Set(book.completedChapters || [])); setView('learning'); setStep(book.learningGuide ? 'learning' : 'input'); }} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg">继续</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Learning - Input Step
  if (view === 'learning' && step === 'input') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setView('home')} className="text-slate-400 hover:text-white">← 返回</button>
          <button onClick={() => setView('bookshelf')} className="text-slate-400 hover:text-white">📖 书架</button>
        </div>
        <div className="bg-slate-800/50 rounded-2xl p-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={() => { setInputMode('text'); setSelectedFile(null); setExtractedPdfText(''); }} className={`px-6 py-2 rounded-lg ${inputMode === 'text' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}>📝 文本</button>
            <button onClick={() => setInputMode('pdf')} className={`px-6 py-2 rounded-lg ${inputMode === 'pdf' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}>📄 PDF</button>
          </div>
          {inputMode === 'text' ? (
            <>
              <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="输入学习内容..." className="w-full h-48 p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              <div className="flex justify-between items-center mt-4"><span className="text-sm text-slate-500">{inputText.length.toLocaleString()} 字</span><button onClick={generateLearning} disabled={!inputText.trim()} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl disabled:opacity-50">🚀 生成学习路径</button></div>
            </>
          ) : (
            <>
              <div onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-8 text-center ${isDragging ? 'border-cyan-500 bg-cyan-500/20' : selectedFile ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-600'}`}>
                <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" id="pdf" />
                <label htmlFor="pdf" className="cursor-pointer">
                  {pdfScanning ? <div><span className="text-4xl block animate-pulse mb-2">🔍</span><p className="text-cyan-400">扫描内容...</p></div> : pdfExtracting ? <div><span className="text-4xl block animate-pulse mb-2">⚡</span><p className="text-cyan-400">提取中...</p></div> : selectedFile ? <div><span className="text-4xl block mb-2">✅</span><p className="text-cyan-400">{selectedFile.name}</p><p className="text-slate-400 text-sm">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p></div> : <div><span className="text-4xl block mb-2">{isDragging ? '📥' : '📎'}</span><p className="text-slate-300">{isDragging ? '松开上传' : '点击或拖拽 PDF'}</p></div>}
                </label>
              </div>
              {extractedPdfText && (
                <div className="mt-4">
                  <div className="flex justify-between mb-2"><span className="text-sm text-slate-400">预览</span><button onClick={() => { setEditableText(extractedPdfText); setShowEditModal(true); }} className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">✏️ 编辑</button></div>
                  <div className="p-3 bg-slate-900/50 rounded text-sm text-slate-400 max-h-32 overflow-auto">{extractedPdfText.slice(0, 1500)}...</div>
                </div>
              )}
              <div className="flex justify-between items-center mt-6"><span className="text-sm text-slate-500">{selectedFile ? `已加载（${extractedPdfText.length.toLocaleString()} 字）` : '上传 PDF'}</span><button onClick={generateLearning} disabled={!extractedPdfText || pdfExtracting || pdfScanning} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl disabled:opacity-50">🚀 生成学习路径</button></div>
            </>
          )}
          {errorMessage && <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl"><p className="text-red-400 text-center">{errorMessage}</p></div>}
        </div>
      </div>
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">✏️ 编辑内容</h2><button onClick={() => setShowEditModal(false)} className="text-slate-400 text-2xl">×</button></div>
            <textarea value={editableText} onChange={e => setEditableText(e.target.value)} className="flex-1 w-full p-4 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            <div className="flex justify-between mt-4"><span className="text-sm text-slate-500">{editableText.length.toLocaleString()} 字</span><div className="flex gap-3"><button onClick={() => setShowEditModal(false)} className="px-6 py-2 bg-slate-700 rounded-xl">取消</button><button onClick={() => { setExtractedPdfText(editableText); setInputText(editableText); setShowEditModal(false); }} className="px-6 py-2 bg-cyan-500 rounded-xl">保存</button></div></div>
          </div>
        </div>
      )}
    </div>
  );

  // Generating Step
  if (step === 'generating') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8 flex items-center justify-center">
      <div className="text-center">
        <span className="text-6xl block animate-pulse mb-4">⚡</span>
        <h2 className="text-2xl font-bold mb-2">AI 分析中...</h2>
        <p className="text-slate-400">生成学习路径和练习题</p>
        <div className="mt-6 flex justify-center gap-2"><div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" /><div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>
      </div>
    </div>
  );

  // Learning - Main Learning View
  if (view === 'learning' && step === 'learning' && !quizMode && learningGuide) {
    const progress = Math.round((completedChapters.size / learningGuide.chapters.length) * 100);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setStep('input')} className="text-slate-400 hover:text-white">← 重新开始</button>
            <button onClick={() => setView('bookshelf')} className="text-slate-400 hover:text-white">📖 书架</button>
          </div>
          <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl p-6 border border-cyan-500/30 mb-6">
            <h2 className="text-2xl font-bold mb-2">📚 {learningGuide.title}</h2>
            <p className="text-slate-300">{learningGuide.overview}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <div className="flex justify-between mb-2"><span className="text-slate-400">学习进度</span><span className="text-cyan-400 font-bold">{completedChapters.size} / {learningGuide.chapters.length} 已完成</span></div>
            <div className="h-3 bg-slate-700 rounded-full"><div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
          {learningGuide.tableOfContents && learningGuide.tableOfContents.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
              <h3 className="font-bold mb-3">📑 目录</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {learningGuide.tableOfContents.map((toc, i) => (
                  <div key={i} className="bg-slate-700/30 rounded-lg p-3">
                    <h4 className="font-medium mb-1">{toc.chapter}</h4>
                    <p className="text-xs text-slate-400">{toc.sections?.join(' | ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4 mb-6">
            <h3 className="text-xl font-bold">🗺️ 学习章节</h3>
            {learningGuide.chapters.map((ch, index) => {
              const status = getChapterStatus(ch, index);
              return (
                <div key={ch.id} className={`rounded-xl p-5 border ${status === 'completed' ? 'bg-green-500/10 border-green-500/30' : status === 'learning' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800/30 border-slate-700 opacity-50'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl w-8 text-center">{status === 'completed' ? '✅' : status === 'learning' ? '🔴' : '⚪'}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-lg">{ch.chapter}</h4>
                        {status === 'completed' && <span className="text-green-400 text-sm">已完成</span>}
                      </div>
                      <p className="text-cyan-400 text-sm mb-2">目标：{ch.summary}</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {ch.keyPoints.slice(0, 5).map((p, i) => <span key={i} className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">{p}</span>)}
                      </div>
                      {status !== 'locked' && (
                        <button onClick={() => startChapter(index)} className={`mt-2 px-4 py-2 rounded-lg ${status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                          {status === 'completed' ? '🔄 重新学习' : '🚀 开始学习'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {practiceQuestions.length > 0 && (
            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30 mb-6">
              <h3 className="font-bold mb-2">📝 练习题库</h3>
              <p className="text-slate-400 text-sm mb-3">共 {practiceQuestions.length} 道练习题，学完章节后可练习</p>
              <button onClick={startPractice} disabled={completedChapters.size === 0} className="px-6 py-2 bg-purple-500 rounded-xl disabled:opacity-50">📖 开始练习</button>
            </div>
          )}
          {learningGuide.studyTips && learningGuide.studyTips.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4"><h3 className="font-bold mb-2">💡 学习建议</h3><ul className="space-y-1">{learningGuide.studyTips.map((t, i) => <li key={i} className="text-slate-300 text-sm">• {t}</li>)}</ul></div>
          )}
        </div>
      </div>
    );
  }

  // Chapter Learning View
  if (view === 'learning' && step === 'learning' && !quizMode && learningGuide) {
    const ch = learningGuide.chapters[currentChapterIndex];
    const status = getChapterStatus(ch, currentChapterIndex);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setStep('learning')} className="text-slate-400 hover:text-white">← 返回学习路径</button>
            <span className="text-slate-400">{currentChapterIndex + 1} / {learningGuide.chapters.length}</span>
          </div>
          <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl p-6 border border-cyan-500/30 mb-6">
            <h2 className="text-2xl font-bold mb-2">📖 {ch.chapter}</h2>
            <p className="text-cyan-400">{ch.summary}</p>
            {ch.sections && ch.sections.length > 0 && <p className="text-slate-400 text-sm mt-1">包含：{ch.sections.join(' | ')}</p>}
          </div>
          <div className="space-y-3 mb-6">
            <h3 className="text-xl font-bold">📚 核心知识点</h3>
            {ch.keyPoints.map((kp, i) => (
              <details key={i} className="bg-slate-800/50 rounded-xl">
                <summary className="p-4 cursor-pointer list-none flex items-center justify-between">
                  <span className="font-medium">{i + 1}. {kp}</span>
                  <span className="text-slate-400">▼</span>
                </summary>
              </details>
            ))}
          </div>
          <div className="text-center">
            <button onClick={completeChapter} className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-medium">✅ 我已完成学习</button>
          </div>
        </div>
      </div>
    );
  }

  // Practice Quiz View
  if (quizMode && !showQuizResult) {
    const q = practiceQuestions[quizIndex];
    const selectedAnswer = q ? quizAnswers.get(q.id) : undefined;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => { setQuizMode(false); setStep('learning'); }} className="text-slate-400 hover:text-white">← 返回学习</button>
            <span className="text-slate-400">{quizIndex + 1} / {practiceQuestions.length}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full mb-6"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${((quizIndex + 1) / practiceQuestions.length) * 100}%` }} /></div>
          <div className="bg-slate-800/50 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-medium mb-2">{q?.chapter}</h3>
            <h2 className="text-xl font-bold mb-6">{q?.question}</h2>
            <div className="space-y-3">
              {q?.options.map((opt, i) => (
                <button key={i} onClick={() => handleQuizAnswer(i)} disabled={selectedAnswer !== undefined} className={`w-full p-4 rounded-xl text-left transition-all ${selectedAnswer === i ? (i === q.correctAnswerIndex ? 'bg-green-500/30 border border-green-500' : 'bg-red-500/30 border border-red-500') : 'bg-slate-700/50 hover:bg-slate-700'}`}>
                  <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                  {selectedAnswer !== undefined && i === q.correctAnswerIndex && <span className="float-right text-green-400">✓</span>}
                </button>
              ))}
            </div>
          </div>
          {selectedAnswer !== undefined && (
            <div className="text-center">
              <button onClick={nextQuestion} className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium">{quizIndex < practiceQuestions.length - 1 ? '下一题 →' : '查看结果'}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Quiz Result View
  if (quizMode && showQuizResult) {
    const result = getQuizResult();
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4">{result.rate >= 60 ? '🎉' : '📚'}</span>
          <h2 className="text-3xl font-bold mb-2">{result.rate >= 60 ? '练习完成！' : '继续加油！'}</h2>
          <p className="text-slate-400 mb-6">正确率：{result.correct} / {result.total} ({result.rate}%)</p>
          <div className="flex justify-center gap-4">
            <button onClick={() => { setQuizMode(false); setStep('learning'); }} className="px-8 py-3 bg-slate-700 rounded-xl">返回学习</button>
            <button onClick={startPractice} className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">🔄 重新练习</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
