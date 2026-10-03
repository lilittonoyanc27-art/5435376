import React, { useState, useEffect, useMemo } from 'react';
import {
  Volume2,
  VolumeX,
  Languages,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Users,
  PhoneCall,
  Sparkles,
  RotateCcw,
  BookOpen,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Award,
  Play,
  Share2,
  Eye,
  EyeOff
} from 'lucide-react';
import { ALL_QUESTIONS, PRIZE_LADDER } from './questions';
import { QuestionData, OptionItem, GameMode, LifelinesState, FriendAdvice, AudienceStats } from './types';
import { sound } from './sound';
import { speakSpanish } from './speech';

export default function App() {
  // --- Game Settings & Filter States ---
  const [gameMode, setGameMode] = useState<GameMode>('ladder'); // 'ladder' (15 levels to 1M€), 'marathon' (50 questions), 'category'
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTense, setSelectedTense] = useState<string>('all'); // 'all', 'Presente', 'Pretérito Perfecto'

  // --- Translation Display Settings ---
  // When false: translations are hidden until clicked!
  const [alwaysShowTranslations, setAlwaysShowTranslations] = useState<boolean>(false);
  const [revealedQuestionTranslation, setRevealedQuestionTranslation] = useState<boolean>(false);
  const [revealedOptions, setRevealedOptions] = useState<Record<string, boolean>>({});

  // --- Audio State ---
  const [isMuted, setIsMuted] = useState<boolean>(sound.isMuted);

  // --- Active Game Loop States ---
  const [gameState, setGameState] = useState<'intro' | 'playing' | 'answered' | 'completed'>('intro');
  const [activeQuestions, setActiveQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOptionId, setSelectedOptionId] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]); // 50:50 removed
  const [lifelines, setLifelines] = useState<LifelinesState>({
    fiftyFiftyUsed: false,
    phoneFriendUsed: false,
    askAudienceUsed: false,
  });

  // --- Active Modal Helpers (Lifeline results) ---
  const [friendModalData, setFriendModalData] = useState<FriendAdvice | null>(null);
  const [audienceModalData, setAudienceModalData] = useState<AudienceStats | null>(null);
  const [showLadderDrawer, setShowLadderDrawer] = useState<boolean>(false);
  const [showGrammarInfo, setShowGrammarInfo] = useState<boolean>(false);

  // --- Scoring & History ---
  const [historyAnswers, setHistoryAnswers] = useState<
    { questionId: number; chosen: 'A' | 'B' | 'C' | 'D'; isCorrect: boolean }[]
  >([]);
  const [currentBank, setCurrentBank] = useState<number>(0);
  const [safeHavenBank, setSafeHavenBank] = useState<number>(0);

  // Current question helper
  const currentQuestion: QuestionData | undefined = activeQuestions[currentIndex];

  // Reset translations whenever question changes
  useEffect(() => {
    setRevealedQuestionTranslation(alwaysShowTranslations);
    setRevealedOptions({});
    setSelectedOptionId(null);
    setEliminatedOptions([]);
    setShowGrammarInfo(false);
  }, [currentIndex, alwaysShowTranslations]);

  // Handle sound toggle
  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  // Start new game
  const startGame = (mode: GameMode = gameMode) => {
    let pool = [...ALL_QUESTIONS];

    // Filter by category if selected
    if (selectedCategory !== 'all') {
      pool = pool.filter((q) => q.category === selectedCategory);
    }

    // Filter by tense if selected
    if (selectedTense !== 'all') {
      pool = pool.filter((q) => q.tense.includes(selectedTense));
    }

    // Prepare questions list
    let preparedList: QuestionData[] = [];
    if (mode === 'ladder') {
      // Pick 15 questions with escalating complexity / variety
      // If pool has more than 15, sample balanced representation
      if (pool.length > 15) {
        const shuffled = [...pool].sort(() => 0.5 - Math.random());
        preparedList = shuffled.slice(0, 15);
      } else {
        preparedList = pool;
      }
    } else if (mode === 'marathon') {
      // All 50 in order
      preparedList = [...ALL_QUESTIONS];
    } else {
      // Category mode: all in that category
      preparedList = pool;
    }

    if (preparedList.length === 0) {
      preparedList = [...ALL_QUESTIONS].slice(0, 15);
    }

    setActiveQuestions(preparedList);
    setCurrentIndex(0);
    setHistoryAnswers([]);
    setCurrentBank(0);
    setSafeHavenBank(0);
    setLifelines({
      fiftyFiftyUsed: false,
      phoneFriendUsed: false,
      askAudienceUsed: false,
    });
    setGameMode(mode);
    setGameState('playing');
    sound.playSelect();
  };

  // Click on question to reveal/hide translation
  const handleToggleQuestionTranslation = () => {
    setRevealedQuestionTranslation((prev) => !prev);
    sound.playSelect();
  };

  // Click on option translation toggle
  const handleToggleOptionTranslation = (e: React.MouseEvent, optId: string) => {
    e.stopPropagation();
    setRevealedOptions((prev) => ({
      ...prev,
      [optId]: !prev[optId],
    }));
    sound.playSelect();
  };

  // User chooses an option
  const handleSelectOption = (optionId: 'A' | 'B' | 'C' | 'D') => {
    if (gameState !== 'playing' || !currentQuestion) return;
    if (eliminatedOptions.includes(optionId)) return;

    sound.playSelect();
    setSelectedOptionId(optionId);
    setGameState('answered');

    const isCorrect = optionId === currentQuestion.correctAnswer;

    // Record history
    setHistoryAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        chosen: optionId,
        isCorrect,
      },
    ]);

    if (isCorrect) {
      sound.playCorrect();
      const prize = gameMode === 'ladder' ? (PRIZE_LADDER[currentIndex] || 1000000) : currentBank + 1000;
      setCurrentBank(prize);

      // Checkpoint safe havens
      if (prize >= 100000) {
        setSafeHavenBank(100000);
      } else if (prize >= 5000) {
        setSafeHavenBank(5000);
      }
    } else {
      // WRONG ANSWER:
      // Note requirement: "и если ответ неверный всё равно продолжит игру"
      // Play instructive sound, show explanation, do NOT stop game!
      sound.playWrong();
      // In Millionaire, if wrong, safe haven is preserved or score is retained
      if (safeHavenBank > 0) {
        setCurrentBank(safeHavenBank);
      }
    }
  };

  // User clicks Next Question (works for BOTH correct and incorrect answers!)
  const handleNextQuestion = () => {
    sound.playSelect();
    if (currentIndex + 1 < activeQuestions.length) {
      setCurrentIndex((prev) => prev + 1);
      setGameState('playing');
    } else {
      // Completed all questions in session!
      sound.playWin();
      setGameState('completed');
    }
  };

  // Lifeline: 50:50
  const handleUse5050 = () => {
    if (lifelines.fiftyFiftyUsed || gameState !== 'playing' || !currentQuestion) return;
    sound.playLifeline();

    const correctId = currentQuestion.correctAnswer;
    const incorrectIds = currentQuestion.options
      .map((o) => o.id)
      .filter((id) => id !== correctId);

    // Pick 2 random incorrect options to remove
    const shuffledIncorrect = [...incorrectIds].sort(() => 0.5 - Math.random());
    const toRemove = shuffledIncorrect.slice(0, 2);

    setEliminatedOptions(toRemove);
    setLifelines((prev) => ({ ...prev, fiftyFiftyUsed: true }));
  };

  // Lifeline: Phone a friend (Llamada a un amigo)
  const handleUsePhoneFriend = () => {
    if (lifelines.phoneFriendUsed || gameState !== 'playing' || !currentQuestion) return;
    sound.playLifeline();

    const correct = currentQuestion.correctAnswer;
    const isPresente = currentQuestion.tense.includes('Presente');
    const friendNames = ['Carlos (Madrid)', 'Elena (Barcelona)', 'Mateo (Sevilla)', 'Lucía (Valencia)'];
    const friendName = friendNames[Math.floor(Math.random() * friendNames.length)];

    const advice: FriendAdvice = {
      friendName,
      confidence: 90,
      suggestedAnswer: correct,
      messageEs: `¡Hola! He escuchado la situación. En España en este caso siempre decimos o hacemos "${
        currentQuestion.options.find((o) => o.id === correct)?.es
      }". El verbo está en ${isPresente ? 'Presente' : 'Pretérito Perfecto'}, ¡así que la opción ${correct} es sin duda la correcta!`,
      messageRu: `Привет! Я услышал ситуацию. В Испании в этом случае всегда говорят или делают именно это: "${
        currentQuestion.options.find((o) => o.id === correct)?.ru
      }". Глагол употреблён правильно, поэтому вариант ${correct} точно верный!`,
    };

    setFriendModalData(advice);
    setLifelines((prev) => ({ ...prev, phoneFriendUsed: true }));
  };

  // Lifeline: Ask the audience (Ayuda del público)
  const handleUseAskAudience = () => {
    if (lifelines.askAudienceUsed || gameState !== 'playing' || !currentQuestion) return;
    sound.playLifeline();

    const correct = currentQuestion.correctAnswer;
    // Generate realistic audience distribution heavily biased towards correct answer
    const correctPercentage = Math.floor(Math.random() * 20) + 65; // 65-85%
    const remaining = 100 - correctPercentage;
    const p1 = Math.floor(Math.random() * (remaining - 4)) + 1;
    const p2 = Math.floor(Math.random() * (remaining - p1 - 2)) + 1;
    const p3 = remaining - p1 - p2;

    const stats: AudienceStats = { A: 0, B: 0, C: 0, D: 0 };
    stats[correct] = correctPercentage;

    const otherIds = (['A', 'B', 'C', 'D'] as ('A' | 'B' | 'C' | 'D')[]).filter((id) => id !== correct);
    stats[otherIds[0]] = p1;
    stats[otherIds[1]] = p2;
    stats[otherIds[2]] = p3;

    setAudienceModalData(stats);
    setLifelines((prev) => ({ ...prev, askAudienceUsed: true }));
  };

  // Total correct count
  const correctCount = useMemo(() => {
    return historyAnswers.filter((h) => h.isCorrect).length;
  }, [historyAnswers]);

  return (
    <div className="min-h-screen bg-[#050a18] text-slate-100 flex flex-col relative selection:bg-amber-500 selection:text-black">
      {/* Dynamic TV Studio Glow Elements */}
      <div className="absolute inset-0 pointer-events-none studio-spotlight-left z-0" />
      <div className="absolute inset-0 pointer-events-none studio-spotlight-right z-0" />
      <div className="absolute inset-0 pointer-events-none studio-center-glow z-0" />

      {/* --- Top Bar Contract (1 Row, 3 Zones) --- */}
      <header className="relative z-20 flex items-center justify-between px-4 lg:px-8 py-3.5 border-b border-blue-900/40 bg-[#080e22]/90 backdrop-blur-md">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGameState('intro')}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
            title="На главную"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-200 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold text-lg font-display">
              €
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-amber-300 transition-colors font-display">
                ¿Quién Quiere Ser Millonario?
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-blue-300 font-medium">
                · Практический испанский
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Fast Category / Tense Links (Desktop) */}
        <nav className="hidden xl:flex items-center gap-5 text-xs text-slate-300 font-medium">
          <span className="text-blue-400">50 практических ситуаций:</span>
          <button
            onClick={() => { setSelectedCategory('all'); startGame('marathon'); }}
            className="hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            Все темы (50)
          </button>
          <button
            onClick={() => { setSelectedCategory('cine'); startGame('category'); }}
            className="hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            🎬 Кинотеатр (10)
          </button>
          <button
            onClick={() => { setSelectedCategory('tienda'); startGame('category'); }}
            className="hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            👕 Магазин (10)
          </button>
          <button
            onClick={() => { setSelectedCategory('camino'); startGame('category'); }}
            className="hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            🛣️ Дорога (12)
          </button>
          <button
            onClick={() => { setSelectedCategory('supermercado'); startGame('category'); }}
            className="hover:text-amber-300 transition-colors whitespace-nowrap"
          >
            🛒 Супермаркет (18)
          </button>
        </nav>

        {/* Zone 3: Interactive Controls (Sound, Translations, Mobile Ladder) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Always Show Translations Quick Switch */}
          <button
            onClick={() => setAlwaysShowTranslations((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              alwaysShowTranslations
                ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white'
            }`}
            title="Переключатель автоматического перевода"
          >
            {alwaysShowTranslations ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden md:inline">
              {alwaysShowTranslations ? 'Перевод включён' : 'Перевод по клику'}
            </span>
            <span className="md:hidden">Перевод</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-slate-300 transition-colors"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Ladder Button for Mobile / Small screens */}
          {gameState === 'playing' && (
            <button
              onClick={() => setShowLadderDrawer((prev) => !prev)}
              className="lg:hidden px-2.5 py-1.5 rounded-lg bg-blue-950/80 border border-blue-500/40 text-amber-400 text-xs font-semibold"
            >
              Древо призов
            </button>
          )}
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <main className="flex-1 flex flex-col relative z-10 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 justify-center">

        {/* ============================================================== */}
        {/* VIEW 1: INTRO / GAME SELECTION SCREEN                          */}
        {/* ============================================================== */}
        {gameState === 'intro' && (
          <div className="max-w-3xl mx-auto w-full my-auto py-6 sm:py-10 text-center">
            {/* Medallion / Badge */}
            <div className="inline-flex p-4 rounded-full bg-gradient-to-b from-amber-400/20 via-blue-900/30 to-transparent border border-amber-400/40 shadow-2xl shadow-blue-950 mb-6">
              <div className="w-20 h-20 rounded-full border-2 border-amber-400 flex items-center justify-center bg-[#071330] text-amber-400 shadow-inner">
                <Sparkles className="w-10 h-10 text-amber-400 animate-pulse" />
              </div>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 font-display">
              ¿Quién Quiere Ser Millonario?
            </h1>
            <p className="text-base sm:text-lg text-blue-200 max-w-xl mx-auto mb-2 font-medium">
              50 практических ситуаций на испанском языке из реальной жизни
            </p>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto mb-8">
              Учись действовать в кинотеатре, магазине, на улице и в супермаркете. Нажимай на любую фразу или вариант ответа, чтобы моментально увидеть перевод на русский!
            </p>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-left">
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-sm">
                  <Languages className="w-4 h-4" />
                  <span>Перевод по клику</span>
                </div>
                <p className="text-xs text-slate-300">
                  Кликни по тексту ситуации или по любому варианту, чтобы раскрыть русский перевод.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-sm">
                  <BookOpen className="w-4 h-4" />
                  <span>Времена глаголов</span>
                </div>
                <p className="text-xs text-slate-300">
                  Ситуации в <span className="text-emerald-300">Presente</span> и <span className="text-indigo-300">Pretérito Perfecto</span> с грамматическими пояснениями.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Игра без выбывания</span>
                </div>
                <p className="text-xs text-slate-300">
                  При неверном ответе игра всё равно продолжается! Ты узнаешь правильный ответ и продолжить обучение.
                </p>
              </div>
            </div>

            {/* Filter by Category & Tense */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-blue-900/50 mb-8 max-w-xl mx-auto">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3 text-center">
                Настройки тренировки
              </div>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {[
                  { id: 'all', label: 'Все темы (50)' },
                  { id: 'cine', label: '🎬 Кинотеатр' },
                  { id: 'tienda', label: '👕 Магазин' },
                  { id: 'camino', label: '🛣️ Дорога' },
                  { id: 'supermercado', label: '🛒 Супермаркет' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { id: 'all', label: 'Все времена' },
                  { id: 'Presente', label: 'Только Presente' },
                  { id: 'Pretérito Perfecto', label: 'Только Pretérito Perfecto' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTense(t.id)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      selectedTense === t.id
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => startGame('ladder')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-extrabold text-base tracking-wide shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Играть в «Миллионер» (15 уровней)</span>
              </button>

              <button
                onClick={() => startGame('marathon')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-blue-900/50 hover:bg-blue-800/50 border border-blue-500/40 text-blue-200 font-semibold text-sm transition-all"
              >
                Пройти все 50 ситуаций подряд
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: ACTIVE GAMEPLAY (MILLIONAIRE ARENA)                    */}
        {/* ============================================================== */}
        {(gameState === 'playing' || gameState === 'answered') && currentQuestion && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

            {/* Main Stage (Question + Lifelines + Options) */}
            <div className="lg:col-span-9 flex flex-col gap-4">

              {/* Top HUD: Question index, Category, Tense & Lifelines */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-[#09132e]/80 border border-blue-900/50">
                {/* Situation Metadata */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800/60 text-amber-400 font-bold tabular-nums">
                    Вопрос {currentIndex + 1} / {activeQuestions.length}
                  </span>
                  <span className="text-slate-400 font-medium">
                    {currentQuestion.categoryTitleEs}
                  </span>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() => setShowGrammarInfo((prev) => !prev)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                      currentQuestion.tense.includes('Pretérito')
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50'
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                    }`}
                    title="Нажмите, чтобы увидеть грамматический комментарий"
                  >
                    <span>{currentQuestion.tense}</span>
                    {showGrammarInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Lifelines (Подсказки) */}
                <div className="flex items-center gap-2">
                  {/* 50:50 */}
                  <button
                    onClick={handleUse5050}
                    disabled={lifelines.fiftyFiftyUsed || gameState !== 'playing'}
                    className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all border ${
                      lifelines.fiftyFiftyUsed
                        ? 'bg-slate-900 border-slate-800 text-slate-600 line-through cursor-not-allowed opacity-50'
                        : 'bg-blue-950 hover:bg-blue-900 border-blue-600/60 text-amber-400 hover:border-amber-400 shadow-sm'
                    }`}
                    title="50:50 (Убрать 2 неверных ответа)"
                  >
                    50:50
                  </button>

                  {/* Phone a Friend */}
                  <button
                    onClick={handleUsePhoneFriend}
                    disabled={lifelines.phoneFriendUsed || gameState !== 'playing'}
                    className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${
                      lifelines.phoneFriendUsed
                        ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                        : 'bg-blue-950 hover:bg-blue-900 border-blue-600/60 text-blue-300 hover:border-amber-400'
                    }`}
                    title="Звонок другу (Llamada a un amigo)"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Друг</span>
                  </button>

                  {/* Ask Audience */}
                  <button
                    onClick={handleUseAskAudience}
                    disabled={lifelines.askAudienceUsed || gameState !== 'playing'}
                    className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${
                      lifelines.askAudienceUsed
                        ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                        : 'bg-blue-950 hover:bg-blue-900 border-blue-600/60 text-blue-300 hover:border-amber-400'
                    }`}
                    title="Помощь зала (Ayuda del público)"
                  >
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Зал</span>
                  </button>
                </div>
              </div>

              {/* Grammar Helper Card (Expanded when clicked) */}
              {showGrammarInfo && (
                <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-700/40 text-xs text-blue-200">
                  <span className="font-semibold text-amber-300 mr-2">Грамматический ориентир:</span>
                  {currentQuestion.tenseExplanationRu}
                </div>
              )}

              {/* Question Screen Card */}
              <div
                onClick={handleToggleQuestionTranslation}
                className="cursor-pointer group relative p-5 sm:p-7 rounded-2xl bg-gradient-to-b from-[#0a1738] to-[#060e24] border-2 border-blue-600/60 hover:border-amber-400/80 transition-all shadow-2xl shadow-blue-950"
              >
                {/* Audio speaker button */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Ситуация #{currentQuestion.id}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-amber-400/90">Кликни на испанский для перевода</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speakSpanish(currentQuestion.questionEs);
                    }}
                    className="p-1.5 rounded-lg bg-blue-900/60 hover:bg-amber-500 hover:text-slate-950 text-blue-200 transition-colors"
                    title="Прослушать произношение на испанском"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Spanish Question Text */}
                <div className="text-lg sm:text-2xl font-bold text-white leading-relaxed mb-3">
                  {currentQuestion.questionEs}
                </div>

                {/* Russian Translation Block (toggled on click or always visible) */}
                <div
                  className={`pt-3 border-t border-blue-900/60 transition-all duration-200 ${
                    revealedQuestionTranslation || alwaysShowTranslations
                      ? 'opacity-100 max-h-40'
                      : 'opacity-0 max-h-0 overflow-hidden'
                  }`}
                >
                  <div className="text-sm sm:text-base text-amber-200 font-medium leading-normal flex items-start gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 shrink-0 font-mono">
                      RU
                    </span>
                    <span>{currentQuestion.questionRu}</span>
                  </div>
                </div>

                {!revealedQuestionTranslation && !alwaysShowTranslations && (
                  <div className="text-xs text-blue-400/80 flex items-center gap-1 mt-1 group-hover:text-amber-300 transition-colors">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Нажмите, чтобы увидеть перевод на русский</span>
                  </div>
                )}
              </div>

              {/* 4 Options Grid (A, B, C, D) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
                {currentQuestion.options.map((option: OptionItem) => {
                  const isEliminated = eliminatedOptions.includes(option.id);
                  const isSelected = selectedOptionId === option.id;
                  const isCorrect = option.id === currentQuestion.correctAnswer;
                  const isRevealed = revealedOptions[option.id] || alwaysShowTranslations;

                  // Dynamic style states for Millionaire options
                  let cardBg = 'bg-[#09132d] hover:bg-[#0d1c44] border-blue-700/60 hover:border-amber-400';
                  let badgeBg = 'bg-blue-950 text-amber-400 border-amber-400/60';
                  let textColor = 'text-white';

                  if (isEliminated) {
                    cardBg = 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-20 pointer-events-none';
                    badgeBg = 'bg-slate-900 text-slate-700 border-slate-800';
                    textColor = 'text-slate-700';
                  } else if (gameState === 'answered') {
                    if (isCorrect) {
                      // Correct option always highlighted in glowing emerald
                      cardBg = 'bg-emerald-950/80 border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-900/30';
                      badgeBg = 'bg-emerald-500 text-slate-950 border-emerald-300 font-extrabold';
                      textColor = 'text-emerald-100 font-semibold';
                    } else if (isSelected) {
                      // Player chose wrong option
                      cardBg = 'bg-rose-950/80 border-rose-500 ring-1 ring-rose-500/40 shadow-lg shadow-rose-950/40';
                      badgeBg = 'bg-rose-600 text-white border-rose-400';
                      textColor = 'text-rose-200';
                    } else {
                      cardBg = 'bg-[#060c20]/60 border-blue-950/40 opacity-50';
                    }
                  }

                  return (
                    <div
                      key={option.id}
                      onClick={() => !isEliminated && handleSelectOption(option.id)}
                      className={`relative group rounded-xl border-2 p-3.5 sm:p-4 text-left transition-all duration-150 cursor-pointer flex flex-col justify-between ${cardBg}`}
                    >
                      <div className="flex items-start justify-between gap-2.5 mb-2">
                        {/* Option ID & Spanish phrase */}
                        <div className="flex items-start gap-3 flex-1">
                          <span
                            className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-mono font-bold text-sm border ${badgeBg}`}
                          >
                            {option.id}
                          </span>
                          <span className={`text-sm sm:text-base font-medium leading-snug pt-0.5 ${textColor}`}>
                            {option.es}
                          </span>
                        </div>

                        {/* Interactive Utilities: Pronounce & Toggle Translation */}
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {/* Speak */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakSpanish(option.es);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-amber-300 transition-colors"
                            title="Слушать"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Translation Reveal button */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleOptionTranslation(e, option.id)}
                            className="px-1.5 py-0.5 rounded text-[11px] font-medium text-blue-300/80 hover:text-amber-300 bg-blue-950/50 border border-blue-800/40 hover:border-amber-400/50 transition-colors"
                            title="Показать русский перевод этого варианта"
                          >
                            {isRevealed ? 'Скрыть RU' : 'Перевод'}
                          </button>
                        </div>
                      </div>

                      {/* Russian Translation Line for Option */}
                      <div
                        className={`transition-all duration-200 overflow-hidden ${
                          isRevealed ? 'max-h-24 opacity-100 pt-1.5 border-t border-blue-900/40' : 'max-h-0 opacity-0'
                        }`}
                      >
                        <div className="text-xs text-amber-200 font-medium pl-10">
                          {option.ru}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* POST-ANSWER FEEDBACK & CONTINUATION BANNER */}
              {/* IMPORTANT: "и если ответ неверный всё равно продолжит игру" */}
              {gameState === 'answered' && (
                <div
                  className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 ${
                    selectedOptionId === currentQuestion.correctAnswer
                      ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-100 shadow-xl shadow-emerald-950'
                      : 'bg-rose-950/60 border-rose-500/70 text-rose-100 shadow-xl shadow-rose-950'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {selectedOptionId === currentQuestion.correctAnswer ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-base sm:text-lg mb-1 flex items-center gap-2">
                        <span>
                          {selectedOptionId === currentQuestion.correctAnswer
                            ? '¡Correcto! Правильно!'
                            : `Ответ ${selectedOptionId} не совсем точный. Правильный ответ: ${currentQuestion.correctAnswer}`}
                        </span>
                        {selectedOptionId === currentQuestion.correctAnswer && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                            +{(PRIZE_LADDER[currentIndex] || 1000).toLocaleString('ru-RU')} €
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
                        {currentQuestion.explanationRu}
                      </p>
                    </div>
                  </div>

                  {/* Primary Continue Button */}
                  <button
                    onClick={handleNextQuestion}
                    className="w-full md:w-auto px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm sm:text-base tracking-wide shadow-lg shadow-amber-400/25 shrink-0 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <span>
                      {currentIndex + 1 < activeQuestions.length
                        ? 'Следующий вопрос'
                        : 'Завершить игру'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Side Ladder / Progress Tree */}
            <div className="hidden lg:block lg:col-span-3">
              <div className="rounded-2xl bg-[#070f26]/90 border border-blue-900/60 p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-900/60">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider font-display">
                    {gameMode === 'ladder' ? 'Древо призов' : 'Прогресс ситуаций'}
                  </div>
                  <div className="text-xs text-blue-300 font-mono tabular-nums">
                    {correctCount} / {historyAnswers.length} верно
                  </div>
                </div>

                {/* Ladder Items */}
                <div className="flex flex-col-reverse gap-1 text-xs font-mono">
                  {(gameMode === 'ladder' ? PRIZE_LADDER : activeQuestions.map((_, i) => (i + 1) * 1000)).map(
                    (val, idx) => {
                      const isCurrent = idx === currentIndex;
                      const isAnswered = idx < currentIndex;
                      const isCheckpoint = val === 5000 || val === 100000 || val === 1000000;

                      // Answer history for this step
                      const stepHistory = historyAnswers[idx];

                      let rowClass = 'text-slate-400 hover:bg-blue-950/40';
                      if (isCurrent) {
                        rowClass = 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 rounded-md';
                      } else if (isAnswered) {
                        if (stepHistory?.isCorrect) {
                          rowClass = 'text-emerald-400 font-medium';
                        } else {
                          rowClass = 'text-rose-400/80';
                        }
                      } else if (isCheckpoint) {
                        rowClass = 'text-amber-300 font-semibold';
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-2.5 py-1 rounded transition-colors ${rowClass}`}
                        >
                          <span className="w-5 text-right mr-2 opacity-75">{idx + 1}</span>
                          <span className="flex-1 truncate">
                            {isCheckpoint && !isCurrent && <span className="mr-1 text-amber-400 font-bold">★</span>}
                            {val.toLocaleString('ru-RU')} €
                          </span>
                          {isAnswered && (
                            <span className="ml-1 text-[10px]">
                              {stepHistory?.isCorrect ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>

                {/* Safe Haven Reminder */}
                {gameMode === 'ladder' && (
                  <div className="mt-4 pt-3 border-t border-blue-900/60 text-[11px] text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Текущий банк:</span>
                      <span className="text-amber-300 font-bold tabular-nums">
                        {currentBank.toLocaleString('ru-RU')} €
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Несгораемая сумма:</span>
                      <span className="text-emerald-400 font-medium tabular-nums">
                        {safeHavenBank.toLocaleString('ru-RU')} €
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: COMPLETED / VICTORY / SUMMARY SCREEN                  */}
        {/* ============================================================== */}
        {gameState === 'completed' && (
          <div className="max-w-3xl mx-auto w-full py-8 text-center">
            {/* Victory Badge */}
            <div className="inline-flex p-4 rounded-full bg-gradient-to-tr from-amber-500/20 via-yellow-400/30 to-blue-900/30 border-2 border-amber-400 shadow-2xl mb-5">
              <Award className="w-16 h-16 text-amber-400 animate-bounce" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 font-display">
              ¡Juego Completado!
            </h2>
            <p className="text-base text-blue-200 mb-6">
              Ты завершил практическую тренировку по испанскому языку!
            </p>

            {/* Score Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
              <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-800/50">
                <div className="text-xs text-slate-400 uppercase font-semibold">Заработано</div>
                <div className="text-xl sm:text-2xl font-extrabold text-amber-300 font-display">
                  {currentBank.toLocaleString('ru-RU')} €
                </div>
              </div>
              <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-800/50">
                <div className="text-xs text-slate-400 uppercase font-semibold">Правильных ответов</div>
                <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono">
                  {correctCount} / {activeQuestions.length}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-blue-950/60 border border-blue-800/50">
                <div className="text-xs text-slate-400 uppercase font-semibold">Точность</div>
                <div className="text-xl sm:text-2xl font-extrabold text-blue-300 font-mono">
                  {Math.round((correctCount / Math.max(1, activeQuestions.length)) * 100)}%
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
              <button
                onClick={() => startGame('ladder')}
                className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-400/20 active:scale-95 transition-all flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Сыграть снова (Миллионер)</span>
              </button>

              <button
                onClick={() => startGame('marathon')}
                className="px-6 py-3 rounded-xl bg-blue-900/60 hover:bg-blue-800/60 border border-blue-500/40 text-blue-200 font-semibold text-sm transition-all"
              >
                Пройти все 50 ситуаций
              </button>
            </div>

            {/* Comprehensive Situation & Mistake Review Section */}
            <div className="text-left rounded-2xl bg-[#09132e]/90 border border-blue-900/60 p-5 sm:p-7 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <span>Разбор пройденных ситуаций</span>
              </h3>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {activeQuestions.map((q, idx) => {
                  const userHistory = historyAnswers[idx];
                  const isUserCorrect = userHistory?.isCorrect;
                  const correctOpt = q.options.find((o) => o.id === q.correctAnswer);

                  return (
                    <div
                      key={q.id}
                      className={`p-3.5 rounded-xl border text-xs sm:text-sm space-y-1.5 transition-colors ${
                        isUserCorrect
                          ? 'bg-emerald-950/20 border-emerald-800/40'
                          : 'bg-rose-950/20 border-rose-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold">
                          #{q.id} {q.categoryTitleEs} · {q.tense}
                        </span>
                        <span
                          className={`font-semibold ${isUserCorrect ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          {isUserCorrect ? '✓ Правильно' : `✗ Твой выбор: ${userHistory?.chosen || '-'}`}
                        </span>
                      </div>

                      {/* Spanish and Russian Question */}
                      <div className="font-semibold text-white">{q.questionEs}</div>
                      <div className="text-slate-300 text-xs">{q.questionRu}</div>

                      {/* Correct Answer */}
                      <div className="text-xs pt-1 text-emerald-300">
                        <span className="font-bold">Правильно ({q.correctAnswer}): </span>
                        <span>{correctOpt?.es}</span>
                        <span className="text-slate-400 ml-1">({correctOpt?.ru})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- LIFELINE MODAL: CALL A FRIEND (LLAMADA A UN AMIGO) --- */}
      {friendModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full rounded-2xl bg-[#091536] border-2 border-amber-400/80 p-5 sm:p-6 text-left shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-blue-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-amber-400/20 border border-amber-400 flex items-center justify-center text-amber-400">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Llamada a un amigo</div>
                  <div className="text-xs text-blue-300">{friendModalData.friendName}</div>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {friendModalData.confidence}% уверенности
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-blue-950/70 border border-blue-800/50 text-xs sm:text-sm text-amber-100 italic leading-relaxed">
                «{friendModalData.messageEs}»
              </div>

              <div className="text-xs text-slate-300 pl-1">
                <span className="font-semibold text-amber-300">Перевод совета: </span>
                {friendModalData.messageRu}
              </div>
            </div>

            <button
              onClick={() => setFriendModalData(null)}
              className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-colors"
            >
              ¡Gracias, amigo! (Понятно)
            </button>
          </div>
        </div>
      )}

      {/* --- LIFELINE MODAL: ASK THE AUDIENCE (AYUDA DEL PÚBLICO) --- */}
      {audienceModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full rounded-2xl bg-[#091536] border-2 border-amber-400/80 p-5 sm:p-6 text-left shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-blue-900/60">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Ayuda del público</div>
                <div className="text-xs text-blue-300">Результаты голосования зрителей в зале</div>
              </div>
            </div>

            {/* Voting Bar Graphs */}
            <div className="space-y-2.5 py-2">
              {(['A', 'B', 'C', 'D'] as ('A' | 'B' | 'C' | 'D')[]).map((opt) => {
                const percent = audienceModalData[opt];
                return (
                  <div key={opt} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="font-bold text-white">Вариант {opt}</span>
                      <span className="text-amber-300 font-bold">{percent}%</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden border border-blue-900/60">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setAudienceModalData(null)}
              className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-colors"
            >
              Вернуться к вопросу
            </button>
          </div>
        </div>
      )}

      {/* --- MOBILE LADDER DRAWER --- */}
      {showLadderDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-72 h-full bg-[#070f26] border-l border-blue-900/60 p-4 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-blue-900/60">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-display">
                  Древо призов
                </span>
                <button
                  onClick={() => setShowLadderDrawer(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  ✕ Закрыть
                </button>
              </div>

              <div className="flex flex-col-reverse gap-1 text-xs font-mono">
                {PRIZE_LADDER.map((val, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = idx < currentIndex;
                  const isCheckpoint = val === 5000 || val === 100000 || val === 1000000;
                  const stepHistory = historyAnswers[idx];

                  let rowClass = 'text-slate-400';
                  if (isCurrent) {
                    rowClass = 'bg-amber-400 text-slate-950 font-bold rounded';
                  } else if (isAnswered) {
                    rowClass = stepHistory?.isCorrect ? 'text-emerald-400' : 'text-rose-400';
                  } else if (isCheckpoint) {
                    rowClass = 'text-amber-300 font-semibold';
                  }

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between px-2 py-1 rounded ${rowClass}`}
                    >
                      <span className="w-5">{idx + 1}</span>
                      <span>{val.toLocaleString('ru-RU')} €</span>
                      <span>{isAnswered ? (stepHistory?.isCorrect ? '✓' : '✗') : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => setShowLadderDrawer(false)}
              className="mt-4 w-full py-2 rounded-lg bg-blue-950 border border-blue-700/60 text-xs font-semibold text-blue-200"
            >
              Продолжить игру
            </button>
          </div>
        </div>
      )}

      {/* --- Footer Contract --- */}
      <footer className="relative z-10 border-t border-blue-950/60 px-4 py-3 text-center text-xs text-slate-400">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
          <span>¿Quién Quiere Ser Millonario? — Español Práctico</span>
          <span>·</span>
          <span>50 практических ситуаций (🇪🇸 + 🇷🇺)</span>
          <span>·</span>
          <span>Presente & Pretérito Perfecto</span>
        </div>
      </footer>
    </div>
  );
}
