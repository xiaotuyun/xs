import React, { useState } from 'react';
import { Novel, Volume, Chapter, TabType, WorldBuilding, Character } from '../types';
import { getAiConfig } from '../lib/aiConfig';
import { Sparkles, BookOpen, Globe, Users, FileText, PenTool, ArrowRight, Loader2, Award, Clock, Settings, X, Trash2 } from 'lucide-react';
import { getPureWordCount } from '../lib/wordCount';

interface DashboardProps {
  novel: Novel;
  onUpdateNovel: (updated: Novel) => void;
  onCreateNewNovel?: (newNovel: Novel) => void;
  onDeleteNovel: (id: string) => void;
  setActiveTab: (tab: TabType) => void;
  onRequireConfig: () => boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ novel, onUpdateNovel, onCreateNewNovel, onDeleteNovel, setActiveTab, onRequireConfig }) => {
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState('玄幻修真 / 东方奇幻');
  const [targetLength, setTargetLength] = useState('中篇 (100万字)');
  const [tone, setTone] = useState('热血爽快、节奏明快、逻辑严密');
  const [volumeCount, setVolumeCount] = useState<number>(3);
  const [chapterCount, setChapterCount] = useState<number>(5);
  const [targetOption, setTargetOption] = useState<'new' | 'current'>('new');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Novel Settings Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(novel.title);
  const [editGenre, setEditGenre] = useState(novel.genre);
  const [editLogline, setEditLogline] = useState(novel.logline);
  const [editTargetLength, setEditTargetLength] = useState(novel.targetLength);
  const [editTone, setEditTone] = useState(novel.tone);

  const handleSaveNovelSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Novel = {
      ...novel,
      title: editTitle.trim() || novel.title,
      genre: editGenre.trim() || novel.genre,
      logline: editLogline.trim() || novel.logline,
      targetLength: editTargetLength,
      tone: editTone,
      updatedAt: new Date().toISOString(),
    };
    onUpdateNovel(updated);
    setShowEditModal(false);
  };

  const totalWords = novel.volumes.reduce(
    (acc, vol) => acc + vol.chapters.reduce((cAcc, c) => cAcc + getPureWordCount(c.content), 0),
    0
  );

  const totalChapters = novel.volumes.reduce(
    (acc, vol) => acc + vol.chapters.length,
    0
  );

  const completedChapters = novel.volumes.reduce(
    (acc, vol) => acc + vol.chapters.filter((c) => c.status === 'completed' || c.content.length > 200).length,
    0
  );

  const handleGenerateOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRequireConfig()) return;
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();
      const res = await fetch('/api/ai/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, genre, targetLength, tone, apiKey, model, volumeCount, chapterCount, customBaseUrl, useChatCompletions }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '生成失败');
      }

      const generated = data.data || {};

      // Parse volumes flexibly
      const volumesList = generated.volumes || generated.newVolumes || generated.data?.volumes || [];
      const formattedVolumes: Volume[] = Array.isArray(volumesList) && volumesList.length > 0
        ? volumesList.map((vol: any, vIdx: number) => ({
            id: (targetOption === 'current' && novel.volumes[vIdx]) ? novel.volumes[vIdx].id : `vol-${Date.now()}-${vIdx}`,
            volumeNumber: vol.volumeNumber || vIdx + 1,
            volumeTitle: vol.volumeTitle || `第${vIdx + 1}卷`,
            summary: vol.summary || '',
            chapters: (vol.chapters || []).map((ch: any, cIdx: number) => {
              const existingChap = targetOption === 'current'
                ? (novel.volumes[vIdx]?.chapters[cIdx] || novel.volumes.flatMap(v => v.chapters).find(item => item.chapterNumber === (ch.chapterNumber || cIdx + 1)))
                : undefined;

              return {
                id: existingChap?.id || `chap-${Date.now()}-${vIdx}-${cIdx}`,
                chapterNumber: ch.chapterNumber || cIdx + 1,
                title: ch.title || `第${cIdx + 1}章`,
                summary: ch.summary || '',
                content: existingChap?.content || '',
                wordCount: existingChap?.wordCount || 0,
                status: existingChap?.status || 'draft' as const,
              };
            }),
          }))
        : novel.volumes;

      // Parse worldBuilding safely
      const genWb = typeof generated.worldBuilding === 'object' ? generated.worldBuilding : {};
      const genBg = typeof generated.worldBuilding === 'string' ? generated.worldBuilding : genWb.background;

      let formattedWorldBuilding: WorldBuilding;
      if (targetOption === 'current') {
        formattedWorldBuilding = {
          background: genBg || novel.worldBuilding?.background || '在此完善小说的世界背景设定...',
          powerSystem: genWb.powerSystem || novel.worldBuilding?.powerSystem || '在此描述力量体系与境界划分...',
          factions: genWb.factions || novel.worldBuilding?.factions || '在此描述主要势力与宗门...',
          customItems: novel.worldBuilding?.customItems || [],
        };
      } else {
        formattedWorldBuilding = {
          background: genBg || '在此完善小说的世界背景设定...',
          powerSystem: genWb.powerSystem || '在此描述力量体系与境界划分...',
          factions: genWb.factions || '在此描述主要势力与宗门...',
          customItems: [],
        };
      }

      // Parse characters safely
      let formattedCharacters: Character[] = novel.characters || [];
      if (Array.isArray(generated.characters) && generated.characters.length > 0) {
        const newChars: Character[] = generated.characters.map((c: any, idx: number) => ({
          id: `char-${Date.now()}-${idx}`,
          name: c.name || `角色${idx + 1}`,
          role: c.role || '主要角色',
          description: c.description || c.personality || c.trait || '',
          background: c.background || c.history || '',
        }));

        if (targetOption === 'current') {
          const existingNames = new Set((novel.characters || []).map(ch => ch.name.trim()));
          const addedChars = newChars.filter(ch => !existingNames.has(ch.name.trim()));
          formattedCharacters = [...(novel.characters || []), ...addedChars];
        } else {
          formattedCharacters = newChars;
        }
      }

      if (targetOption === 'new') {
        const newCreatedNovel: Novel = {
          id: `novel-${Date.now()}`,
          title: (generated.title && typeof generated.title === 'string' && generated.title.trim())
            ? generated.title.trim()
            : (prompt.trim().slice(0, 12) || '无标题新书'),
          logline: generated.logline || '核心看点与故事简介...',
          genre: genre || '玄幻修真 / 东方奇幻',
          tags: Array.isArray(generated.tags) ? generated.tags : ['系统流', '热血爽文'],
          targetLength: targetLength || '中篇 (100万字)',
          tone: tone || '热血爽快、节奏明快',
          worldBuilding: formattedWorldBuilding,
          characters: formattedCharacters,
          volumes: formattedVolumes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (onCreateNewNovel) {
          onCreateNewNovel(newCreatedNovel);
        } else {
          onUpdateNovel(newCreatedNovel);
        }
      } else {
        const updatedNovel: Novel = {
          ...novel,
          title: (novel.title && novel.title.trim() && novel.title !== '无标题小说')
            ? novel.title
            : ((generated.title && typeof generated.title === 'string' && generated.title.trim()) ? generated.title.trim() : novel.title),
          logline: generated.logline || novel.logline,
          genre: genre || novel.genre,
          tags: Array.isArray(generated.tags) && generated.tags.length > 0 ? generated.tags : (novel.tags || ['系统流', '热血爽文']),
          targetLength: targetLength || novel.targetLength,
          tone: tone || novel.tone,
          worldBuilding: formattedWorldBuilding,
          characters: formattedCharacters,
          volumes: formattedVolumes,
          updatedAt: new Date().toISOString(),
        };

        onUpdateNovel(updatedNovel);
      }

      setPrompt('');
      setActiveTab('outline');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 生成大纲时发生错误，请重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Novel Header Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full font-medium">
                {novel.genre}
              </span>
              <span className="bg-stone-800 text-stone-300 text-xs px-2.5 py-1 rounded-full border border-stone-700">
                {novel.targetLength}
              </span>
              <span className="bg-stone-800 text-stone-300 text-xs px-2.5 py-1 rounded-full border border-stone-700">
                {novel.tone}
              </span>
            </div>

            <button
              onClick={() => {
                setEditTitle(novel.title);
                setEditGenre(novel.genre);
                setEditLogline(novel.logline);
                setEditTargetLength(novel.targetLength);
                setEditTone(novel.tone);
                setShowEditModal(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-stone-200 text-xs font-medium transition-colors border border-white/15"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>编辑作品设定</span>
            </button>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {novel.title}
          </h2>

          <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
            {novel.logline}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {novel.tags.map((tag, idx) => (
              <span key={idx} className="bg-stone-800/80 text-amber-200/90 text-xs px-2 py-0.5 rounded">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">总字数统计</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totalWords.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">章节总数</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totalChapters}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">已完成章节</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{completedChapters}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">登场角色</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{novel.characters.length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Content Sections: AI Assistant Generator & Quick Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* AI Generator Box (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">AI 智能小说架构师</h3>
              <p className="text-xs text-stone-500">输入一句话灵感，一键生成全书世界观、主角团与精细大纲目录</p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleGenerateOutline} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                核心创意与灵感 (Prompt)
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一个现代中医师穿越到修仙世界，发现自己的银针能提纯所有废丹与仙草，开启逆天炼丹之路……"
                className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  小说流派 (可自定义)
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="例如：玄幻修真、科幻机甲、无限流..."
                  className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  required
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['玄幻修真 / 东方奇幻', '科幻星际 / 废土机甲', '都市异能 / 系统爽文', '悬疑推理 / 惊悚解谜', '历史架空 / 权谋争霸'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setGenre(p)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        genre === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {p.split('/')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  预估篇幅 (可自定义)
                </label>
                <input
                  type="text"
                  value={targetLength}
                  onChange={(e) => setTargetLength(e.target.value)}
                  placeholder="例如：中篇 (100万字)"
                  className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  required
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['短篇 (30万字)', '中篇 (100万字)', '长篇 (200万字+)', '超长篇 (500万字)'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTargetLength(p)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        targetLength === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {p.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  文风基调 (可自定义)
                </label>
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="例如：热血爽快、节奏明快"
                  className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  required
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['热血爽快、节奏明快', '细腻文风、注重情感', '严谨烧脑、多重反转', '轻松幽默、日常治愈'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTone(p)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        tone === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {p.split('、')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom structure: volumes and chapters counts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-stone-100">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  生成分卷数量
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setVolumeCount(prev => Math.max(1, prev - 1))}
                    className="w-9 h-9 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-lg select-none cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={volumeCount}
                    onChange={(e) => setVolumeCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 h-9 rounded-lg border border-stone-300 text-center text-sm font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => setVolumeCount(prev => prev + 1)}
                    className="w-9 h-9 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-lg select-none cursor-pointer"
                  >
                    +
                  </button>
                  <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-1 rounded">
                    共 {volumeCount} 卷
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 leading-relaxed">推荐生成 2 - 5 卷，使全书起承转合结构清晰（自定义不设上限）</p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  每卷章节数量
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setChapterCount(prev => Math.max(1, prev - 1))}
                    className="w-9 h-9 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-lg select-none cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={chapterCount}
                    onChange={(e) => setChapterCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 h-9 rounded-lg border border-stone-300 text-center text-sm font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => setChapterCount(prev => prev + 1)}
                    className="w-9 h-9 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-lg select-none cursor-pointer"
                  >
                    +
                  </button>
                  <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-1 rounded">
                    每卷 {chapterCount} 章
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 leading-relaxed">每个分卷生成的章节，推荐设定 3 - 10 章（自定义不设上限）</p>
              </div>
            </div>

            {/* Target Option Selector */}
            <div className="pt-3 border-t border-stone-100">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                生成目标模式
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetOption('new')}
                  className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                    targetOption === 'new'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-900 ring-2 ring-amber-500/30'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    targetOption === 'new' ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300 bg-white'
                  }`}>
                    {targetOption === 'new' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">生成全新小说（默认）</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">在书架新建一本新的小说作品并自动切换</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetOption('current')}
                  className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                    targetOption === 'current'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-900 ring-2 ring-amber-500/30'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    targetOption === 'current' ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300 bg-white'
                  }`}>
                    {targetOption === 'current' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">覆盖更新当前本书</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">直接更新当前小说的全书设定与大纲</div>
                  </div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>AI 正在构思全书设定与大纲，请稍候...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>
                    {targetOption === 'new' ? '一键 AI 生成全新小说' : `一键覆盖更新当前《${novel.title}》`}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Quick Navigation Cards (1 col) */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-stone-900 text-base">创作导航</h3>
            
            <div className="space-y-2.5">
              <button
                onClick={() => setActiveTab('world')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-900">世界观与设定</p>
                    <p className="text-xs text-stone-500">背景、境界、宗门势力</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                onClick={() => setActiveTab('characters')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-900">登场角色管理</p>
                    <p className="text-xs text-stone-500">主角、反派与关系网</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                onClick={() => setActiveTab('outline')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-900">分卷与章节大纲</p>
                    <p className="text-xs text-stone-500">目录编排与剧情走向</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                onClick={() => setActiveTab('editor')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-900">进入正文写作</p>
                    <p className="text-xs text-stone-500">AI 辅助创作与章节编辑</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Novel Settings Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-stone-900">编辑作品设定</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNovelSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">小说书名</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">作品流派 (支持自定义)</label>
                <input
                  type="text"
                  value={editGenre}
                  onChange={(e) => setEditGenre(e.target.value)}
                  placeholder="例如：玄幻修真、科幻机甲、无限流..."
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['玄幻修真 / 东方奇幻', '科幻星际 / 废土机甲', '都市异能 / 系统爽文', '悬疑推理 / 惊悚解谜', '历史架空 / 权谋争霸', '无限流 / 诸天万界'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditGenre(p)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        editGenre === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {p.split('/')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">核心简介 / Logline</label>
                <textarea
                  rows={3}
                  value={editLogline}
                  onChange={(e) => setEditLogline(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">预估篇幅 (可自定义)</label>
                  <input
                    type="text"
                    value={editTargetLength}
                    onChange={(e) => setEditTargetLength(e.target.value)}
                    placeholder="例如：中篇 (100万字)"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['短篇 (30万字)', '中篇 (100万字)', '长篇 (200万字+)', '超长篇 (500万字)'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditTargetLength(p)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          editTargetLength === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {p.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">文风基调 (可自定义)</label>
                  <input
                    type="text"
                    value={editTone}
                    onChange={(e) => setEditTone(e.target.value)}
                    placeholder="例如：热血爽快、节奏明快"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['热血爽快、节奏明快', '细腻文风、注重情感', '严谨烧脑、多重反转', '轻松幽默、日常治愈'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditTone(p)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          editTone === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {p.split('、')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteNovel(novel.id);
                    setShowEditModal(false);
                  }}
                  className="inline-flex items-center px-3.5 py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>删除此小说</span>
                </button>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-sm font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium shadow-sm"
                  >
                    保存修改
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
