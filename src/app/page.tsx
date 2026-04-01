'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

type Mode = 'study' | 'exam';
type Step = 'input' | 'loading' | 'concepts' | 'quiz' | 'feedback' | 'complete';
type View = 'home' | 'bookshelf' | 'learning';

interface Concept {
  title: string;
  description: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

interface LearningData {
  concepts: Concept[];
  quizzes: QuizQuestion[];
}

interface Book {
  id: string;
  name: string;
  originalFileName: string;
  content: string;
  createdAt: string;
  lastLearnedAt?: string;
  progress: number; // 0-100 percentage
  completedQuizzes: string[]; // IDs of completed quiz questions
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
  const pageTexts: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Get page dimensions for header/footer detection
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;
    
    // Sort items by position (top to bottom, left to right)
    const items = textContent.items as any[];
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]; // Y position (bottom to top)
      if (Math.abs(yDiff) > 5) return yDiff; // Different line
      return a.transform[4] - b.transform[4]; // Same line, left to right
    });
    
    let pageText = '';
    let lastY = 0;
    
    for (const item of items) {
      const y = item.transform[5];
      const x = item.transform[4];
      const text = item.str;
      
      // Skip headers (top of page) and footers (bottom of page)
      // Assuming header/footer is within 5% of page edge
      const isHeader = y > pageHeight * 0.95;
      const isFooter = y < pageHeight * 0.05;
      const isMargin = x < pageWidth * 0.05 || x > pageWidth * 0.95;
      
      if (isHeader || isFooter) continue;
      
      // Add line break if this is a new line (Y position changed significantly)
      if (Math.abs(y - lastY) > 5) {
        if (lastY !== 0) pageText += '\n';
      }
      
      pageText += text + ' ';
      lastY = y;
    }
    
    pageTexts.push(pageText.trim());
  }
  
  // Join pages with double newline to separate them
  return pageTexts.filter(t => t.length > 0).join('\n\n');
}

