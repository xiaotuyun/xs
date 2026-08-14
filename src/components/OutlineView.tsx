import React, { useState, useEffect } from 'react';
import { Novel, Volume, Chapter, TabType, WorldBuilding, Character } from '../types';
import { getAiConfig } from '../lib/aiConfig';
import { callAiApi } from '../lib/aiClient';
import { FileText, Plus, Trash2, Edit2, ChevronRight, PenTool, Sparkles, FolderPlus, Loader2, AlertTriangle, X, RefreshCw, Wand2, FolderMinus, Unlink, Layers } from 'lucide-react';
import { getPureWordCount } from '../lib/wordCount';
import { parseChapterNumberFromTitle, getEffectiveChapterNumber, sortChapters, normalizeNovelChaptersAndTitles } from '../lib/chapterUtils';

interface OutlineViewProps {
  novel: Novel;
  onUpdateNovel: (updated: Novel) => void;
  onCreateNewNovel?: (newNovel: Novel) => void;
  onSelectChapter: (chapterId: string) => void;
  setActiveTab: (tab: TabType) => void;
  onRequireConfig: () => boolean;
}

export const OutlineView: React.FC<OutlineViewProps> = ({
  novel,
  onUpdateNovel,
  onCreateNewNovel,
  onSelectChapter,
  setActiveTab,
  onRequireConfig,
}) => {
  const [editingChapter, setEditingChapter] = useState<{ volId: string; chapter: Chapter } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    type: 'volume' | 'chapter';
    volId: string;
    chapId?: string;
    title: string;
    chapterCount?: number;
  } | null>(null);
  const [isAddingVolume, setIsAddingVolume] = useState(false);
  const [newVolTitle, setNewVolTitle] = useState('');
  const [newVolSummary, setNewVolSummary] = useState('');

  const [isAddingChapter, setIsAddingChapter] = useState<string | null>(null); // volId
  const [newChapTitle, setNewChapTitle] = useState('');
  const [newChapSummary, setNewChapSummary] = useState('');

  // AI Architect generator state
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState(novel.genre || '玄幻修真 / 东方奇幻');
  const [targetLength, setTargetLength] = useState(novel.targetLength || '中篇 (100万字)');
  const [tone, setTone] = useState(novel.tone || '热血爽快、节奏明快');
  const [titleStyle, setTitleStyle] = useState('通俗白话风 (接地气、直白叙述)');
  const [volumeCount, setVolumeCount] = useState<number>(3);
  const [chapterCount, setChapterCount] = useState<number>(5);
  const [targetOption, setTargetOption] = useState<'new' | 'current'>('new');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extend outline state
  const [sidebarMode, setSidebarMode] = useState<'extend' | 'create'>(
    novel.volumes.length > 0 ? 'extend' : 'create'
  );
  const [extendPrompt, setExtendPrompt] = useState('');
  const [extendTargetLength, setExtendTargetLength] = useState(novel.targetLength || '中篇 (100万字)');
  const [extendTone, setExtendTone] = useState(novel.tone || '热血爽快、节奏明快');
  const [extendTitleStyle, setExtendTitleStyle] = useState('通俗白话风 (接地气、直白叙述)');
  const [extendVolumeCount, setExtendVolumeCount] = useState<number>(2);
  const [extendChapterCount, setExtendChapterCount] = useState<number>(5);
  const [isExtending, setIsExtending] = useState(false);

  // Recast specific volume AI state
  const [recastingVolume, setRecastingVolume] = useState<Volume | null>(null);
  const [recastPrompt, setRecastPrompt] = useState('');
  const [recastChapterCount, setRecastChapterCount] = useState<number>(5);
  const [isRecasting, setIsRecasting] = useState(false);
  const [recastError, setRecastError] = useState<string | null>(null);

  // Manual Edit Volume state
  const [editingVolume, setEditingVolume] = useState<{ id: string; volumeTitle: string; summary: string } | null>(null);

  // Manual Edit Chapter state
  const [editingChapterModal, setEditingChapterModal] = useState<{ volId: string; chapId: string; title: string; summary: string } | null>(null);

  // Dissolve/Cancel Volume state
  const [dissolvingVolume, setDissolvingVolume] = useState<Volume | null>(null);
  const [targetMergeVolId, setTargetMergeVolId] = useState<string>('');
  const [dissolveAllModalOpen, setDissolveAllModalOpen] = useState(false);

  const handleGroupSelectedChaptersToNewVolume = () => {
    if (selectedChapterIds.size === 0) return;

    const selectedChapIdsArr = Array.from(selectedChapterIds);
    const selectedChapters: Chapter[] = [];
    const updatedVolumes: Volume[] = novel.volumes.map(vol => {
      const remainingChapters: Chapter[] = [];
      vol.chapters.forEach(chap => {
        if (selectedChapIdsArr.includes(chap.id)) {
          selectedChapters.push(chap);
        } else {
          remainingChapters.push(chap);
        }
      });
      return { ...vol, chapters: remainingChapters };
    });

    const newVolume: Volume = {
      id: `vol-${Date.now()}`,
      volumeNumber: novel.volumes.length + 1,
      volumeTitle: '新归纳分卷',
      summary: '由章节归纳而成的新分卷',
      chapters: sortChapters(selectedChapters),
    };

    const finalVolumes = normalizeNovelChaptersAndTitles([...updatedVolumes, newVolume]);

    onUpdateNovel({
      ...novel,
      volumes: finalVolumes,
      updatedAt: new Date().toISOString(),
    });

    setSelectedChapterIds(new Set());
    setSelectionMode(false);
  };

  // Automatically check and normalize chapters and titles across all volumes
  useEffect(() => {
    let needsFix = false;
    let globalIdx = 1;

    novel.volumes.forEach((vol) => {
      const sorted = sortChapters(vol.chapters);
      for (let i = 0; i < vol.chapters.length; i++) {
        const currentChap = vol.chapters[i];
        const sortedChap = sorted[i];
        const effNum = getEffectiveChapterNumber(currentChap);
        if (
          currentChap.id !== sortedChap.id ||
          currentChap.chapterNumber !== globalIdx ||
          effNum !== globalIdx
        ) {
          needsFix = true;
        }
        globalIdx++;
      }
    });

    if (needsFix) {
      const normalizedVolumes = normalizeNovelChaptersAndTitles(novel.volumes);
      onUpdateNovel({
        ...novel,
        volumes: normalizedVolumes,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [novel.id, novel.volumes]);

  // Dissolve single volume and merge chapters into another volume
  const handleDissolveVolume = (volId: string, mergeIntoVolId: string) => {
    const sourceVol = novel.volumes.find((v) => v.id === volId);
    const targetVol = novel.volumes.find((v) => v.id === mergeIntoVolId);
    if (!sourceVol || !targetVol) return;

    const chaptersToMove = sourceVol.chapters || [];

    const updatedVolumes = novel.volumes
      .filter((v) => v.id !== volId)
      .map((v) => {
        if (v.id === mergeIntoVolId) {
          const combined = sortChapters([...v.chapters, ...chaptersToMove]);
          return {
            ...v,
            chapters: combined,
          };
        }
        return v;
      });

    const normalizedVolumes = normalizeNovelChaptersAndTitles(updatedVolumes);

    onUpdateNovel({
      ...novel,
      volumes: normalizedVolumes,
      updatedAt: new Date().toISOString(),
    });

    setDissolvingVolume(null);
    setConfirmDeleteTarget(null);
  };

  // Dissolve all volumes into a single volume
  const handleDissolveAllVolumes = () => {
    if (novel.volumes.length <= 1) return;

    const allChapters = sortChapters(novel.volumes.flatMap((v) => v.chapters));

    const singleVolume: Volume = {
      id: novel.volumes[0]?.id || `vol-${Date.now()}`,
      volumeNumber: 1,
      volumeTitle: novel.volumes[0]?.volumeTitle || '第一卷：正文',
      summary: novel.volumes[0]?.summary || '',
      chapters: allChapters,
    };

    const normalizedVolumes = normalizeNovelChaptersAndTitles([singleVolume]);

    onUpdateNovel({
      ...novel,
      volumes: normalizedVolumes,
      updatedAt: new Date().toISOString(),
    });

    setDissolveAllModalOpen(false);
  };

  // Re-order and re-index all chapters sequentially in ascending chapter number order
  const handleReorderChapters = () => {
    const normalizedVolumes = normalizeNovelChaptersAndTitles(novel.volumes);
    onUpdateNovel({
      ...novel,
      volumes: normalizedVolumes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleExtendOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRequireConfig()) return;

    setIsExtending(true);
    setError(null);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();

      const existingVolumes = novel.volumes.map((v) => ({
        volumeNumber: v.volumeNumber,
        volumeTitle: v.volumeTitle,
        summary: v.summary,
        chapters: v.chapters.map((c) => ({
          chapterNumber: c.chapterNumber,
          title: c.title,
          summary: c.summary,
        })),
      }));

      const data = await callAiApi('/api/ai/extend-outline', {
        title: novel.title,
        genre: novel.genre,
        logline: novel.logline,
        worldBuilding: novel.worldBuilding,
        characters: novel.characters,
        existingVolumes,
        prompt: extendPrompt,
        targetLength: extendTargetLength,
        tone: extendTone,
        titleStyle: extendTitleStyle,
        volumeCount: extendVolumeCount,
        chapterCount: extendChapterCount,
        apiKey,
        model,
        customBaseUrl,
        useChatCompletions,
      });

      if (!data.success) {
        throw new Error(data.error || '续接大纲失败');
      }

      const genData = data.data || data || {};
      const newVolsFromAi = genData.newVolumes || genData.volumes || data.newVolumes || data.volumes || [];
      if (!Array.isArray(newVolsFromAi) || newVolsFromAi.length === 0) {
        throw new Error('AI 未能生成有效的续接分卷，请稍后重试。');
      }

      const currentLastVolNum = novel.volumes.reduce(
        (max, v) => Math.max(max, v.volumeNumber || 0),
        0
      );

      const formattedNewVolumes: Volume[] = newVolsFromAi.map((vol: any, vIdx: number) => {
        const vNum = vol.volumeNumber || currentLastVolNum + vIdx + 1;
        return {
          id: `vol-${Date.now()}-${vIdx}`,
          volumeNumber: vNum,
          volumeTitle: vol.volumeTitle || `第${vNum}卷`,
          summary: vol.summary || '',
          chapters: (vol.chapters || []).map((ch: any, cIdx: number) => ({
            id: `chap-${Date.now()}-${vIdx}-${cIdx}`,
            chapterNumber: ch.chapterNumber || cIdx + 1,
            title: ch.title || `第${cIdx + 1}章`,
            summary: ch.summary || '',
            content: '',
            wordCount: 0,
            status: 'draft' as const,
          })),
        };
      });

      const updatedNovel: Novel = {
        ...novel,
        volumes: [...novel.volumes, ...formattedNewVolumes],
        updatedAt: new Date().toISOString(),
      };

      onUpdateNovel(updatedNovel);
      setExtendPrompt('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 续接大纲时发生错误，请重试。');
    } finally {
      setIsExtending(false);
    }
  };

  const handleGenerateOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRequireConfig()) return;
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();
      const data = await callAiApi('/api/ai/generate-outline', { prompt, genre, targetLength, tone, titleStyle, apiKey, model, volumeCount, chapterCount, customBaseUrl, useChatCompletions });
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
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 生成大纲时发生错误，请重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  // Add volume
  const handleAddVolume = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVolTitle.trim()) return;

    const newVol: Volume = {
      id: `vol-${Date.now()}`,
      volumeNumber: novel.volumes.length + 1,
      volumeTitle: newVolTitle,
      summary: newVolSummary,
      chapters: [],
    };

    const updated: Novel = {
      ...novel,
      volumes: [...novel.volumes, newVol],
      updatedAt: new Date().toISOString(),
    };

    onUpdateNovel(updated);
    setNewVolTitle('');
    setNewVolSummary('');
    setIsAddingVolume(false);
  };

  // Add chapter
  const handleAddChapter = (volId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapTitle.trim()) return;

    // Compute max chapter number currently
    let maxChapNum = 0;
    novel.volumes.forEach((v) => {
      v.chapters.forEach((c) => {
        if (c.chapterNumber > maxChapNum) maxChapNum = c.chapterNumber;
      });
    });

    const updatedVolumes = novel.volumes.map((vol) => {
      if (vol.id === volId) {
        const newChap: Chapter = {
          id: `chap-${Date.now()}`,
          chapterNumber: maxChapNum + 1,
          title: newChapTitle,
          summary: newChapSummary,
          content: '',
          wordCount: 0,
          status: 'draft',
        };
        const updatedChaps = [...vol.chapters, newChap].sort((a, b) => a.chapterNumber - b.chapterNumber);
        return {
          ...vol,
          chapters: updatedChaps,
        };
      }
      return vol;
    });

    onUpdateNovel({ ...novel, volumes: updatedVolumes, updatedAt: new Date().toISOString() });
    setNewChapTitle('');
    setNewChapSummary('');
    setIsAddingChapter(null);
  };

  const handleDeleteChapter = (volId: string, chapId: string) => {
    let globalChapIndex = 1;
    const updatedVolumes = novel.volumes.map((vol) => {
      if (vol.id === volId) {
        return {
          ...vol,
          chapters: vol.chapters.filter((c) => c.id !== chapId),
        };
      }
      return vol;
    });

    const reindexedVolumes = updatedVolumes.map((vol) => {
      const sorted = [...vol.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
      const reindexed = sorted.map((c) => {
        const newC = { ...c, chapterNumber: globalChapIndex };
        globalChapIndex++;
        return newC;
      });
      return {
        ...vol,
        chapters: reindexed,
      };
    });

    onUpdateNovel({ ...novel, volumes: reindexedVolumes, updatedAt: new Date().toISOString() });
  };

  const handleDeleteVolume = (volId: string) => {
    const updatedVolumes = novel.volumes.filter((v) => v.id !== volId);
    onUpdateNovel({ ...novel, volumes: updatedVolumes, updatedAt: new Date().toISOString() });
  };

  // AI Recast specific volume submit
  const handleRecastVolumeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recastingVolume) return;
    if (!onRequireConfig()) return;

    setIsRecasting(true);
    setRecastError(null);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();

      const volIdx = novel.volumes.findIndex((v) => v.id === recastingVolume.id);
      const precedingVolumes = novel.volumes.slice(0, volIdx);
      const succeedingVolumes = novel.volumes.slice(volIdx + 1);

      const precedingVolumesContext = precedingVolumes
        .map((v) => `第${v.volumeNumber}卷【${v.volumeTitle}】概要: ${v.summary || '无'}`)
        .join('\n');

      const succeedingVolumesContext = succeedingVolumes
        .map((v) => `第${v.volumeNumber}卷【${v.volumeTitle}】概要: ${v.summary || '无'}`)
        .join('\n');

      const data = await callAiApi('/api/ai/recast-volume', {
        title: novel.title,
        genre: novel.genre,
        logline: novel.logline,
        worldBuilding: novel.worldBuilding,
        characters: novel.characters,
        targetVolume: {
          volumeNumber: recastingVolume.volumeNumber,
          volumeTitle: recastingVolume.volumeTitle,
          summary: recastingVolume.summary,
          chapters: recastingVolume.chapters.map((c) => ({
            chapterNumber: c.chapterNumber,
            title: c.title,
            summary: c.summary,
          })),
        },
        precedingVolumesContext,
        succeedingVolumesContext,
        recastPrompt,
        chapterCount: recastChapterCount,
        tone: novel.tone,
        apiKey,
        model,
        customBaseUrl,
        useChatCompletions,
      });

      if (!data.success) {
        throw new Error(data.error || '重铸本卷大纲失败');
      }

      const recastData = data.data || {};
      const newVolTitle = recastData.volumeTitle || recastingVolume.volumeTitle;
      const newVolSummary = recastData.summary || recastingVolume.summary;
      const newChaptersFromAi = recastData.chapters || [];

      const updatedChapters: Chapter[] = newChaptersFromAi.map((ch: any, cIdx: number) => {
        const existingChap = recastingVolume.chapters[cIdx];
        return {
          id: existingChap?.id || `chap-${Date.now()}-${recastingVolume.id}-${cIdx}`,
          chapterNumber: ch.chapterNumber || cIdx + 1,
          title: ch.title || `第${cIdx + 1}章`,
          summary: ch.summary || '',
          content: existingChap?.content || '',
          wordCount: existingChap?.wordCount || 0,
          status: existingChap?.status || ('draft' as const),
        };
      });

      const updatedVolumes = novel.volumes.map((v) => {
        if (v.id === recastingVolume.id) {
          return {
            ...v,
            volumeTitle: newVolTitle,
            summary: newVolSummary,
            chapters: updatedChapters,
          };
        }
        return v;
      });

      onUpdateNovel({
        ...novel,
        volumes: updatedVolumes,
        updatedAt: new Date().toISOString(),
      });

      setRecastingVolume(null);
      setRecastPrompt('');
    } catch (err: any) {
      console.error(err);
      setRecastError(err.message || '重铸卷大纲时发生错误，请重试。');
    } finally {
      setIsRecasting(false);
    }
  };

  // Manual Edit Volume submit
  const handleSaveVolumeEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolume) return;

    const updatedVolumes = novel.volumes.map((v) => {
      if (v.id === editingVolume.id) {
        return {
          ...v,
          volumeTitle: editingVolume.volumeTitle,
          summary: editingVolume.summary,
        };
      }
      return v;
    });

    onUpdateNovel({ ...novel, volumes: updatedVolumes, updatedAt: new Date().toISOString() });
    setEditingVolume(null);
  };

  // Manual Edit Chapter submit
  const handleSaveChapterEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapterModal) return;

    const updatedVolumes = novel.volumes.map((v) => {
      if (v.id === editingChapterModal.volId) {
        return {
          ...v,
          chapters: v.chapters.map((c) => {
            if (c.id === editingChapterModal.chapId) {
              return {
                ...c,
                title: editingChapterModal.title,
                summary: editingChapterModal.summary,
              };
            }
            return c;
          }),
        };
      }
      return v;
    });

    onUpdateNovel({ ...novel, volumes: updatedVolumes, updatedAt: new Date().toISOString() });
    setEditingChapterModal(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left 2 Cols: Outline View & Volumes List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-xs gap-4">
            <div className="flex items-center space-x-3 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-stone-900">分卷与章节大纲目录</h2>
                <p className="text-xs text-stone-500">规划全书分卷与章节剧情大纲，点击章节可直接跳转至正文写作</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleReorderChapters}
                className="inline-flex items-center px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs sm:text-sm font-semibold rounded-xl transition-colors space-x-1.5 cursor-pointer"
                title="一键将全书所有章节按序号从小到大重排并规范重新编号"
              >
                <Layers className="w-4 h-4 text-stone-600" />
                <span>一键顺排章节</span>
              </button>
              
              <button
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedChapterIds(new Set());
                }}
                className={`inline-flex items-center px-3 py-2 border text-xs sm:text-sm font-semibold rounded-xl transition-colors space-x-1.5 cursor-pointer ${
                  selectionMode ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>{selectionMode ? '退出选择' : '选择章节'}</span>
              </button>

              {selectionMode && selectedChapterIds.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleGroupSelectedChaptersToNewVolume}
                    className="inline-flex items-center px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs sm:text-sm font-semibold rounded-xl transition-colors space-x-1.5 cursor-pointer"
                    title="将选中的章节归纳为新卷"
                  >
                    <FolderPlus className="w-4 h-4 text-amber-600" />
                    <span>归纳新卷</span>
                  </button>
                </div>
              )}
              {novel.volumes.length > 1 && (
                <button
                  onClick={() => setDissolveAllModalOpen(true)}
                  className="inline-flex items-center px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs sm:text-sm font-semibold rounded-xl transition-colors space-x-1.5 cursor-pointer"
                  title="取消全书分卷，合并为单一分卷（章节正文完整保留）"
                >
                  <FolderMinus className="w-4 h-4 text-stone-600" />
                  <span>取消全书分卷</span>
                </button>
              )}
              <button
                onClick={() => {
                  setSidebarMode('extend');
                  const el = document.getElementById('ai-architect-sidebar');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors space-x-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>续接大纲</span>
              </button>
              <button
                onClick={() => setIsAddingVolume(true)}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors space-x-2"
              >
                <FolderPlus className="w-4 h-4" />
                <span>添加新卷</span>
              </button>
            </div>
          </div>

          {/* Add Volume Form */}
          {isAddingVolume && (
            <div className="bg-white p-6 rounded-2xl border border-amber-300 shadow-md space-y-4">
              <h3 className="font-bold text-stone-900 text-base">添加分卷</h3>
              <form onSubmit={handleAddVolume} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">分卷标题</label>
                  <input
                    type="text"
                    value={newVolTitle}
                    onChange={(e) => setNewVolTitle(e.target.value)}
                    placeholder="例如: 第二卷 宗门大比与秘境风云"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">分卷剧情概要</label>
                  <textarea
                    rows={2}
                    value={newVolSummary}
                    onChange={(e) => setNewVolSummary(e.target.value)}
                    placeholder="简述本卷的核心冲突、转折点与结局..."
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsAddingVolume(false)}
                    className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-sm font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium"
                  >
                    确认添加
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Volumes List */}
          <div className="space-y-6">
            {novel.volumes.map((vol) => (
              <div key={vol.id} className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="bg-stone-50 p-6 border-b border-stone-200 flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded">
                        第 {vol.volumeNumber} 卷
                      </span>
                      <h3 className="text-lg font-bold text-stone-900">{vol.volumeTitle}</h3>
                    </div>
                    {vol.summary && <p className="text-xs text-stone-600 mt-1">{vol.summary}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setRecastingVolume(vol);
                        setRecastPrompt('');
                        setRecastChapterCount(vol.chapters.length > 0 ? vol.chapters.length : 5);
                        setRecastError(null);
                      }}
                      className="inline-flex items-center px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer space-x-1"
                      title="使用 AI 重置或按指令重铸精修本卷大纲"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>AI 重铸本卷大纲</span>
                    </button>
                    <button
                      onClick={() => setEditingVolume({ id: vol.id, volumeTitle: vol.volumeTitle, summary: vol.summary })}
                      className="inline-flex items-center p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 rounded-lg transition-colors cursor-pointer"
                      title="手动修改本卷标题与概要"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {novel.volumes.length > 1 && (
                      <button
                        onClick={() => {
                          setDissolvingVolume(vol);
                          const otherVols = novel.volumes.filter((v) => v.id !== vol.id);
                          if (otherVols.length > 0) {
                            setTargetMergeVolId(otherVols[0].id);
                          }
                        }}
                        className="inline-flex items-center px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200/80 text-stone-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer space-x-1 border border-stone-200"
                        title="取消/解散本卷（保留本卷全部章节，合并入相邻分卷）"
                      >
                        <FolderMinus className="w-3.5 h-3.5 text-stone-600" />
                        <span>取消/解散分卷</span>
                      </button>
                    )}
                    <button
                      onClick={() => setIsAddingChapter(vol.id)}
                      className="inline-flex items-center px-3 py-1.5 bg-white border border-stone-300 text-xs font-medium rounded-lg text-stone-700 hover:bg-stone-100 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      添加章节
                    </button>
                    <button
                      onClick={() => setConfirmDeleteTarget({ type: 'volume', volId: vol.id, title: vol.volumeTitle, chapterCount: vol.chapters.length })}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="删除此卷"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Chapters list */}
                <div className="divide-y divide-stone-100">
                  {sortChapters(vol.chapters).map((chap) => (
                    <div
                      key={chap.id}
                      className="p-4 sm:px-6 flex items-center justify-between hover:bg-stone-50/80 transition-colors group"
                    >
                      {selectionMode && (
                        <div className="flex items-center space-x-3 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedChapterIds.has(chap.id)}
                            onChange={() => {
                              setSelectedChapterIds(prev => {
                                const next = new Set(prev);
                                if (next.has(chap.id)) next.delete(chap.id);
                                else next.add(chap.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <div
                        className="flex-1 cursor-pointer pr-4"
                        onClick={() => {
                          onSelectChapter(chap.id);
                          setActiveTab('editor');
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-xs font-semibold text-stone-400 w-12">
                            #{getEffectiveChapterNumber(chap)}
                          </span>
                          <h4 className="text-sm font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                            {chap.title}
                          </h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              getPureWordCount(chap.content) > 200
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {getPureWordCount(chap.content) > 200 ? '已完成' : '草稿'}
                          </span>
                          <span className="text-xs text-stone-400">
                            ({getPureWordCount(chap.content).toLocaleString()} 字)
                          </span>
                        </div>
                        {chap.summary && (
                          <p className="text-xs text-stone-500 mt-1 pl-15 line-clamp-1">{chap.summary}</p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => setEditingChapterModal({ volId: vol.id, chapId: chap.id, title: chap.title, summary: chap.summary })}
                          className="p-1.5 text-stone-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="编辑章节大纲"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            onSelectChapter(chap.id);
                            setActiveTab('editor');
                          }}
                          className="inline-flex items-center px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-medium rounded-lg transition-colors space-x-1 cursor-pointer"
                        >
                          <PenTool className="w-3.5 h-3.5" />
                          <span>写作</span>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteTarget({ type: 'chapter', volId: vol.id, chapId: chap.id, title: chap.title })}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="删除章节"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {vol.chapters.length === 0 && (
                    <div className="p-8 text-center text-stone-400 text-xs">
                      本卷暂无章节，点击上方“添加章节”开始规划
                    </div>
                  )}
                </div>

                {/* Add Chapter Inline Modal/Form */}
                {isAddingChapter === vol.id && (
                  <div className="p-6 bg-stone-50 border-t border-stone-200 space-y-4">
                    <h4 className="font-bold text-stone-900 text-sm">在【{vol.volumeTitle}】中添加新章节</h4>
                    <form onSubmit={(e) => handleAddChapter(vol.id, e)} className="space-y-3">
                      <input
                        type="text"
                        value={newChapTitle}
                        onChange={(e) => setNewChapTitle(e.target.value)}
                        placeholder="章节标题，例如：第4章 绝境反击与系统升级"
                        className="w-full rounded-xl border border-stone-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                        required
                      />
                      <textarea
                        rows={2}
                        value={newChapSummary}
                        onChange={(e) => setNewChapSummary(e.target.value)}
                        placeholder="章节剧情大纲，例如：主角陷入机械狼合围，绝境中芯片再次解析，爆发出雷霆一击……"
                        className="w-full rounded-xl border border-stone-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                      />
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingChapter(null)}
                          className="px-3 py-1.5 border border-stone-300 rounded-lg text-stone-700 text-xs font-medium bg-white"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium"
                        >
                          保存章节
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: AI Novel Architect Generator & Extender */}
        <div className="lg:col-span-1" id="ai-architect-sidebar">
          <div className="sticky top-8 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-5">
            {/* Tab Toggle */}
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSidebarMode('extend')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  sidebarMode === 'extend'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>续接后续大纲</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarMode('create')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  sidebarMode === 'create'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <span>全新生成大纲</span>
              </button>
            </div>

            {sidebarMode === 'extend' ? (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900">AI 续接大纲助手</h3>
                    <p className="text-xs text-stone-500">
                      学习《{novel.title || '当前作品'}》前文已有 {novel.volumes.length} 卷剧情，智能续写后续分卷
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                    {error}
                  </div>
                )}

                <form onSubmit={handleExtendOutline} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                      核心创意与灵感 (续接走向)
                    </label>
                    <textarea
                      rows={3}
                      value={extendPrompt}
                      onChange={(e) => setExtendPrompt(e.target.value)}
                      placeholder="例如：主角突破到元婴期后前往中州，参加天骄大会，并探索古老遗迹寻觅镇神鼎……"
                      className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                      预估篇幅 (可自定义)
                    </label>
                    <input
                      type="text"
                      value={extendTargetLength}
                      onChange={(e) => setExtendTargetLength(e.target.value)}
                      placeholder="例如：中篇 (100万字)"
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
                      required
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['短篇 (30万字)', '中篇 (100万字)', '长篇 (200万字+)', '超长篇 (500万字)'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setExtendTargetLength(p)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            extendTargetLength === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
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
                      value={extendTone}
                      onChange={(e) => setExtendTone(e.target.value)}
                      placeholder="例如：热血爽快、节奏明快"
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
                      required
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['热血爽快、节奏明快', '细腻文风、注重情感', '严谨烧脑、多重反转', '轻松幽默、日常治愈'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setExtendTone(p)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            extendTone === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {p.split('、')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                      分卷与章节标题风格 (防文邹邹 / 可自定义)
                    </label>
                    <input
                      type="text"
                      value={extendTitleStyle}
                      onChange={(e) => setExtendTitleStyle(e.target.value)}
                      placeholder="例如：通俗白话风、脑洞爽文风..."
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
                      required
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['通俗白话风 (接地气、直白叙述)', '经典网文风 (大气、古典修真)', '脑洞爽文风 (极致吸睛、快节奏)', '轻松幽默风 (梗向、日常吐槽)'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setExtendTitleStyle(p)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            extendTitleStyle === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {p.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume and chapter counts for extending */}
                  <div className="space-y-4 pt-3 border-t border-stone-200">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                        生成续接分卷数量
                      </label>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setExtendVolumeCount(prev => Math.max(1, prev - 1))}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={extendVolumeCount}
                          onChange={(e) => setExtendVolumeCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 h-8 rounded-lg border border-stone-300 text-center text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                        />
                        <button
                          type="button"
                          onClick={() => setExtendVolumeCount(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-0.5 rounded">
                          续接 {extendVolumeCount} 卷
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                        每卷章节数量
                      </label>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setExtendChapterCount(prev => Math.max(1, prev - 1))}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={extendChapterCount}
                          onChange={(e) => setExtendChapterCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 h-8 rounded-lg border border-stone-300 text-center text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                        />
                        <button
                          type="button"
                          onClick={() => setExtendChapterCount(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-0.5 rounded">
                          每卷 {extendChapterCount} 章
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isExtending}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 text-sm cursor-pointer"
                  >
                    {isExtending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI 正在分析前文并续接大纲...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ 一键续接后续剧情大纲</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900">AI 智能小说架构师</h3>
                    <p className="text-xs text-stone-500">输入一句话灵感，一键生成全新小说大纲与目录</p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
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
                      className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none bg-stone-50/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                      小说流派 (可自定义)
                    </label>
                    <input
                      type="text"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      placeholder="例如：玄幻修真、科幻机甲..."
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
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
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
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
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
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

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                      分卷与章节标题风格 (防文邹邹 / 可自定义)
                    </label>
                    <input
                      type="text"
                      value={titleStyle}
                      onChange={(e) => setTitleStyle(e.target.value)}
                      placeholder="例如：通俗白话风、脑洞爽文风..."
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50"
                      required
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['通俗白话风 (接地气、直白叙述)', '经典网文风 (大气、古典修真)', '脑洞爽文风 (极致吸睛、快节奏)', '轻松幽默风 (梗向、日常吐槽)'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTitleStyle(p)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            titleStyle === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {p.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom structure: volumes and chapters counts */}
                  <div className="space-y-4 pt-3 border-t border-stone-200">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                        生成分卷数量
                      </label>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setVolumeCount(prev => Math.max(1, prev - 1))}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={volumeCount}
                          onChange={(e) => setVolumeCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 h-8 rounded-lg border border-stone-300 text-center text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                        />
                        <button
                          type="button"
                          onClick={() => setVolumeCount(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-0.5 rounded">
                          共 {volumeCount} 卷
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                        每卷章节数量
                      </label>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setChapterCount(prev => Math.max(1, prev - 1))}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={chapterCount}
                          onChange={(e) => setChapterCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 h-8 rounded-lg border border-stone-300 text-center text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white text-stone-800"
                        />
                        <button
                          type="button"
                          onClick={() => setChapterCount(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 transition-all font-bold text-base select-none cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-xs text-amber-700 font-semibold bg-amber-50/70 border border-amber-100/50 px-2 py-0.5 rounded">
                          每卷 {chapterCount} 章
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Target Option Selector */}
                  <div className="pt-3 border-t border-stone-200">
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      生成目标模式
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetOption('new')}
                        className={`p-2.5 rounded-xl border text-left flex items-start space-x-2.5 transition-all cursor-pointer ${
                          targetOption === 'new'
                            ? 'bg-amber-500/10 border-amber-500 text-amber-900 ring-2 ring-amber-500/30'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          targetOption === 'new' ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300 bg-white'
                        }`}>
                          {targetOption === 'new' && <div className="w-1 h-1 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold">生成全新小说（默认）</div>
                          <div className="text-[10px] text-stone-500 mt-0.5">在书架新建一本新的小说作品并自动切换</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTargetOption('current')}
                        className={`p-2.5 rounded-xl border text-left flex items-start space-x-2.5 transition-all cursor-pointer ${
                          targetOption === 'current'
                            ? 'bg-amber-500/10 border-amber-500 text-amber-900 ring-2 ring-amber-500/30'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          targetOption === 'current' ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300 bg-white'
                        }`}>
                          {targetOption === 'current' && <div className="w-1 h-1 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold">覆盖更新当前本书</div>
                          <div className="text-[10px] text-stone-500 mt-0.5">直接更新当前《{novel.title}》的全书设定与大纲</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 text-sm cursor-pointer"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI 正在全盘构思全书大纲...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {targetOption === 'new' ? '一键 AI 生成全新小说' : `一键覆盖更新当前《${novel.title}》`}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Volume / Chapter Deletion */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-base font-bold text-stone-900">
                  {confirmDeleteTarget.type === 'volume' ? '操作分卷' : '确认删除章节？'}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {confirmDeleteTarget.type === 'volume' ? (
                    <>
                      您选中了 <span className="font-bold text-stone-900">【{confirmDeleteTarget.title}】</span>（内含 {confirmDeleteTarget.chapterCount || 0} 个章节）。
                      <span className="block mt-2 text-stone-600">
                        您可以选择<b>仅取消/解散分卷</b>（章节保留并转移）或<b>彻底删除本卷及所有章节</b>：
                      </span>
                    </>
                  ) : (
                    <>
                      您确定要删除章节 <span className="font-bold text-stone-900">【{confirmDeleteTarget.title}】</span> 吗？
                      <span className="block mt-1 text-stone-500">
                        删除后，该章节的正文内容和草稿将无法恢复。
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="w-full sm:w-auto px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors cursor-pointer text-center"
              >
                取消
              </button>

              {confirmDeleteTarget.type === 'volume' && novel.volumes.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const volToDissolve = novel.volumes.find(v => v.id === confirmDeleteTarget.volId);
                    if (volToDissolve) {
                      setDissolvingVolume(volToDissolve);
                      const otherVols = novel.volumes.filter(v => v.id !== confirmDeleteTarget.volId);
                      if (otherVols.length > 0) setTargetMergeVolId(otherVols[0].id);
                    }
                    setConfirmDeleteTarget(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1"
                >
                  <FolderMinus className="w-3.5 h-3.5 mr-1" />
                  <span>解散分卷（保留章节）</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteTarget.type === 'volume') {
                    handleDeleteVolume(confirmDeleteTarget.volId);
                  } else if (confirmDeleteTarget.type === 'chapter' && confirmDeleteTarget.chapId) {
                    handleDeleteChapter(confirmDeleteTarget.volId, confirmDeleteTarget.chapId);
                  }
                  setConfirmDeleteTarget(null);
                }}
                className="w-full sm:w-auto px-4.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>{confirmDeleteTarget.type === 'volume' ? '彻底删除本卷及章节' : '确认删除'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dissolve / Cancel Single Volume Modal */}
      {dissolvingVolume && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <FolderMinus className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    取消/解散【第 {dissolvingVolume.volumeNumber} 卷】
                  </h3>
                  <p className="text-xs text-stone-500 line-clamp-1">
                    卷名：{dissolvingVolume.volumeTitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDissolvingVolume(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-stone-600 leading-relaxed">
                解散分卷后，本卷包含的 <strong className="text-amber-800">{dissolvingVolume.chapters.length} 个章节</strong> 将自动转移保存至您选择的目标分卷中，章节正文与大纲不会丢弃。
              </p>

              {novel.volumes.filter((v) => v.id !== dissolvingVolume.id).length > 0 ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    请选择接收章节的目标分卷
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {novel.volumes
                      .filter((v) => v.id !== dissolvingVolume.id)
                      .map((vol) => (
                        <button
                          type="button"
                          key={vol.id}
                          onClick={() => setTargetMergeVolId(vol.id)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                            targetMergeVolId === vol.id
                              ? 'bg-amber-50 border-amber-500 text-amber-900 ring-1 ring-amber-500/30'
                              : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                              第 {vol.volumeNumber} 卷
                            </span>
                            <span className="text-xs font-bold">{vol.volumeTitle}</span>
                          </div>
                          <span className="text-[11px] text-stone-500">
                            (现有 {vol.chapters.length} 章)
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  全书仅剩最后一卷，无法继续合并至其他分卷。
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDissolvingVolume(null)}
                className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              {novel.volumes.filter((v) => v.id !== dissolvingVolume.id).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (targetMergeVolId) {
                      handleDissolveVolume(dissolvingVolume.id, targetMergeVolId);
                    }
                  }}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <FolderMinus className="w-3.5 h-3.5 mr-1" />
                  <span>确认解散分卷并合并章节</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dissolve All Volumes Modal */}
      {dissolveAllModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <FolderMinus className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-base font-bold text-stone-900">
                  取消全书分卷（合并为单卷）
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  确定要取消全书的 <strong className="text-stone-900">{novel.volumes.length} 个分卷划分</strong> 吗？
                  <span className="block mt-2 text-stone-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80">
                    💡 提示：此操作会将全书共 <strong>{novel.volumes.reduce((acc, v) => acc + v.chapters.length, 0)} 个章节</strong> 统一归入【第 1 卷】正文目录中，章节序号将重新按全局顺排，<strong>所有正文内容和草稿绝不会丢失！</strong>
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDissolveAllModalOpen(false)}
                className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDissolveAllVolumes}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <FolderMinus className="w-3.5 h-3.5 mr-1" />
                <span>确认取消全书分卷</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Recast Specific Volume Modal */}
      {recastingVolume && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    AI 重铸【第 {recastingVolume.volumeNumber} 卷】大纲
                  </h3>
                  <p className="text-xs text-stone-500 line-clamp-1">
                    原卷名：{recastingVolume.volumeTitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecastingVolume(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recastError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {recastError}
              </div>
            )}

            <form onSubmit={handleRecastVolumeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  重铸或调整诉求 (针对本卷的精修指令)
                </label>
                <textarea
                  rows={3}
                  value={recastPrompt}
                  onChange={(e) => setRecastPrompt(e.target.value)}
                  placeholder="例如：把本卷的核心高潮改为宗门秘境试炼；增加主角与反派暗中较量的剧情；加强反转与爽点..."
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none bg-stone-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  重铸后本卷章节数量
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setRecastChapterCount((prev) => Math.max(3, prev - 1))}
                    className="w-8 h-8 rounded-lg border border-stone-300 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-100"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={recastChapterCount}
                    onChange={(e) => setRecastChapterCount(parseInt(e.target.value, 10) || 5)}
                    className="w-20 text-center rounded-lg border border-stone-300 py-1.5 text-sm font-bold bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setRecastChapterCount((prev) => Math.min(30, prev + 1))}
                    className="w-8 h-8 rounded-lg border border-stone-300 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-100"
                  >
                    +
                  </button>
                  <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    本卷规划 {recastChapterCount} 章
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {[5, 8, 10, 12, 15].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setRecastChapterCount(cnt)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-lg border transition-colors ${
                        recastChapterCount === cnt
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {cnt} 章
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                💡 <strong>提示：</strong>AI 将结合全书背景与前后卷剧情，根据您的精修指令重新重铸第 {recastingVolume.volumeNumber} 卷的标题、卷概要及 {recastChapterCount} 个章节的大纲。已有正文的章节内容将被完整保留。
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setRecastingVolume(null)}
                  disabled={isRecasting}
                  className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isRecasting}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isRecasting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>正在重铸本卷大纲...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ 一键 AI 重铸本卷大纲</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Volume Info Edit Modal */}
      {editingVolume && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">修改分卷信息</h3>
              <button
                type="button"
                onClick={() => setEditingVolume(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVolumeEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">分卷标题</label>
                <input
                  type="text"
                  value={editingVolume.volumeTitle}
                  onChange={(e) => setEditingVolume({ ...editingVolume, volumeTitle: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">分卷剧情概要</label>
                <textarea
                  rows={4}
                  value={editingVolume.summary}
                  onChange={(e) => setEditingVolume({ ...editingVolume, summary: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  placeholder="填写本卷的剧情脉络、高潮与转折点..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingVolume(null)}
                  className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Chapter Info Edit Modal */}
      {editingChapterModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">修改章节大纲</h3>
              <button
                type="button"
                onClick={() => setEditingChapterModal(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveChapterEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">章节标题</label>
                <input
                  type="text"
                  value={editingChapterModal.title}
                  onChange={(e) => setEditingChapterModal({ ...editingChapterModal, title: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">章节剧情概要</label>
                <textarea
                  rows={4}
                  value={editingChapterModal.summary}
                  onChange={(e) => setEditingChapterModal({ ...editingChapterModal, summary: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  placeholder="描述本章的细致要点、冲突事件、登场角色与结局钩子..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingChapterModal(null)}
                  className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
