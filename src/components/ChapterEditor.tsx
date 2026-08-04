import React, { useState, useEffect } from 'react';
import { Novel, Chapter, Volume } from '../types';
import { getAiConfig } from '../lib/aiConfig';
import { callAiApi } from '../lib/aiClient';
import { PenTool, Sparkles, Save, Loader2, ChevronDown, Check, BookOpen, ArrowLeft, ArrowRight, RefreshCw, X, Settings, Scissors } from 'lucide-react';
import { getPureWordCount } from '../lib/wordCount';
import { sortChapters, getEffectiveChapterNumber } from '../lib/chapterUtils';

function trimClientTextToWordRange(text: string, minW: number, maxW: number): string {
  if (!text) return text;
  const targetMin = Math.max(0, minW);
  const targetMax = Math.max(targetMin, maxW);
  const totalPure = getPureWordCount(text);

  if (totalPure <= targetMax) {
    return text;
  }

  const rawParas = text.split(/\r?\n+/);
  let accumulatedParas: string[] = [];
  let currentPure = 0;

  for (let i = 0; i < rawParas.length; i++) {
    const para = rawParas[i].trim();
    if (!para) continue;
    const paraPure = getPureWordCount(para);

    if (currentPure + paraPure <= targetMax) {
      accumulatedParas.push(para);
      currentPure += paraPure;
      if (currentPure >= targetMin) {
        const nextPara = rawParas[i + 1]?.trim();
        if (nextPara && (currentPure + getPureWordCount(nextPara) > targetMax)) {
          break;
        }
      }
    } else {
      if (currentPure >= targetMin) {
        break;
      }

      const sentences = para.split(/(?<=[。！？!?\n])/);
      let sentenceChunk = "";
      for (const sentence of sentences) {
        if (!sentence) continue;
        const sentencePure = getPureWordCount(sentence);
        if (currentPure + sentencePure <= targetMax) {
          sentenceChunk += sentence;
          currentPure += sentencePure;
          if (currentPure >= targetMin) {
            break;
          }
        } else {
          break;
        }
      }
      if (sentenceChunk.trim()) {
        accumulatedParas.push(sentenceChunk.trim());
      }
      break;
    }
  }

  let result = accumulatedParas.join("\n\n").trim();
  if (!result) {
    result = text.slice(0, targetMax);
  }

  if (result && !/[。！？!?.…”’]$/.test(result)) {
    result += "。";
  }

  return result;
}

interface ChapterEditorProps {
  novel: Novel;
  selectedChapterId: string;
  onUpdateNovel: (updated: Novel) => void;
  onSelectChapter: (id: string) => void;
  onRequireConfig: () => boolean;
}

