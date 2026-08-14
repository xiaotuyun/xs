import React, { useState, useEffect, useMemo } from 'react';
import { Novel } from '../types';
import { Download, Copy, Check, FileText, Code, Archive, CheckSquare, Square, Book, Upload, Database } from 'lucide-react';
import JSZip from 'jszip';
import { sortChapters } from '../lib/chapterUtils';

interface ExportViewProps {
  allNovels: Novel[];
  currentNovelId: string;
  onImportNovel: (novel: Novel) => void;
}

const parseTxtToNovel = (text: string): Novel => {
  const lines = text.split('\n');
  
  const novel: Novel = {
    id: crypto.randomUUID(),
    title: '导入的小说',
    genre: '',
    targetLength: '',
    logline: '',
    tags: [],
    tone: '',
    worldBuilding: {
      background: '',
      powerSystem: '',
      factions: '',
      customItems: []
    },
    characters: [],
    volumes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let currentVolume: import('../types').Volume | null = null;
  let currentChapter: import('../types').Chapter | null = null;
  let readingState: 'meta' | 'logline' | 'volume' | 'chapter' = 'meta';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (readingState === 'meta' || readingState === 'logline') {
      if (line.startsWith('# ')) {
        novel.title = line.substring(2).trim();
        readingState = 'meta';
      } else if (line.startsWith('类型: ')) {
        const parts = line.split('|');
        novel.genre = parts[0].replace('类型: ', '').trim();
        if (parts.length > 1) {
          novel.targetLength = parts[1].replace('篇幅: ', '').trim();
        }
        readingState = 'meta';
      } else if (line.startsWith('简介: ')) {
        novel.logline = line.substring(3).trim();
        readingState = 'logline';
      } else if (line.startsWith('## ')) {
        readingState = 'volume';
        currentVolume = {
          id: crypto.randomUUID(),
          volumeNumber: novel.volumes.length + 1,
          volumeTitle: line.substring(3).trim(),
          summary: '',
          chapters: []
        };
        novel.volumes.push(currentVolume);
      } else if (readingState === 'logline') {
        if (line.startsWith('========================================')) {
          readingState = 'meta';
        } else {
          if (line.trim() !== '') {
            novel.logline += '\n' + line.trim();
          }
        }
      }
    } else if (readingState === 'volume' || readingState === 'chapter') {
      if (line.startsWith('## ')) {
        if (currentChapter) {
          currentChapter.content = currentChapter.content.trim();
          if (currentChapter.content === '(本章暂无正文)') {
            currentChapter.content = '';
          }
        }
        readingState = 'volume';
        currentVolume = {
          id: crypto.randomUUID(),
          volumeNumber: novel.volumes.length + 1,
          volumeTitle: line.substring(3).trim(),
          summary: '',
          chapters: []
        };
        novel.volumes.push(currentVolume);
        currentChapter = null;
      } else if (line.startsWith('### ')) {
        if (currentChapter) {
          currentChapter.content = currentChapter.content.trim();
          if (currentChapter.content === '(本章暂无正文)') {
            currentChapter.content = '';
          }
        }
        readingState = 'chapter';
        const rawTitle = line.substring(4).trim();
        const titleMatch = rawTitle.match(/^第\d+章-(.*)$/);
        const title = titleMatch ? titleMatch[1] : rawTitle;

        currentChapter = {
          id: crypto.randomUUID(),
          chapterNumber: currentVolume ? currentVolume.chapters.length + 1 : 1,
          title: title,
          summary: '',
          content: '',
          wordCount: 0,
          status: 'draft'
        };
        if (!currentVolume) {
          currentVolume = {
            id: crypto.randomUUID(),
            volumeNumber: 1,
            volumeTitle: '默认分卷',
            summary: '',
            chapters: []
          };
          novel.volumes.push(currentVolume);
        }
        currentVolume.chapters.push(currentChapter);
      } else if (line.startsWith('分卷概要: ') && readingState === 'volume') {
        if (currentVolume) {
          currentVolume.summary = line.substring(6).trim();
        }
      } else if (line.startsWith('本章概要: ') && readingState === 'chapter') {
        if (currentChapter) {
          currentChapter.summary = line.substring(6).trim();
        }
      } else if (line.startsWith('========================================')) {
        continue;
      } else if (line.startsWith('----------------------------------------')) {
        continue;
      } else {
        if (readingState === 'chapter' && currentChapter) {
          currentChapter.content += line + '\n';
        }
      }
    }
  }

  if (currentChapter) {
    currentChapter.content = currentChapter.content.trim();
    if (currentChapter.content === '(本章暂无正文)') {
      currentChapter.content = '';
    }
  }
  
  novel.volumes.forEach(vol => {
    vol.chapters.forEach(chap => {
      chap.wordCount = chap.content.length;
    });
  });

  return novel;
};

