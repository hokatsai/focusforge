'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

type View = 'home' | 'bookshelf' | 'learning';
type Step = 'input' | 'generating' | 'learningPath' | 'quiz' | 'complete';
type StageStatus = 'locked' | 'available' | 'in_progress' | 'completed';
type QuizAnswer = { questionId: string; selectedIndex: number | null; isCorrect: boolean };

interface Stage {
  id: string;
  stage: string;
  goal: string;
  priority: 'high' | 'medium' | 'low';
  keyPoints: string[];
  recommendations: string;
}

interface Knowledge {
  id: string;
  title: string;
  description: string;
  importance?: string;
}

interface LearningGuide {
  title: string;
  overview: string;
  stages: Stage[];
  coreKnowledge?: Knowledge[];
  studyTips?: string[];
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

interface Book {
  id: string;
  name: string;
  originalFileName: string;
  content: string;
  createdAt: string;
  lastLearnedAt?: string;
  progress: number;
  completedStages: string[];
  currentStage?: string;
  learningGuide?: LearningGuide;
}

// PDF.js types
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
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}

function cleanAndScanText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s\n]{5,}/gi, '');
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
  cleaned = cleaned.replace(/\n\s*\d+\s*\n/g, '\n\n');
  
  const lines = cleaned.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    if (/^[\d\s.。,，、;；:：]+$/.test(trimmed)) return false;
    if (trimmed.length < 10 && !/[的一是不了在和人中有]/.test(trimmed)) return false;
    return true;
  });
  cleaned = cleanedLines.join('\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  return cleaned;
}

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [step, setStep] = useState<Step>('input');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedPdfText, setExtractedPdfText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'pdf'>('text');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfScanning, setPdfScanning] = useState(false);
  const [learningGuide, setLearningGuide] = useState<LearningGuide | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedBooks = localStorage.getItem('focusforge_books');
    if (savedBooks) {
      try {
        setBooks(JSON.parse(savedBooks));
      } catch (e) {
        console.error('Failed to load books:', e);
      }
    }
  }, []);

  const saveBooks = useCallback((updatedBooks: Book[]) => {
    setBooks(updatedBooks);
    localStorage.setItem('focusforge_books', JSON.stringify(updatedBooks));
  }, []);

  const triggerConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const processPDFFile = async (file: File) => {
    setSelectedFile(file);
    setInputMode('pdf');
    setPdfExtracting(true);
    setPdfScanning(true);
    
    try {
      const text = await extractTextFromPDF(file);
      const cleanedText = cleanAndScanText(text);
      setExtractedPdfText(cleanedText);
      setInputText(cleanedText.slice(0, 250000));
    } catch (error) {
      console.error('PDF extraction failed:', error);
      alert('PDF 提取失败');
      setInputMode('text');
      setSelectedFile(null);
    } finally {
      setPdfExtracting(false);
      setPdfScanning(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

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
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        await processPDFFile(file);
      } else {
        alert('请选择 PDF 文件');
      }
    }
  };

  const generateLearningGuide = async () => {
    const textToUse = inputMode === 'pdf' ? extractedPdfText : inputText;
    if (!textToUse.trim()) return;
    
    setStep('generating');
    setErrorMessage(null);
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToUse, action: 'generateGuide' }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setLearningGuide(data.learningGuide || data);
      setStep('learningPath');
      
      // Save to bookshelf
      const bookName = currentBook?.name || selectedFile?.name.replace('.pdf', '') || '新书籍';
      if (currentBook) {
        const updatedBooks = books.map(b => 
          b.id === currentBook.id 
            ? { ...b, learningGuide: data.learningGuide || data, lastLearnedAt: new Date().toISOString() }
            : b
        );
        saveBooks(updatedBooks);
      }
    } catch (error: any) {
      console.error('Generate failed:', error);
      setErrorMessage(error.message || '生成学习指南失败');
      setStep('input');
    }
  };

  const startStageQuiz = async (stageIndex: number) => {
    if (!learningGuide?.stages) return;
    
    setCurrentStageIndex(stageIndex);
    setQuizAnswers([]);
    setQuizFeedback(null);
    
    const stage = learningGuide.stages[stageIndex];
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          action: 'generateQuiz',
          currentStage: stage.stage,
          currentKnowledge: stage.keyPoints
        }),
      });
      
      const data = await response.json();
      if (data.quizzes && data.quizzes.length > 0) {
        setQuizQuestions(data.quizzes);
        setQuizAnswers(data.quizzes.map((q: QuizQuestion) => ({ questionId: q.id, selectedIndex: null, isCorrect: false })));
      } else {
        setQuizQuestions([{
          id: 'q1',
          question: `关于 ${stage.stage} 的理解测验`,
          options: ['完全理解', '部分理解', '不太理解', '需要重新学习'],
          correctAnswerIndex: 0
        }]);
        setQuizAnswers([{ questionId: 'q1', selectedIndex: null, isCorrect: false }]);
      }
      
      setStep('quiz');
    } catch (error) {
      console.error('Quiz generation failed:', error);
    }
  };

  const handleQuizAnswer = (index: number) => {
    if (quizAnswers.every(a => a.selectedIndex !== null)) return;
    
    const currentQuiz = quizQuestions[quizAnswers.filter(a => a.selectedIndex !== null).length];
    if (!currentQuiz) return;
    
    const isCorrect = index === currentQuiz.correctAnswerIndex;
    
    setQuizAnswers(prev => {
      const updated = [...prev];
      const answerIndex = updated.findIndex(a => a.questionId === currentQuiz.id);
      if (answerIndex >= 0) {
        updated[answerIndex] = { ...updated[answerIndex], selectedIndex: index, isCorrect };
      }
      return updated;
    });
    
    if (!isCorrect) {
      setQuizFeedback(`答错了！正确答案是：${currentQuiz.options[currentQuiz.correctAnswerIndex]}`);
    }
  };

  const finishQuiz = () => {
    const allAnswered = quizAnswers.every(a => a.selectedIndex !== null);
    if (!allAnswered) {
      alert('请回答所有问题');
      return;
    }
    
    const correctCount = quizAnswers.filter(a => a.isCorrect).length;
    const passRate = correctCount / quizAnswers.length;
    
    if (passRate >= 0.6) {
      const stage = learningGuide?.stages[currentStageIndex];
      if (stage) {
        const newCompleted = new Set(completedStages);
        newCompleted.add(stage.id);
        setCompletedStages(newCompleted);
        
        // Update book progress
        if (currentBook) {
          const progress = Math.round((newCompleted.size / (learningGuide?.stages?.length || 1)) * 100);
          const updatedBooks = books.map(b => 
            b.id === currentBook.id 
              ? { ...b, completedStages: Array.from(newCompleted), progress, currentStage: stage.id }
              : b
          );
          saveBooks(updatedBooks);
          setCurrentBook(updatedBooks.find(b => b.id === currentBook.id) || null);
        }
      }
      
      triggerConfetti();
      setStep('complete');
    } else {
      setQuizFeedback(`正确率 ${Math.round(passRate * 100)}%，未达到 60%，请重新学习后再试`);
    }
  };

  const resetLearning = () => {
    setStep('learningPath');
    setQuizQuestions([]);
    setQuizAnswers([]);
    setQuizFeedback(null);
  };

  const getStageStatus = (stageId: string, index: number): StageStatus => {
    if (completedStages.has(stageId)) return 'completed';
    if (index === 0 || (index > 0 && completedStages.has(learningGuide?.stages?.[index-1]?.id || ''))) return 'available';
    return 'locked';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // Home View
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">⚡ FocusForge</h1>
            <p className="text-slate-400 text-lg">AI 驱动的分阶段学习引擎</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
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
      </div>
    );
  }

  // Bookshelf View
  if (view === 'bookshelf') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <button onClick={() => setView('home')} className="text-slate-400 hover:text-white mb-2 flex items-center gap-2">← 返回</button>
              <h1 className="text-3xl font-bold">📖 我的书架</h1>
            </div>
            <button onClick={() => setView('learning')} className="px-6 py-3 bg-cyan-500 rounded-xl font-medium hover:bg-cyan-600 transition-all">+ 添加新书</button>
          </div>
          
          {books.length === 0 ? (
            <div className="bg-slate-800/50 rounded-2xl p-12 text-center">
              <span className="text-6xl mb-4 block">📚</span>
              <h2 className="text-xl font-bold mb-2">书架是空的</h2>
              <p className="text-slate-400 mb-6">添加你的第一本书开始学习</p>
              <button onClick={() => setView('learning')} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium">开始学习</button>
            </div>
          ) : (
            <div className="grid gap-4">
              {books.map((book) => (
                <div key={book.id} className="bg-slate-800/50 rounded-xl p-4 flex items-center gap-4 hover:bg-slate-800/70 transition-all">
                  <div className="text-3xl">📕</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">{book.name}</h3>
                    <p className="text-slate-400 text-sm">{formatDate(book.createdAt)}</p>
                    <div className="mt-2">
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${book.progress}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{book.progress}% 完成</p>
                    </div>
                  </div>
                  <button onClick={() => { setCurrentBook(book); setLearningGuide(book.learningGuide || null); setCompletedStages(new Set(book.completedStages || [])); setView('learning'); setStep(book.learningGuide ? 'learningPath' : 'input'); }} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all">继续</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Learning View - Input Step
  if (view === 'learning' && step === 'input') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setView('home')} className="text-slate-400 hover:text-white flex items-center gap-2">← 返回</button>
            <button onClick={() => setView('bookshelf')} className="text-slate-400 hover:text-white flex items-center gap-2">📖 书架</button>
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-4 mb-6">
              <button onClick={() => { setInputMode('text'); setSelectedFile(null); setExtractedPdfText(''); }} className={`px-6 py-2 rounded-lg font-medium transition-all ${inputMode === 'text' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>📝 文本输入</button>
              <button onClick={() => setInputMode('pdf')} className={`px-6 py-2 rounded-lg font-medium transition-all ${inputMode === 'pdf' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>📄 PDF 上传</button>
            </div>

            {inputMode === 'text' ? (
              <>
                <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="输入学习内容..." className="w-full h-48 p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-slate-500">{inputText.length.toLocaleString()} 字</span>
                  <button onClick={generateLearningGuide} disabled={!inputText.trim()} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">🚀 生成学习路径</button>
                </div>
              </>
            ) : (
              <>
                <div onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? 'border-cyan-500 bg-cyan-500/20 scale-105' : selectedFile ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                  <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileSelect} className="hidden" id="pdf-upload" />
                  <label htmlFor="pdf-upload" className="cursor-pointer">
                    {pdfScanning ? (<div><span className="text-4xl mb-2 block animate-pulse">🔍</span><p className="text-cyan-400 font-medium">正在扫描清洗内容...</p></div>) : pdfExtracting ? (<div><span className="text-4xl mb-2 block animate-pulse">⚡</span><p className="text-cyan-400 font-medium">正在提取 PDF 内容...</p></div>) : selectedFile ? (<div><span className="text-4xl mb-2 block">✅</span><p className="text-cyan-400 font-medium">{selectedFile.name}</p><p className="text-slate-400 text-sm mt-1">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p></div>) : (<div><span className="text-4xl mb-2 block">{isDragging ? '📥' : '📎'}</span><p className="text-slate-300">{isDragging ? '松开以上传文件' : '点击选择或拖拽 PDF 文件'}</p></div>)}
                  </label>
                </div>
                
                {extractedPdfText && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-400">📖 PDF 内容预览</label>
                      <button onClick={() => { setEditableText(extractedPdfText); setShowEditModal(true); }} className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30">✏️ 编辑</button>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl text-sm text-slate-400 max-h-32 overflow-y-auto">{extractedPdfText.slice(0, 1500)}...</div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-6">
                  <span className="text-sm text-slate-500">{selectedFile ? `PDF 已加载（${extractedPdfText.length.toLocaleString()} 字）` : '请上传 PDF 文件'}</span>
                  <button onClick={generateLearningGuide} disabled={!extractedPdfText || pdfExtracting || pdfScanning} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">🚀 生成学习路径</button>
                </div>
              </>
            )}

            {errorMessage && (
              <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl">
                <p className="text-red-400 text-center">{errorMessage}</p>
              </div>
            )}
          </div>
        </div>

        {showEditModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">✏️ 编辑内容</h2>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white text-2xl">×</button>
              </div>
              <textarea value={editableText} onChange={(e) => setEditableText(e.target.value)} className="flex-1 w-full p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              <div className="flex justify-between items-center mt-4">
                <span className="text-sm text-slate-500">{editableText.length.toLocaleString()} 字</span>
                <div className="flex gap-3">
                  <button onClick={() => setShowEditModal(false)} className="px-6 py-2 bg-slate-700 rounded-xl hover:bg-slate-600">取消</button>
                  <button onClick={() => { setExtractedPdfText(editableText); setInputText(editableText); setShowEditModal(false); }} className="px-6 py-2 bg-cyan-500 rounded-xl hover:bg-cyan-600">保存</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generating Step
  if (step === 'generating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setView('home')} className="text-slate-400 hover:text-white flex items-center gap-2">← 返回</button>
            <button onClick={() => setView('bookshelf')} className="text-slate-400 hover:text-white flex items-center gap-2">📖 书架</button>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-12 text-center">
            <div className="text-6xl mb-4 animate-pulse">⚡</div>
            <h2 className="text-2xl font-bold mb-2">AI 正在分析学习内容...</h2>
            <p className="text-slate-400">生成个性化的学习路径</p>
            <div className="mt-6 flex justify-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Learning Path View
  if (step === 'learningPath' && learningGuide) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setStep('input')} className="text-slate-400 hover:text-white flex items-center gap-2">← 重新开始</button>
            <button onClick={() => setView('bookshelf')} className="text-slate-400 hover:text-white flex items-center gap-2">📖 书架</button>
          </div>

          {/* Learning Guide Header */}
          <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl p-6 border border-cyan-500/30 mb-6">
            <h2 className="text-2xl font-bold mb-2">📚 {learningGuide.title}</h2>
            <p className="text-slate-300">{learningGuide.overview}</p>
          </div>

          {/* Progress Overview */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">学习进度</span>
              <span className="text-cyan-400 font-bold">{completedStages.size} / {learningGuide.stages?.length || 0} 阶段完成</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${(completedStages.size / (learningGuide.stages?.length || 1)) * 100}%` }} />
            </div>
          </div>

          {/* Learning Stages */}
          <div className="space-y-4 mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">🗺️ 学习路径</h3>
            {learningGuide.stages?.map((stage, index) => {
              const status = getStageStatus(stage.id, index);
              return (
                <div key={stage.id} className={`rounded-xl p-5 border ${status === 'completed' ? 'bg-green-500/10 border-green-500/30' : status === 'available' ? 'bg-slate-800/50 border-slate-700' : status === 'in_progress' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-slate-800/30 border-slate-700 opacity-50'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`text-2xl w-8 text-center ${status === 'completed' ? '✅' : status === 'available' ? '🔴' : status === 'in_progress' ? '🟡' : '⚪'}`}>{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-lg">{stage.stage}</h4>
                        {status === 'completed' && <span className="text-green-400 text-sm">✅ 已完成</span>}
                      </div>
                      <p className="text-cyan-400 text-sm mb-2">目标：{stage.goal}</p>
                      {stage.keyPoints?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {stage.keyPoints.map((point, i) => <span key={i} className="px-2 py-1 bg-slate-700/50 rounded text-sm text-slate-300">{point}</span>)}
                        </div>
                      )}
                      {status !== 'locked' && (
                        <button onClick={() => startStageQuiz(index)} className={`mt-2 px-4 py-2 rounded-lg font-medium transition-all ${status === 'completed' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'}`}>
                          {status === 'completed' ? '🔄 重新学习' : '🚀 开始学习'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Core Knowledge Summary */}
          {learningGuide.coreKnowledge?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-4">📖 核心知识点</h3>
              <div className="grid gap-3">
                {learningGuide.coreKnowledge.map((k) => (
                  <details key={k.id} className="bg-slate-800/50 rounded-xl group">
                    <summary className="p-4 cursor-pointer list-none flex items-center justify-between">
                      <span className="font-medium flex items-center gap-2">
                        {k.title}
                        {k.importance && <span className={`text-xs px-2 py-0.5 rounded ${k.importance === '必会' ? 'bg-red-500/30 text-red-400' : 'bg-slate-600/50 text-slate-400'}`}>{k.importance}</span>}
                      </span>
                      <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="px-4 pb-4 text-slate-300 border-t border-slate-700 pt-2">{k.description}</div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {learningGuide.studyTips?.length > 0 && (
            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30">
              <h3 className="font-bold mb-2">💡 学习建议</h3>
              <ul className="space-y-1">
                {learningGuide.studyTips.map((tip, i) => <li key={i} className="text-slate-300 text-sm">• {tip}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Quiz View
  if (step === 'quiz' && learningGuide) {
    const currentStage = learningGuide.stages[currentStageIndex];
    const answeredCount = quizAnswers.filter(a => a.selectedIndex !== null).length;
    const currentQuestion = quizQuestions[answeredCount];
    const currentAnswer = quizAnswers[answeredCount];
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={resetLearning} className="text-slate-400 hover:text-white flex items-center gap-2">← 返回学习路径</button>
            <span className="text-slate-400">{currentStage?.stage}</span>
          </div>

          {/* Stage Info */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-lg mb-2">{currentStage?.stage}</h3>
            <p className="text-cyan-400 text-sm">目标：{currentStage?.goal}</p>
            {currentStage?.keyPoints?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {currentStage.keyPoints.map((point, i) => <span key={i} className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">{point}</span>)}
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📝 阶段测验</h2>
            <span className="text-slate-400">{answeredCount} / {quizQuestions.length}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${(answeredCount / quizQuestions.length) * 100}%` }} />
          </div>

          {/* Question */}
          {currentQuestion && (
            <div className="bg-slate-800/50 rounded-2xl p-6 mb-6">
              <h3 className="text-lg font-medium mb-6">{currentQuestion.question}</h3>
              <div className="grid gap-3">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = currentAnswer?.selectedIndex === index;
                  const isCorrect = index === currentQuestion.correctAnswerIndex;
                  const showResult = currentAnswer?.selectedIndex !== null;
                  
                  let bgClass = 'bg-slate-700/50 hover:bg-slate-700';
                  if (showResult) {
                    if (isCorrect) bgClass = 'bg-green-500/30 border border-green-500';
                    else if (isSelected) bgClass = 'bg-red-500/30 border border-red-500';
                  }
                  
                  return (
                    <button key={index} onClick={() => handleQuizAnswer(index)} disabled={currentAnswer?.selectedIndex !== null} className={`p-4 rounded-xl text-left transition-all ${bgClass} ${currentAnswer?.selectedIndex === null ? 'cursor-pointer' : 'cursor-default'}`}>
                      <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                      {option}
                      {showResult && isCorrect && <span className="float-right text-green-400">✓</span>}
                      {showResult && isSelected && !isCorrect && <span className="float-right text-red-400">✗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedback */}
          {quizFeedback && (
            <div className={`p-4 rounded-xl mb-6 ${quizFeedback.includes('答错了') || quizFeedback.includes('未达到') ? 'bg-red-500/20 border border-red-500/30' : 'bg-green-500/20 border border-green-500/30'}`}>
              <p className="text-center">{quizFeedback}</p>
            </div>
          )}

          {/* Finish Button */}
          {answeredCount === quizQuestions.length && (
            <div className="text-center">
              <button onClick={finishQuiz} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all">
                {quizFeedback?.includes('未达到') ? '🔄 重新测验' : '✅ 完成测验'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Complete Step
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold mb-4">阶段完成！</h2>
          <p className="text-slate-400 mb-8">你已经完成了「{learningGuide?.stages?.[currentStageIndex]?.stage}」的学习！</p>
          <div className="flex justify-center gap-4">
            <button onClick={resetLearning} className="px-8 py-3 bg-purple-500 rounded-xl font-medium hover:bg-purple-600 transition-all">📖 返回学习路径</button>
            <button onClick={() => { const nextIndex = currentStageIndex + 1; if (nextIndex < (learningGuide?.stages?.length || 0)) { startStageQuiz(nextIndex); } else { resetLearning(); } }} className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all">
              {currentStageIndex + 1 < (learningGuide?.stages?.length || 0) ? '➡️ 下一阶段' : '🏁 完成全部'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
