import React, { useState, useEffect } from 'react';
import { Novel, TabType } from './types';
import { sampleNovels } from './data/initialNovel';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { WorldView } from './components/WorldView';
import { Characters } from './components/Characters';
import { OutlineView } from './components/OutlineView';
import { ChapterEditor } from './components/ChapterEditor';
import { ExportView } from './components/ExportView';
import { ApiKeyModal } from './components/ApiKeyModal';
import { BookshelfView } from './components/BookshelfView';
import { StorageSettingsView } from './components/StorageSettingsView';
import { AgentChat } from './components/AgentChat';
import { GeneralChat } from './components/GeneralChat';
import { LoginView } from './components/LoginView';
import { X, BookOpen, Sparkles } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('ai_novel_studio_auth_logged_in') === 'true';
  });

  const [novels, setNovels] = useState<Novel[]>(() => {
    const saved = localStorage.getItem('ai_novel_studio_novels_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return sampleNovels;
  });

  const [currentNovelId, setCurrentNovelId] = useState<string>(() => {
    const savedId = localStorage.getItem('ai_novel_studio_current_novel_id');
    if (savedId && novels.some((n) => n.id === savedId)) {
      return savedId;
    }
    return novels[0]?.id || 'novel-1';
  });

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const savedTab = localStorage.getItem('ai_novel_studio_active_tab');
    if (savedTab) return savedTab as TabType;
    return 'dashboard';
  });

  const [selectedChapterId, setSelectedChapterId] = useState<string>(() => {
    return localStorage.getItem('ai_novel_studio_selected_chapter_id') || '';
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showNewNovelModal, setShowNewNovelModal] = useState(false);
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [isGeneralChatOpen, setIsGeneralChatOpen] = useState(false);
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);

  const checkAiConfigured = (): boolean => {
    const apiKey = localStorage.getItem('ai_novel_studio_apikey') || '';
    const model = localStorage.getItem('ai_novel_studio_model') || '';
    if (!apiKey.trim() || !model.trim()) {
      setShowConfigWarning(true);
      return false;
    }
    return true;
  };
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('玄幻修真 / 东方奇幻');
  const [newTargetLength, setNewTargetLength] = useState('中篇 (100万字)');
  const [newTone, setNewTone] = useState('热血爽快、节奏明快');

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem('ai_novel_studio_novels_v1', JSON.stringify(novels));
  }, [novels]);

  useEffect(() => {
    if (currentNovelId) {
      localStorage.setItem('ai_novel_studio_current_novel_id', currentNovelId);
    }
  }, [currentNovelId]);

  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('ai_novel_studio_active_tab', activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedChapterId) {
      localStorage.setItem('ai_novel_studio_selected_chapter_id', selectedChapterId);
    }
  }, [selectedChapterId]);

  const currentNovel = novels.find((n) => n.id === currentNovelId) || novels[0];

  const handleUpdateCurrentNovel = (updated: Novel) => {
    setNovels((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleImportNovel = (importedNovel: Novel) => {
    setNovels((prev) => {
      const exists = prev.some((n) => n.id === importedNovel.id);
      if (exists) {
        importedNovel.id = crypto.randomUUID();
      }
      return [importedNovel, ...prev];
    });
    setCurrentNovelId(importedNovel.id);
    setActiveTab('dashboard');
  };

  const handleDeleteNovel = (id: string) => {
    if (novels.length <= 1) {
      alert('至少需要保留一本小说作品！');
      return;
    }
    const remaining = novels.filter((n) => n.id !== id);
    setNovels(remaining);
    setCurrentNovelId(remaining[0].id);
  };

  const handleCreateNovel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newNovel: Novel = {
      id: `novel-${Date.now()}`,
      title: newTitle.trim(),
      logline: '在此输入或使用 AI 生成您的小说核心看点与简介...',
      genre: newGenre,
      tags: ['系统流', '热血爽文'],
      targetLength: newTargetLength,
      tone: newTone,
      worldBuilding: {
        background: '在此完善小说的世界背景设定...',
        powerSystem: '在此描述力量体系与境界划分...',
        factions: '在此描述主要势力与宗门...',
      },
      characters: [
        {
          id: `char-${Date.now()}`,
          name: '主角',
          role: '男主角',
          description: '坚毅果决，天赋异禀。',
          background: '身世成谜，踏上强者之路。',
        },
      ],
      volumes: [
        {
          id: `vol-${Date.now()}`,
          volumeNumber: 1,
          volumeTitle: '第一卷 崛起于微末',
          summary: '主角初入修行世界，崭露头角。',
          chapters: [
            {
              id: `chap-${Date.now()}`,
              chapterNumber: 1,
              title: '第1章 穿越与金手指',
              summary: '主角意外来到此世界，开启核心机缘。',
              content: '这是一个充满无限可能的新世界……',
              wordCount: 15,
              status: 'draft',
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setNovels([newNovel, ...novels]);
    setCurrentNovelId(newNovel.id);
    setActiveTab('dashboard');
    setNewTitle('');
    setShowNewNovelModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('ai_novel_studio_auth_logged_in');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-white">
      <Navbar
        currentNovel={currentNovel}
        allNovels={novels}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSelectNovel={(id) => setCurrentNovelId(id)}
        onNewNovel={() => setShowNewNovelModal(true)}
        onOpenApiKey={() => setShowApiKeyModal(true)}
        onOpenAllNovels={() => setActiveTab('bookshelf')}
        onToggleGeneralChat={() => setIsGeneralChatOpen(!isGeneralChatOpen)}
        onLogout={handleLogout}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' && (
          <Dashboard
            novel={currentNovel}
            onUpdateNovel={handleUpdateCurrentNovel}
            onCreateNewNovel={(newCreated) => {
              setNovels((prev) => [newCreated, ...prev]);
              setCurrentNovelId(newCreated.id);
              setActiveTab('outline');
            }}
            onDeleteNovel={handleDeleteNovel}
            setActiveTab={setActiveTab}
            onRequireConfig={checkAiConfigured}
          />
        )}

        {activeTab === 'world' && (
          <WorldView novel={currentNovel} onUpdateNovel={handleUpdateCurrentNovel} />
        )}

        {activeTab === 'characters' && (
          <Characters novel={currentNovel} onUpdateNovel={handleUpdateCurrentNovel} />
        )}

        {activeTab === 'outline' && (
          <OutlineView
            novel={currentNovel}
            onUpdateNovel={handleUpdateCurrentNovel}
            onCreateNewNovel={(newCreated) => {
              setNovels((prev) => [newCreated, ...prev]);
              setCurrentNovelId(newCreated.id);
              setActiveTab('outline');
            }}
            onSelectChapter={(chapId) => setSelectedChapterId(chapId)}
            setActiveTab={setActiveTab}
            onRequireConfig={checkAiConfigured}
          />
        )}

        {activeTab === 'editor' && (
          <ChapterEditor
            novel={currentNovel}
            selectedChapterId={selectedChapterId}
            onUpdateNovel={handleUpdateCurrentNovel}
            onSelectChapter={(chapId) => setSelectedChapterId(chapId)}
            onRequireConfig={checkAiConfigured}
          />
        )}

        {activeTab === 'bookshelf' && (
          <BookshelfView
            allNovels={novels}
            currentNovelId={currentNovelId}
            onSelectNovel={(id) => setCurrentNovelId(id)}
            onNewNovel={() => setShowNewNovelModal(true)}
            onDeleteNovel={handleDeleteNovel}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'storage' && (
          <StorageSettingsView
            allNovels={novels}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'export' && (
          <ExportView 
            allNovels={novels} 
            currentNovelId={currentNovelId} 
            onImportNovel={handleImportNovel}
          />
        )}

        <AgentChat currentNovel={currentNovel} />
        <GeneralChat isOpen={isGeneralChatOpen} onClose={() => setIsGeneralChatOpen(false)} />
      </main>

      {/* New Novel Modal */}
      {showNewNovelModal && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-stone-900">创建新小说</h3>
              </div>
              <button
                onClick={() => setShowNewNovelModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNovel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">小说书名</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：万古剑神"
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase mb-1">初始流派 (可直接输入自定义流派)</label>
                <input
                  type="text"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  placeholder="例如：玄幻修真、科幻机甲、无限流、修仙、末日废土..."
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['玄幻修真 / 东方奇幻', '科幻星际 / 废土机甲', '都市异能 / 系统爽文', '悬疑推理 / 惊悚解谜', '历史架空 / 权谋争霸', '轻小说 / 恋爱日常', '无限流 / 诸天万界'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewGenre(preset)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        newGenre === preset
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {preset.split('/')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase mb-1">预估篇幅 (可自定义)</label>
                  <input
                    type="text"
                    value={newTargetLength}
                    onChange={(e) => setNewTargetLength(e.target.value)}
                    placeholder="例如：中篇 (100万字)"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['短篇 (30万字)', '中篇 (100万字)', '长篇 (200万字+)', '超长篇 (500万字)'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTargetLength(p)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          newTargetLength === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
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
                    value={newTone}
                    onChange={(e) => setNewTone(e.target.value)}
                    placeholder="例如：热血爽快、节奏明快"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['热血爽快、节奏明快', '细腻文风、注重情感', '严谨烧脑、多重反转', '轻松幽默、日常治愈'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTone(p)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          newTone === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {p.split('、')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewNovelModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium shadow-sm"
                >
                  立即创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ApiKeyModal isOpen={showApiKeyModal} onClose={() => setShowApiKeyModal(false)} />

      {/* Beautiful Config Warning Modal */}
      {showConfigWarning && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 text-center">
            <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-stone-900">⚠️ AI 配置未完成</h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                您必须配置自己的 <strong>Gemini API Key</strong> 并选择一个 <strong>全局模型</strong> 才能进行 AI 智能创作。
              </p>
              <p className="text-xs text-stone-500 bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-left leading-relaxed">
                本程序不提供任何收费的内置或共享模型，从而 100% 保护您的创作内容隐私、数据安全，以及防止 API 密钥额度流失。
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfigWarning(false);
                  setShowApiKeyModal(true);
                }}
                className="w-full px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                立即配置密钥与选择模型
              </button>
              <button
                onClick={() => setShowConfigWarning(false)}
                className="w-full px-4 py-2 text-stone-500 hover:text-stone-800 text-xs font-semibold cursor-pointer"
              >
                暂不配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