// Text scanning and cleaning function
function cleanAndScanText(text: string): { cleaned: string; removedCount: number } {
  let cleaned = text;
  let removedCount = 0;
  const originalLength = text.length;
  
  // 1. Basic cleanup - normalize whitespace but preserve structure
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\t/g, ' ');
  
  // Remove control characters but keep CJK
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // 2. Remove noise patterns that are definitely not content
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s\n]{5,}/gi, '');
  
  // Remove email addresses
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
  
  // Remove page numbers (standalone numbers at start/end of lines)
  cleaned = cleaned.replace(/\n\s*\d+\s*\n/g, '\n\n');
  cleaned = cleaned.replace(/\n\s*第\s*\d+\s*页\s*\n/gi, '\n\n');
  cleaned = cleaned.replace(/\n\s*Page\s*\d+\s*/gi, '\n\n');
  
  // 3. Remove very short lines that are likely page markers
  const lines = cleaned.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    // Skip completely empty lines
    if (trimmed.length === 0) return true;
    // Skip lines that are just numbers or symbols
    if (/^[\d\s.。,，、;；:：]+$/.test(trimmed)) return false;
    // Skip very short lines unless they look like actual content
    if (trimmed.length < 10 && !/[的一是不了在和人中有]/.test(trimmed)) return false;
    return true;
  });
  cleaned = cleanedLines.join('\n');
  
  // 4. Normalize excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.trim();
  
  removedCount = originalLength - cleaned.length;
  
  return { cleaned, removedCount };
}

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<Mode>('study');
  const [step, setStep] = useState<Step>('input');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedPdfText, setExtractedPdfText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'pdf'>('text');
  const [learningData, setLearningData] = useState<LearningData | null>(null);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfScanning, setPdfScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editableText, setEditableText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load books from localStorage on mount
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

  // Save books to localStorage
  const saveBooks = useCallback((updatedBooks: Book[]) => {
    setBooks(updatedBooks);
    localStorage.setItem('focusforge_books', JSON.stringify(updatedBooks));
  }, []);

  // Pomodoro timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPomodoroRunning && pomodoroTime > 0) {
      interval = setInterval(() => {
        setPomodoroTime((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPomodoroRunning, pomodoroTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processPDFFile = async (file: File) => {
    setSelectedFile(file);
    setInputMode('pdf');
    setPdfExtracting(true);
    setPdfScanning(true);
    
    try {
      const text = await extractTextFromPDF(file);
      const { cleaned: cleanedText, removedCount } = cleanAndScanText(text);
      
      console.log(`PDF scanning: ${removedCount.toLocaleString()} removed, ${cleanedText.length.toLocaleString()} remaining`);
      
      setExtractedPdfText(cleanedText);
      if (cleanedText.length > 0) {
        setInputText(cleanedText.slice(0, 250000));
      }
    } catch (error) {
      console.error('PDF extraction failed:', error);
      alert('PDF 提取失败，请尝试使用文本输入模式');
      setInputMode('text');
      setSelectedFile(null);
    } finally {
      setPdfExtracting(false);
      setPdfScanning(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
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
    if (!file) return;
    
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    
    if (isPdf) {
      await processPDFFile(file);
    } else {
      alert('请选择 PDF 文件');
    }
  };

  const saveToBookshelf = (name: string) => {
    const content = inputMode === 'pdf' ? (extractedPdfText || inputText) : inputText;
    
    const newBook: Book = {
      id: Date.now().toString(),
      name: name || (selectedFile?.name.replace('.pdf', '') || '未命名书籍'),
      originalFileName: selectedFile?.name || '文本输入',
      content,
      createdAt: new Date().toISOString(),
      progress: 0,
      completedQuizzes: [],
    };
    
    const updatedBooks = [newBook, ...books];
    saveBooks(updatedBooks);
    setCurrentBook(newBook);
    
    return newBook;
  };

  const loadBook = (book: Book) => {
    setCurrentBook(book);
    setInputText(book.content);
    setExtractedPdfText(book.content);
    setInputMode('text');
    setStep('input');
    setView('learning');
  };

  const deleteBook = (bookId: string) => {
    const updatedBooks = books.filter(b => b.id !== bookId);
    saveBooks(updatedBooks);
  };

  const handleGenerate = async () => {
    const textToUse = inputMode === 'pdf' ? (extractedPdfText || inputText) : inputText;
    if (!textToUse.trim()) return;
    
    setStep('loading');
    setIsPomodoroRunning(true);
    setErrorMessage(null);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToUse, mode }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Generation failed');
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setLearningData(data);
      setStep('concepts');
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setFeedback(null);
    } catch (error: any) {
      console.error('Generation failed:', error);
      if (error.name === 'AbortError') {
        setErrorMessage('请求超时，请检查网络连接后重试');
      } else {
        setErrorMessage(error.message || '生成失败，请重试');
      }
      setStep('input');
    }
  };

  const handleAnswerSelect = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    
    const currentQuiz = learningData?.quizzes[currentQuizIndex];
    if (currentQuiz && index !== currentQuiz.correctAnswerIndex) {
      fetchFeedback(currentQuiz.question, currentQuiz.options[index]);
    } else if (currentQuiz) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 500);
    }
    
    // Mark quiz as completed
    if (currentBook && currentQuiz) {
      const updatedBooks = books.map(b => {
        if (b.id === currentBook.id) {
          const completedQuizzes = [...new Set([...b.completedQuizzes, currentQuiz.id])];
          const progress = Math.round((completedQuizzes.length / (learningData?.quizzes.length || 1)) * 100);
          return { ...b, completedQuizzes, progress, lastLearnedAt: new Date().toISOString() };
        }
        return b;
      });
      saveBooks(updatedBooks);
      setCurrentBook(updatedBooks.find(b => b.id === currentBook.id) || null);
    }
  };

  const fetchFeedback = async (question: string, wrongOption: string) => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, wrongOption }),
      });
      const data = await response.json();
      setFeedback(data.feedback);
    } catch (error) {
      console.error('Feedback fetch failed:', error);
    }
  };

  const handleNextQuiz = () => {
    if (!learningData) return;
    
    if (currentQuizIndex < learningData.quizzes.length - 1) {
      setCurrentQuizIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setFeedback(null);
    } else {
      setStep('complete');
      triggerConfetti();
      setIsPomodoroRunning(false);
    }
  };

  const resetAll = () => {
    setStep('input');
    setInputText('');
    setSelectedFile(null);
    setExtractedPdfText('');
    setLearningData(null);
    setCurrentQuizIndex(0);
    setSelectedAnswer(null);
    setFeedback(null);
    setPomodoroTime(25 * 60);
    setIsPomodoroRunning(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Home View - Main landing page
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              ⚡ FocusForge
            </h1>
            <p className="text-slate-400 text-lg">AI 驱动的专注学习引擎</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Start Learning Card */}
            <button
              onClick={() => setView('learning')}
              className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700 hover:border-cyan-500/50"
            >
              <span className="text-4xl mb-4 block">📚</span>
              <h2 className="text-2xl font-bold mb-2">开始学习</h2>
              <p className="text-slate-400">上传 PDF 或输入文本开始学习</p>
            </button>
            
            {/* Bookshelf Card */}
            <button
              onClick={() => setView('bookshelf')}
              className="bg-slate-800/50 rounded-2xl p-8 text-left hover:bg-slate-800/70 transition-all border border-slate-700 hover:border-purple-500/50"
            >
              <span className="text-4xl mb-4 block">📖</span>
              <h2 className="text-2xl font-bold mb-2">我的书架</h2>
              <p className="text-slate-400">
                {books.length > 0 ? `${books.length} 本书籍` : '书架是空的'}
              </p>
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
              <button
                onClick={() => setView('home')}
                className="text-slate-400 hover:text-white mb-2 flex items-center gap-2"
              >
                ← 返回
              </button>
              <h1 className="text-3xl font-bold">📖 我的书架</h1>
            </div>
            <button
              onClick={() => setView('learning')}
              className="px-6 py-3 bg-cyan-500 rounded-xl font-medium hover:bg-cyan-600 transition-all"
            >
              + 添加新书
            </button>
          </div>
          
          {books.length === 0 ? (
            <div className="bg-slate-800/50 rounded-2xl p-12 text-center">
              <span className="text-6xl mb-4 block">📚</span>
              <h2 className="text-xl font-bold mb-2">书架是空的</h2>
              <p className="text-slate-400 mb-6">添加你的第一本书开始学习</p>
              <button
                onClick={() => setView('learning')}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium"
              >
                开始学习
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="bg-slate-800/50 rounded-xl p-4 flex items-center gap-4 hover:bg-slate-800/70 transition-all"
                >
                  <div className="text-3xl">📕</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">{book.name}</h3>
                    <p className="text-slate-400 text-sm">
                      {formatDate(book.createdAt)}
                      {book.lastLearnedAt && ` · 最后学习: ${formatDate(book.lastLearnedAt)}`}
                    </p>
                    <div className="mt-2">
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                          style={{ width: `${book.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{book.progress}% 完成</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadBook(book)}
                      className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all"
                    >
                      继续
                    </button>
                    <button
                      onClick={() => deleteBook(book.id)}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Learning View
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView('home')}
            className="text-slate-400 hover:text-white flex items-center gap-2"
          >
            ← 返回
          </button>
          {currentBook && (
            <div className="text-center">
              <h1 className="text-xl font-bold truncate max-w-xs">{currentBook.name}</h1>
              <p className="text-slate-400 text-sm">学习进度: {currentBook.progress}%</p>
            </div>
          )}
          <button
            onClick={() => setView('bookshelf')}
            className="text-slate-400 hover:text-white flex items-center gap-2"
          >
            📖 书架
          </button>
        </div>
      </div>

      {/* Mode Switch */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-center gap-4 bg-slate-800/50 rounded-xl p-2 backdrop-blur-sm">
          <button
            onClick={() => setMode('study')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              mode === 'study'
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📚 学习模式
          </button>
          <button
            onClick={() => setMode('exam')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              mode === 'exam'
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🎯 考试模式
          </button>
        </div>
      </div>

      {/* Pomodoro Timer */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-center gap-4 bg-slate-800/50 rounded-xl p-4 backdrop-blur-sm">
          <span className="text-3xl font-mono font-bold">
            {formatTime(pomodoroTime)}
          </span>
          <button
            onClick={() => setIsPomodoroRunning(!isPomodoroRunning)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              isPomodoroRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isPomodoroRunning ? '⏸ 暂停' : '▶ 开始'}
          </button>
          <button
            onClick={() => setPomodoroTime(25 * 60)}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all"
          >
            🔄 重置
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto">
        {/* Input Step */}
        {step === 'input' && (
          <div className="bg-slate-800/50 rounded-2xl p-6 backdrop-blur-sm">
            {/* Input Mode Toggle */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => { setInputMode('text'); setSelectedFile(null); setExtractedPdfText(''); }}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  inputMode === 'text'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                📝 文本输入
              </button>
              <button
                onClick={() => setInputMode('pdf')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  inputMode === 'pdf'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                📄 PDF 上传
              </button>
            </div>

            {/* Text Input Mode */}
            {inputMode === 'text' && (
              <>
                <label className="block text-lg font-medium mb-4 text-slate-200">
                  📝 输入你想学习的内容
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="例如：学习 React Hooks 的使用..."
                  className="w-full h-48 p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-slate-500">
                    {inputText.length.toLocaleString()} 字
                  </span>
                  <button
                    onClick={handleGenerate}
                    disabled={!inputText.trim()}
                    className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    🚀 开始学习
                  </button>
                </div>
              </>
            )}

            {/* PDF Upload Mode */}
            {inputMode === 'pdf' && (
              <>
                <label className="block text-lg font-medium mb-4 text-slate-200">
                  📄 上传学习资料 PDF 文件
                </label>
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? 'border-cyan-500 bg-cyan-500/20 scale-105'
                      : selectedFile
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-slate-600 hover:border-slate-500'
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
                        <span className="text-4xl mb-2 block animate-pulse">🔍</span>
                        <p className="text-cyan-400 font-medium">正在扫描清洗内容...</p>
                        <p className="text-slate-400 text-sm mt-1">去除无意义符号和无关内容</p>
                      </div>
                    ) : pdfExtracting ? (
                      <div>
                        <span className="text-4xl mb-2 block animate-pulse">⚡</span>
                        <p className="text-cyan-400 font-medium">正在提取 PDF 内容...</p>
                      </div>
                    ) : selectedFile ? (
                      <div>
                        <span className="text-4xl mb-2 block">✅</span>
                        <p className="text-cyan-400 font-medium">{selectedFile.name}</p>
                        <p className="text-slate-400 text-sm mt-1">
                          ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                        <p className="text-slate-500 text-sm mt-2">点击更换文件</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-4xl mb-2 block">{isDragging ? '📥' : '📎'}</span>
                        <p className="text-slate-300">{isDragging ? '松开以上传文件' : '点击选择或拖拽 PDF 文件到这里'}</p>
                        <p className="text-slate-500 text-sm mt-1">支持任何 PDF 格式的学习资料</p>
                      </div>
                    )}
                  </label>
                </div>
                
                {/* Extracted text preview */}
                {extractedPdfText && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-400">
                        📖 PDF 内容预览（已自动提取并清洗）
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditableText(extractedPdfText);
                            setShowEditModal(true);
                          }}
                          className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all"
                        >
                          ✏️ 编辑内容
                        </button>
                        <span className="text-xs text-slate-500">
                          {extractedPdfText.length.toLocaleString()} 字
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl text-sm text-slate-400 max-h-32 overflow-y-auto">
                      {extractedPdfText.slice(0, 1500)}
                      {extractedPdfText.length > 1500 && '...'}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-6">
                  <span className="text-sm text-slate-500">
                    {selectedFile 
                      ? `PDF 已加载 ${extractedPdfText ? `（${extractedPdfText.length.toLocaleString()} 字）` : '（提取中...）'}`
                      : '请上传 PDF 文件'}
                  </span>
                  <button
                    onClick={handleGenerate}
                    disabled={!extractedPdfText || pdfExtracting || pdfScanning}
                    className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    🚀 开始学习
                  </button>
                </div>
              </>
            )}

            {/* Error Message Display */}
            {errorMessage && (
              <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl">
                <p className="text-red-400 text-center">{errorMessage}</p>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="mt-2 w-full text-sm text-slate-400 hover:text-white transition-colors"
                >
                  关闭
                </button>
              </div>
            )}

            {/* Save to Bookshelf */}
            {(inputText.length > 100 || selectedFile) && (
              <div className="mt-6 pt-6 border-t border-slate-700">
                <button
                  onClick={() => {
                    const name = prompt('给这本书起个名字：', currentBook?.name || selectedFile?.name.replace('.pdf', '') || '');
                    if (name) {
                      if (currentBook) {
                        // Update existing book
                        const updatedBooks = books.map(b => 
                          b.id === currentBook.id 
                            ? { ...b, name, content: inputText, lastLearnedAt: new Date().toISOString() }
                            : b
                        );
                        saveBooks(updatedBooks);
                        setCurrentBook(updatedBooks.find(b => b.id === currentBook.id) || null);
                        alert('已保存到书架！');
                      } else {
                        const book = saveToBookshelf(name);
                        alert('已保存到书架！');
                      }
                    }
                  }}
                  className="w-full px-6 py-3 bg-purple-500/20 text-purple-400 rounded-xl hover:bg-purple-500/30 transition-all border border-purple-500/30"
                >
                  📖 保存到书架
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading Step */}
        {step === 'loading' && (
          <div className="bg-slate-800/50 rounded-2xl p-12 text-center backdrop-blur-sm">
            <div className="text-6xl mb-4 animate-pulse">⚡</div>
            <h2 className="text-2xl font-bold mb-2">正在解析学习内容...</h2>
            <p className="text-slate-400">AI 正在分析知识并创建学习内容</p>
            <div className="mt-6 flex justify-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}

        {/* Concepts Step */}
        {step === 'concepts' && learningData && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-center mb-6">📖 概念拆解</h2>
            <div className="grid gap-4">
              {learningData.concepts.map((concept, index) => (
                <details key={index} className="bg-slate-800/50 rounded-xl backdrop-blur-sm group">
                  <summary className="p-4 cursor-pointer list-none flex items-center justify-between">
                    <span className="font-medium text-lg">
                      <span className="text-cyan-400 mr-2">{index + 1}.</span>
                      {concept.title}
                    </span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-4 pb-4 text-slate-300 border-t border-slate-700 pt-2">
                    {concept.description}
                  </div>
                </details>
              ))}
            </div>
            <div className="text-center mt-8">
              <button
                onClick={() => setStep('quiz')}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-all"
              >
                开始测验 →
              </button>
            </div>
          </div>
        )}

        {/* Quiz Step */}
        {step === 'quiz' && learningData && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">📝 测验</h2>
              <span className="text-slate-400">
                {currentQuizIndex + 1} / {learningData.quizzes.length}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${((currentQuizIndex + 1) / learningData.quizzes.length) * 100}%` }}
              />
            </div>

            {learningData.quizzes[currentQuizIndex] && (
              <div className="bg-slate-800/50 rounded-2xl p-6 backdrop-blur-sm">
                <h3 className="text-lg font-medium mb-6">
                  {learningData.quizzes[currentQuizIndex].question}
                </h3>
                <div className="grid gap-3">
                  {learningData.quizzes[currentQuizIndex].options.map((option, index) => {
                    const isCorrect = index === learningData.quizzes[currentQuizIndex].correctAnswerIndex;
                    const isSelected = selectedAnswer === index;
                    const isCompleted = currentBook?.completedQuizzes.includes(learningData.quizzes[currentQuizIndex].id);
                    
                    let bgClass = 'bg-slate-700/50 hover:bg-slate-700';
                    if (selectedAnswer !== null) {
                      if (isCorrect) {
                        bgClass = 'bg-green-500/30 border border-green-500';
                      } else if (isSelected) {
                        bgClass = 'bg-red-500/30 border border-red-500';
                      }
                    } else if (isCompleted) {
                      bgClass = 'bg-purple-500/30 border border-purple-500';
                    }
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(index)}
                        disabled={selectedAnswer !== null}
                        className={`p-4 rounded-xl text-left transition-all ${bgClass} ${
                          selectedAnswer === null ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <span className="font-medium mr-2">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        {option}
                        {selectedAnswer !== null && isCorrect && (
                          <span className="float-right text-green-400">✓</span>
                        )}
                        {selectedAnswer !== null && isSelected && !isCorrect && (
                          <span className="float-right text-red-400">✗</span>
                        )}
                        {selectedAnswer === null && isCompleted && (
                          <span className="float-right text-purple-400">✓ 已完成</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {feedback && (
                  <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <h4 className="font-medium text-blue-400 mb-2">💡 反馈</h4>
                    <p className="text-slate-300">{feedback}</p>
                  </div>
                )}

                {selectedAnswer !== null && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleNextQuiz}
                      className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                    >
                      {currentQuizIndex < learningData.quizzes.length - 1 ? '下一题 →' : '完成 ✓'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="bg-slate-800/50 rounded-2xl p-12 text-center backdrop-blur-sm">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold mb-4">学习完成！</h2>
            <p className="text-slate-400 mb-8">
              你已经完成了本次学习任务，继续保持！
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  resetAll();
                  setView('bookshelf');
                }}
                className="px-8 py-3 bg-purple-500 rounded-xl font-medium hover:bg-purple-600 transition-all"
              >
                📖 前往书架
              </button>
              <button
                onClick={resetAll}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
              >
                🔄 开始新学习
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confetti overlay */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none" />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">✏️ 编辑 PDF 内容</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              如果 PDF 提取的内容不准确，可以在这里手动删除不需要的部分，保留核心知识内容
            </p>
            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="flex-1 w-full p-4 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              placeholder="编辑内容..."
            />
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-slate-500">
                {editableText.length.toLocaleString()} 字
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-2 bg-slate-700 rounded-xl hover:bg-slate-600 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setExtractedPdfText(editableText);
                    setInputText(editableText);
                    setShowEditModal(false);
                  }}
                  className="px-6 py-2 bg-cyan-500 rounded-xl hover:bg-cyan-600 transition-all"
                >
                  保存并继续
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