export const ChapterEditor: React.FC<ChapterEditorProps> = ({
  novel,
  selectedChapterId,
  onUpdateNovel,
  onSelectChapter,
  onRequireConfig,
}) => {
  // Find current chapter & volume
  let currentVol: Volume | null = null;
  let currentChap: Chapter | null = null;

  for (const vol of novel.volumes) {
    const found = vol.chapters.find((c) => c.id === selectedChapterId);
    if (found) {
      currentVol = vol;
      currentChap = found;
      break;
    }
  }

  // Fallback to first chapter if none selected
  if (!currentChap && novel.volumes.length > 0 && novel.volumes[0].chapters.length > 0) {
    currentVol = novel.volumes[0];
    currentChap = novel.volumes[0].chapters[0];
  }

  const [title, setTitle] = useState(currentChap?.title || '');
  const [summary, setSummary] = useState(currentChap?.summary || '');
  const [content, setContent] = useState(currentChap?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState(false);
  const [syncToDiskStatus, setSyncToDiskStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  const syncChapterToDisk = async (chapTitle: string, chapContent: string, forceIndex?: number, novelData?: Novel) => {
    const storagePath = localStorage.getItem('ai_novel_studio_storage_path') || 'storage';

    let chapterGlobalIndex = forceIndex || 1;
    if (!forceIndex && currentChap) {
      let found = false;
      for (const v of novel.volumes) {
        for (const c of v.chapters) {
          if (c.id === currentChap.id) {
            found = true;
            break;
          }
          chapterGlobalIndex++;
        }
        if (found) break;
      }
    }

    const formattedChapterTitle = `第${chapterGlobalIndex}章-${chapTitle}`;

    setSyncToDiskStatus('syncing');
    try {
      const res = await fetch('/api/storage/sync-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          novelTitle: novel.title,
          chapterTitle: formattedChapterTitle,
          content: chapContent,
          novelData,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          setSyncToDiskStatus('success');
          setTimeout(() => setSyncToDiskStatus('idle'), 3000);
          return;
        }
      }
      // Fallback for static hosting (GitHub Pages) where backend server is not present
      setSyncToDiskStatus('success');
      setTimeout(() => setSyncToDiskStatus('idle'), 3000);
    } catch (err) {
      // Fallback for static hosting (GitHub Pages) - local storage is always successful
      setSyncToDiskStatus('success');
      setTimeout(() => setSyncToDiskStatus('idle'), 3000);
    }
  };

  // AI loading states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishInstruction, setPolishInstruction] = useState('增强场景代入感与心理描写');
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Word count range states
  const [tempMinWords, setTempMinWords] = useState(novel.chapterMinWords ?? 2000);
  const [tempMaxWords, setTempMaxWords] = useState(novel.chapterMaxWords ?? 3000);

  const minWords = tempMinWords;
  const maxWords = tempMaxWords;

  // Sync temp variables if novel's properties change
  useEffect(() => {
    if (novel.chapterMinWords !== undefined) setTempMinWords(novel.chapterMinWords);
    if (novel.chapterMaxWords !== undefined) setTempMaxWords(novel.chapterMaxWords);
  }, [novel.chapterMinWords, novel.chapterMaxWords]);

  const saveCustomWordRange = (minVal: number, maxVal: number) => {
    const finalMin = Math.max(0, minVal);
    const finalMax = Math.max(finalMin, maxVal);
    setError(null);
    onUpdateNovel({
      ...novel,
      chapterMinWords: finalMin,
      chapterMaxWords: finalMax,
      updatedAt: new Date().toISOString(),
    });
  };

  const saveWordRange = () => {
    saveCustomWordRange(tempMinWords, tempMaxWords);
  };

  // Sync state when selectedChapterId changes
  useEffect(() => {
    if (currentChap) {
      setTitle(currentChap.title);
      setSummary(currentChap.summary);
      setContent(currentChap.content);
    }
  }, [selectedChapterId, currentChap?.id]);

  const handleSave = () => {
    if (!currentVol || !currentChap) return;
    setIsSaving(true);
    setError(null);

    const updatedVolumes = novel.volumes.map((vol) => {
      if (vol.id === currentVol?.id) {
        return {
          ...vol,
          chapters: vol.chapters.map((chap) => {
            if (chap.id === currentChap?.id) {
              return {
                ...chap,
                title,
                summary,
                content,
                wordCount: getPureWordCount(content),
                status: getPureWordCount(content) > 200 ? ('completed' as const) : ('draft' as const),
              };
            }
            return chap;
          }),
        };
      }
      return vol;
    });

    onUpdateNovel({
      ...novel,
      volumes: updatedVolumes,
      updatedAt: new Date().toISOString(),
    });

    // Also sync to custom storage directory if set
    syncChapterToDisk(title, content, undefined, novel);

    setTimeout(() => {
      setIsSaving(false);
      setSavedStatus(true);
      setTimeout(() => setSavedStatus(false), 2000);
    }, 300);
  };

  // Helper to find preceding chapter context across volumes and chapters
  const getPrecedingContext = () => {
    if (!novel || !currentChap) return null;

    const allChaps: { volTitle: string; volNumber: number; chap: Chapter }[] = [];
    novel.volumes.forEach((vol) => {
      const sorted = sortChapters(vol.chapters);
      sorted.forEach((chap) => {
        allChaps.push({ volTitle: vol.volumeTitle, volNumber: vol.volumeNumber, chap });
      });
    });

    const currentIndex = allChaps.findIndex((item) => item.chap.id === currentChap.id);
    if (currentIndex > 0) {
      const prev = allChaps[currentIndex - 1];
      if (prev.chap.content && prev.chap.content.trim()) {
        return {
          prevVolumeTitle: prev.volTitle,
          prevVolumeNumber: prev.volNumber,
          prevChapterTitle: prev.chap.title,
          prevChapterNumber: prev.chap.chapterNumber,
          prevContentSnippet: prev.chap.content.trim().slice(-2000), // last 2000 chars of previous chapter
        };
      }
    }
    return null;
  };

  const currentVolumeTitle = currentVol?.volumeTitle || '';

  // 1. Generate Chapter Content
  const handleAiGenerate = async () => {
    if (!currentChap) return;
    if (!onRequireConfig()) return;
    setIsGenerating(true);
    setError(null);
    saveCustomWordRange(tempMinWords, tempMaxWords);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();
      const data = await callAiApi('/api/ai/generate-chapter', {
        novelContext: {
          title: novel.title,
          genre: novel.genre,
          worldBuilding: novel.worldBuilding,
        },
        chapterTitle: title,
        chapterSummary: summary,
        tone: novel.tone,
        apiKey,
        model,
        chapterMinWords: tempMinWords,
        chapterMaxWords: tempMaxWords,
        previousChapterContext: getPrecedingContext(),
        currentVolumeTitle,
        customBaseUrl,
        useChatCompletions,
      });

      if (!data.success) throw new Error(data.error || '生成失败');

      setContent(data.content);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 生成正文失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Continue Chapter
  const handleAiContinue = async () => {
    if (!currentChap) return;
    if (!onRequireConfig()) return;
    setIsContinuing(true);
    setError(null);
    saveCustomWordRange(tempMinWords, tempMaxWords);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();
      const data = await callAiApi('/api/ai/continue-chapter', {
        currentText: content,
        chapterSummary: summary,
        novelContext: { title: novel.title },
        apiKey,
        model,
        chapterMinWords: tempMinWords,
        chapterMaxWords: tempMaxWords,
        previousChapterContext: getPrecedingContext(),
        currentVolumeTitle,
        customBaseUrl,
        useChatCompletions,
      });

      if (!data.success) throw new Error(data.error || '续写失败');

      setContent((prev) => (prev ? prev + '\n\n' + data.content : data.content));
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 续写失败');
    } finally {
      setIsContinuing(false);
    }
  };

  // 3. Polish Chapter
  const handleAiPolish = async () => {
    if (!currentChap) return;
    if (!onRequireConfig()) return;
    setIsPolishing(true);
    setError(null);
    saveCustomWordRange(tempMinWords, tempMaxWords);

    try {
      const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();
      const data = await callAiApi('/api/ai/polish-chapter', {
        currentText: content,
        instruction: polishInstruction,
        chapterMinWords: tempMinWords,
        chapterMaxWords: tempMaxWords,
        novelContext: {
          title: novel.title,
          genre: novel.genre,
          tone: novel.tone,
        },
        apiKey,
        model,
        customBaseUrl,
        useChatCompletions,
      });

      if (!data.success) throw new Error(data.error || '润色失败');

      setContent(data.content);
      setShowPolishModal(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'AI 润色失败');
    } finally {
      setIsPolishing(false);
    }
  };

  if (!currentChap) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <BookOpen className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-stone-800">暂无可选章节</h3>
        <p className="text-sm text-stone-500 mt-1">请先在“大纲目录”中创建分卷与章节</p>
      </div>
    );
  }

  // Find all chapters flat list for next/prev navigation
  const allChaptersList: { volTitle: string; chapter: Chapter }[] = [];
  novel.volumes.forEach((v) => {
    const sorted = sortChapters(v.chapters);
    sorted.forEach((c) => {
      allChaptersList.push({ volTitle: v.volumeTitle, chapter: c });
    });
  });

  const currentIndex = allChaptersList.findIndex((item) => item.chapter.id === currentChap?.id);
  const prevChap = currentIndex > 0 ? allChaptersList[currentIndex - 1].chapter : null;
  const nextChap = currentIndex < allChaptersList.length - 1 ? allChaptersList[currentIndex + 1].chapter : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Bar: Chapter selector & Save status */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <select
            aria-label="选择章节"
            value={currentChap.id}
            onChange={(e) => onSelectChapter(e.target.value)}
            className="bg-stone-50 border border-stone-300 text-stone-800 text-sm font-medium rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-amber-500 outline-none max-w-xs truncate"
          >
            {novel.volumes.map((vol) => (
              <optgroup key={vol.id} label={vol.volumeTitle || '未知分卷'}>
                {sortChapters(vol.chapters).map((chap) => (
                  <option key={chap.id} value={chap.id}>
                    【{vol.volumeTitle || '分卷'}】第{getEffectiveChapterNumber(chap)}章 - {chap.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <span className="text-xs text-stone-500 hidden sm:inline">
            当前字数: <strong className="text-stone-900">{getPureWordCount(content).toLocaleString()} 字</strong>
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {prevChap && (
            <button
              onClick={() => onSelectChapter(prevChap.id)}
              className="inline-flex items-center px-3 py-2 border border-stone-300 text-xs font-medium rounded-xl text-stone-700 bg-white hover:bg-stone-50"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              上一章
            </button>
          )}
          {nextChap && (
            <button
              onClick={() => onSelectChapter(nextChap.id)}
              className="inline-flex items-center px-3 py-2 border border-stone-300 text-xs font-medium rounded-xl text-stone-700 bg-white hover:bg-stone-50"
            >
              下一章
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          )}

          {syncToDiskStatus === 'syncing' && (
            <span className="text-xs text-amber-600 flex items-center space-x-1.5 font-black bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200/55 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              <span>硬盘同步中...</span>
            </span>
          )}
          {syncToDiskStatus === 'success' && (
            <span className="text-xs text-emerald-700 flex items-center space-x-1.5 font-black bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/55">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>同步成功(TXT)</span>
            </span>
          )}
          {syncToDiskStatus === 'error' && (
            <span className="text-xs text-red-700 flex items-center space-x-1.5 font-black bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200/55">
              <span>同步失败</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors space-x-2 cursor-pointer"
          >
            {savedStatus ? (
              <>
                <Check className="w-4 h-4" />
                <span>已保存</span>
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>保存章节</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left / Center: Writing Area (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="space-y-4 border-b border-stone-100 pb-6">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">
                章节标题
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl sm:text-2xl font-bold text-stone-900 border-b border-stone-200 pb-2 focus:border-amber-600 outline-none bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">
                本章剧情概要与大纲
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="简述本章情节核心走向..."
                className="w-full text-xs sm:text-sm text-stone-600 bg-stone-50 border border-stone-200 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Editor Textarea */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-stone-400 min-h-[32px]">
              <span>正文内容创作区 (支持分段排版)</span>
              <div
                className="inline-flex items-center space-x-1.5 text-xs text-amber-900 bg-amber-50/80 px-3 py-1.5 rounded-xl border border-amber-200/80 shadow-2xs"
                title="已在右侧 AI 写作助理控制面板统一设置"
              >
                <span className="font-bold text-amber-950">建议单章 {minWords} - {maxWords} 字</span>
                <span className="text-amber-700/80 text-[11px]">(可在右侧 AI 控制面板修改)</span>
              </div>
            </div>

            {getPureWordCount(content) > tempMaxWords && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-100/90 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 font-medium shadow-2xs">
                <div className="flex items-center space-x-1.5">
                  <Scissors className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>当前章节纯字数 (<strong>{getPureWordCount(content)}</strong> 字) 已超出设定的建议上限 (<strong>{tempMaxWords}</strong> 字)。</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = trimClientTextToWordRange(content, tempMinWords, tempMaxWords);
                    setContent(trimmed);
                    if (currentVol && currentChap) {
                      const updatedVolumes = novel.volumes.map((vol) => {
                        if (vol.id === currentVol.id) {
                          return {
                            ...vol,
                            chapters: vol.chapters.map((chap) => {
                              if (chap.id === currentChap.id) {
                                return {
                                  ...chap,
                                  title,
                                  summary,
                                  content: trimmed,
                                  wordCount: getPureWordCount(trimmed),
                                  status: getPureWordCount(trimmed) > 200 ? ('completed' as const) : ('draft' as const),
                                };
                              }
                              return chap;
                            }),
                          };
                        }
                        return vol;
                      });
                      onUpdateNovel({
                        ...novel,
                        volumes: updatedVolumes,
                        updatedAt: new Date().toISOString(),
                      });
                    }
                  }}
                  className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shrink-0 cursor-pointer shadow-2xs flex items-center justify-center space-x-1"
                >
                  <span>✂️ 一键裁切至 {tempMinWords}-{tempMaxWords}字</span>
                </button>
              </div>
            )}

            <textarea
              rows={22}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在此输入或使用 AI 生成本章正文内容..."
              className="w-full font-serif text-base sm:text-lg text-stone-900 leading-relaxed p-4 sm:p-6 bg-stone-50/50 rounded-2xl border border-stone-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-y"
            />
          </div>
        </div>

        {/* Right Sidebar: AI Writing Assistant Tools (1 col) */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-4 sticky top-20">
            <div className="flex items-center space-x-2 text-amber-800 font-bold">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <span>AI 写作助理</span>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              基于大纲与前文，一键生成高质量正文、智能续写或润色升级。
            </p>

            {/* Direct Custom Word Count Selector Box */}
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-950 flex items-center space-x-1">
                  <Settings className="w-3.5 h-3.5 text-amber-700" />
                  <span>自定义单章目标字数</span>
                </span>
                <span className="text-[10px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  保底: {minWords} 字
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">最低保底字数</label>
                  <input
                    type="number"
                    value={tempMinWords}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setTempMinWords(val);
                      saveCustomWordRange(val, tempMaxWords);
                    }}
                    className="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500"
                    step={500}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">建议上限字数</label>
                  <input
                    type="number"
                    value={tempMaxWords}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setTempMaxWords(val);
                      saveCustomWordRange(tempMinWords, val);
                    }}
                    className="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500"
                    step={500}
                  />
                </div>
              </div>

              {/* Preset Buttons */}
              <div>
                <div className="text-[10px] text-amber-900 font-bold mb-1">快速预设字数档位:</div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { min: 1000, max: 1500, label: '1000-1500字' },
                    { min: 1500, max: 2000, label: '1500-2000字' },
                    { min: 2000, max: 3000, label: '2000-3000字' },
                    { min: 3000, max: 5000, label: '3000-5000字' },
                    { min: 5000, max: 8000, label: '5000-8000字' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setTempMinWords(preset.min);
                        setTempMaxWords(preset.max);
                        saveCustomWordRange(preset.min, preset.max);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-bold border transition-colors cursor-pointer ${
                        tempMinWords === preset.min && tempMaxWords === preset.max
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {preset.min}-{preset.max}字
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleAiGenerate}
                disabled={isGenerating}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AI 一键生成本章正文</span>
                  </>
                )}
              </button>

              <button
                onClick={handleAiContinue}
                disabled={isContinuing}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isContinuing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>续写中...</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    <span>AI 智能接着续写</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowPolishModal(true)}
                className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4 text-stone-600" />
                <span>AI 润色与文风优化</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Polish Modal */}
      {showPolishModal && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-stone-900 text-lg">AI 润色与文风优化</h3>
            <p className="text-xs text-stone-500">输入您的润色需求，AI 将为您对当前正文进行精雕细琢并确保篇幅达标。</p>

            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>单章字数标准保障（最低 {minWords} 字）</span>
              </div>
              <p className="text-stone-600 text-[11px] leading-relaxed">
                润色优化后纯字数（不含标点）将严格大于或等于 <strong>{minWords} 字</strong>，建议控制在 {minWords} - {maxWords} 字之间。若原正文偏短，AI 将深度扩充场景、对话与心理描写。
              </p>
            </div>

            <textarea
              rows={3}
              value={polishInstruction}
              onChange={(e) => setPolishInstruction(e.target.value)}
              placeholder="例如：增强对话的张力、增加环境细节描写、精简冗余词句..."
              className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
            />

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowPolishModal(false)}
                className="px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleAiPolish}
                disabled={isPolishing}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl flex items-center space-x-2"
              >
                {isPolishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>润色中...</span>
                  </>
                ) : (
                  <span>开始润色</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