export const ExportView: React.FC<ExportViewProps> = ({ allNovels, currentNovelId, onImportNovel }) => {
  const [selectedNovelId, setSelectedNovelId] = useState<string>(currentNovelId || (allNovels[0]?.id || ''));
  const novel = useMemo(() => allNovels.find(n => n.id === selectedNovelId) || allNovels[0], [allNovels, selectedNovelId]);

  const [copied, setCopied] = useState(false);
  const [includeVolumeSummary, setIncludeVolumeSummary] = useState(true);
  const [includeChapterSummary, setIncludeChapterSummary] = useState(false);
  
  // Array of chapter IDs
  const allChapterIds = useMemo(() => novel ? novel.volumes.flatMap(v => v.chapters.map(c => c.id)) : [], [novel]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);

  useEffect(() => {
    setSelectedChapters(allChapterIds);
  }, [allChapterIds]);

  if (!novel) {
    return <div className="p-8 text-center text-stone-500">没有可以导出的作品</div>;
  }

  const handleToggleSelectAll = () => {
    if (selectedChapters.length === allChapterIds.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters([...allChapterIds]);
    }
  };

  const handleToggleChapter = (chapterId: string) => {
    if (selectedChapters.includes(chapterId)) {
      setSelectedChapters(selectedChapters.filter(id => id !== chapterId));
    } else {
      setSelectedChapters([...selectedChapters, chapterId]);
    }
  };

  const formatChapterTitle = (title: string, globalIndex: number) => {
    return `第${globalIndex}章-${title}`;
  };

  const generateChapterContent = (chap: any, globalIndex: number) => {
    let text = `### ${formatChapterTitle(chap.title, globalIndex)}\n\n`;
    if (includeChapterSummary && chap.summary) text += `本章概要: ${chap.summary}\n\n`;
    text += `${chap.content || '(本章暂无正文)'}\n\n`;
    return text;
  };

  const generateFullText = () => {
    let text = `# ${novel.title}\n\n`;
    text += `类型: ${novel.genre} | 篇幅: ${novel.targetLength}\n`;
    text += `简介: ${novel.logline}\n\n`;
    text += `========================================\n\n`;

    let globalIndex = 1;
    novel.volumes.forEach((vol) => {
      text += `## ${vol.volumeTitle}\n`;
      if (includeVolumeSummary && vol.summary) text += `分卷概要: ${vol.summary}\n\n`;

      vol.chapters.forEach((chap) => {
        if (selectedChapters.includes(chap.id)) {
          text += generateChapterContent(chap, globalIndex);
          text += `----------------------------------------\n\n`;
        }
        globalIndex++;
      });
    });

    return text;
  };

  const handleDownloadTxt = () => {
    const text = generateFullText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${novel.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(novel, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${novel.title}_backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllNovelsZip = async () => {
    const zip = new JSZip();
    
    allNovels.forEach((n) => {
      let text = `# ${n.title}\n\n`;
      text += `类型: ${n.genre} | 篇幅: ${n.targetLength}\n`;
      text += `简介: ${n.logline}\n\n`;
      text += `========================================\n\n`;

      let globalIndex = 1;
      n.volumes.forEach((vol) => {
        text += `## ${vol.volumeTitle}\n`;
        if (includeVolumeSummary && vol.summary) text += `分卷概要: ${vol.summary}\n\n`;

        vol.chapters.forEach((chap) => {
          text += `### 第${globalIndex}章-${chap.title}\n\n`;
          if (includeChapterSummary && chap.summary) text += `本章概要: ${chap.summary}\n\n`;
          text += `${chap.content || '(本章暂无正文)'}\n\n`;
          text += `----------------------------------------\n\n`;
          globalIndex++;
        });
      });
      
      const safeTitle = n.title.replace(/[\/\\:\*\?"<>\|]/g, "_") || "未命名书籍";
      zip.file(`${safeTitle}.txt`, text);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `所有书籍汇总.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllNovelsJsonZip = async () => {
    const zip = new JSZip();
    const datasFolder = zip.folder('data-json');
    if (!datasFolder) return;

    allNovels.forEach((n) => {
      const jsonStr = JSON.stringify(n, null, 2);
      const safeTitle = n.title.replace(/[\/\\:\*\?"<>\|]/g, "_") || "未命名书籍";
      datasFolder.file(`${safeTitle}.json`, jsonStr);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `所有书籍JSON备份.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const datasFolder = zip.folder('datas');
    if (!datasFolder) return;

    let globalIndex = 1;
    novel.volumes.forEach((vol) => {
      vol.chapters.forEach((chap) => {
        if (selectedChapters.includes(chap.id)) {
          const content = generateChapterContent(chap, globalIndex);
          const safeTitle = formatChapterTitle(chap.title, globalIndex).replace(/[\/\\:\*\?"<>\|]/g, "_");
          datasFolder.file(`${safeTitle}.txt`, content);
        }
        globalIndex++;
      });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${novel.title}_datas.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const text = generateFullText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        
        if (file.name.endsWith('.json')) {
          const importedNovel = JSON.parse(content) as Novel;
          
          if (!importedNovel.id || !importedNovel.title || !Array.isArray(importedNovel.volumes)) {
            alert("无效的 JSON 格式，无法导入！");
            return;
          }

          onImportNovel(importedNovel);
          alert(`成功导入小说: ${importedNovel.title}`);
        } else if (file.name.endsWith('.txt')) {
          const importedNovel = parseTxtToNovel(content);
          if (importedNovel.volumes.length === 0) {
            alert("无效的 TXT 格式，未找到任何章节，请确认是否为标准汇总文件格式！");
            return;
          }
          onImportNovel(importedNovel);
          alert(`成功导入小说: ${importedNovel.title}`);
        } else {
          alert("不支持的文件格式！请选择 .json 或 .txt 汇总文件。");
        }
      } catch (err) {
        alert("文件解析失败，请确保它是一个有效的数据文件！");
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-700">
          <Download className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-stone-900">导入/导出作品</h2>
          <p className="text-sm text-stone-500 mt-1">
            您可以导入之前备份的 JSON 数据，或者将小说导出为 TXT、ZIP 或剪贴板。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Selection & Options */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-stone-900">导出选项</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">选择要导出的小说</label>
                <div className="relative">
                  <select
                    value={novel.id}
                    onChange={(e) => setSelectedNovelId(e.target.value)}
                    className="w-full appearance-none bg-stone-50 border border-stone-200 text-stone-900 text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-bold cursor-pointer"
                  >
                    {allNovels.map(n => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
                    <Book className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-xl hover:bg-stone-50 border border-stone-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={includeVolumeSummary} 
                  onChange={(e) => setIncludeVolumeSummary(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-stone-700 select-none">在正文前包含分卷概要</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-xl hover:bg-stone-50 border border-stone-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={includeChapterSummary} 
                  onChange={(e) => setIncludeChapterSummary(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-stone-700 select-none">在正文前包含本章概要</span>
              </label>
            </div>
            
            <div className="pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-stone-900">选择要导出的章节</h3>
                <button 
                  onClick={handleToggleSelectAll}
                  className="text-sm text-indigo-600 font-bold hover:text-indigo-800 flex items-center space-x-1"
                >
                  {selectedChapters.length === allChapterIds.length ? (
                    <><CheckSquare className="w-4 h-4" /> <span>全不选</span></>
                  ) : (
                    <><Square className="w-4 h-4" /> <span>全选</span></>
                  )}
                </button>
              </div>

              <div className="border border-stone-200 rounded-xl max-h-[400px] overflow-y-auto bg-stone-50 p-2 space-y-4">
                {novel.volumes.map((vol, vIdx) => {
                  let globalIndex = 1;
                  for (let i = 0; i < vIdx; i++) {
                    globalIndex += novel.volumes[i].chapters.length;
                  }
                  
                  return (
                    <div key={vol.id} className="bg-white rounded-lg border border-stone-200 overflow-hidden">
                      <div className="px-4 py-2 bg-stone-100/50 border-b border-stone-100 text-sm font-bold text-stone-700">
                        {vol.volumeTitle || `第${vIdx + 1}卷`}
                      </div>
                      <div className="divide-y divide-stone-100">
                        {sortChapters(vol.chapters).map((chap) => {
                          const idx = globalIndex++;
                          return (
                            <label key={chap.id} className="flex items-center space-x-3 p-3 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                checked={selectedChapters.includes(chap.id)}
                                onChange={() => handleToggleChapter(chap.id)}
                                className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className="text-sm font-medium text-stone-700 select-none flex-1 truncate">
                                {formatChapterTitle(chap.title, idx)}
                              </span>
                              <span className="text-xs text-stone-400 font-mono">
                                {chap.wordCount || 0} 字
                              </span>
                            </label>
                          );
                        })}
                        {vol.chapters.length === 0 && (
                          <div className="p-3 text-sm text-stone-400 italic">此分卷下暂无章节</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="space-y-3">
          <button
            onClick={handleDownloadZip}
            disabled={selectedChapters.length === 0}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-200 text-indigo-800 flex items-center justify-center">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-900">一键导出到 datas 文件夹 (ZIP)</p>
                <p className="text-xs text-indigo-700/70 mt-0.5">将选中的每个章节独立保存为 TXT 文件</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-indigo-400 group-hover:text-indigo-700" />
          </button>

          <button
            onClick={handleDownloadTxt}
            disabled={selectedChapters.length === 0}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-amber-500 hover:bg-amber-50/50 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">下载 TXT 汇总文件</p>
                <p className="text-xs text-stone-500 mt-0.5">标准小说排版，包含所有选中内容</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-stone-400 group-hover:text-amber-600" />
          </button>

          <button
            onClick={handleDownloadAllNovelsZip}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-purple-500 hover:bg-purple-50/50 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Book className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">下载所有书籍 TXT (ZIP)</p>
                <p className="text-xs text-stone-500 mt-0.5">将所有书籍导出为独立的 TXT 汇总文件</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-stone-400 group-hover:text-purple-600" />
          </button>

          <button
            onClick={handleDownloadAllNovelsJsonZip}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-sky-500 hover:bg-sky-50/50 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">下载所有书籍 JSON (ZIP)</p>
                <p className="text-xs text-stone-500 mt-0.5">将所有书籍导出为 JSON 存储到 data-json</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-stone-400 group-hover:text-sky-600" />
          </button>

          <button
            onClick={handleDownloadJson}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Code className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">下载 JSON 数据备份</p>
                <p className="text-xs text-stone-500 mt-0.5">包含所有数据，不影响您的选择</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-stone-400 group-hover:text-blue-600" />
          </button>

          <button
            onClick={handleCopy}
            disabled={selectedChapters.length === 0}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">复制全文到剪贴板</p>
                <p className="text-xs text-stone-500 mt-0.5">复制选中的文本内容至剪贴板</p>
              </div>
            </div>
            {copied ? <span className="text-xs text-emerald-600 font-bold">已复制!</span> : <Copy className="w-4 h-4 text-stone-400" />}
          </button>

          <label className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-200 bg-white hover:border-pink-500 hover:bg-pink-50/50 transition-all text-left group cursor-pointer mt-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">导入数据 (JSON/TXT)</p>
                <p className="text-xs text-stone-500 mt-0.5">支持之前下载的 JSON 备份或 TXT 汇总文件</p>
              </div>
            </div>
            <Upload className="w-4 h-4 text-stone-400 group-hover:text-pink-600" />
            <input 
              type="file" 
              accept=".json,.txt" 
              onChange={handleImportFile} 
              className="hidden" 
            />
          </label>
        </div>
      </div>
    </div>
  );
};
