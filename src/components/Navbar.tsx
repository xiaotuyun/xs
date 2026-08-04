import React, { useState, useEffect } from 'react';
import { Novel, TabType } from '../types';
import { BookOpen, Globe, Users, FileText, PenTool, Download, Plus, Sparkles, FolderKanban, Key, HardDrive, LogOut } from 'lucide-react';
import { getPureWordCount } from '../lib/wordCount';

interface NavbarProps {
  currentNovel: Novel;
  allNovels: Novel[];
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onSelectNovel: (id: string) => void;
  onNewNovel: () => void;
  onOpenApiKey: () => void;
  onOpenAllNovels: () => void;
  onToggleGeneralChat: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentNovel,
  allNovels,
  activeTab,
  setActiveTab,
  onSelectNovel,
  onNewNovel,
  onOpenApiKey,
  onOpenAllNovels,
  onToggleGeneralChat,
  onLogout,
}) => {
  const [modelName, setModelName] = useState('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkConfig = () => {
      const k = localStorage.getItem('ai_novel_studio_apikey') || '';
      const m = localStorage.getItem('ai_novel_studio_model') || '';
      setHasKey(Boolean(k));
      setModelName(m ? m.replace('models/', '') : (k ? '已配置密钥' : '未配置模型'));
    };
    checkConfig();
    const interval = setInterval(checkConfig, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalWords = currentNovel.volumes.reduce(
    (acc, vol) => acc + vol.chapters.reduce((cAcc, c) => cAcc + getPureWordCount(c.content), 0),
    0
  );

  const totalChapters = currentNovel.volumes.reduce(
    (acc, vol) => acc + vol.chapters.length,
    0
  );

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ROW 1: Brand & Top Utilities */}
        <div className="flex justify-between h-14 items-center border-b border-stone-100">
          {/* Logo Brand */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-sm">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="font-bold text-stone-900 text-sm sm:text-base leading-none tracking-tight">
                小说创作工坊
              </h1>
              <p className="text-[10px] text-stone-400 font-medium">AI Novel Studio</p>
            </div>
          </div>

          {/* Right utilities: 所有书籍, 模型, 导出作品 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleGeneralChat}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="与 AI 通用助手交流"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
              通用助手
            </button>
            <button
              onClick={() => setActiveTab('bookshelf')}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg border transition-all text-xs font-bold shadow-2xs cursor-pointer ${
                activeTab === 'bookshelf'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-amber-50/40 text-stone-700 hover:bg-amber-50 hover:text-amber-800'
              }`}
              title="查看已创建的全部书籍"
            >
              <FolderKanban className={`w-3.5 h-3.5 mr-1 ${activeTab === 'bookshelf' ? 'text-white' : 'text-amber-600'}`} />
              所有书籍
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer ${
                activeTab === 'storage'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-amber-55/20 hover:text-amber-900'
              }`}
              title="配置本地硬盘自动同步与存储位置"
            >
              <HardDrive className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'storage' ? 'text-white' : 'text-amber-600'}`} />
              存储同步
            </button>

            <button
              onClick={onOpenApiKey}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer ${
                hasKey
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/70'
                  : 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/70'
              }`}
              title="模型配置"
            >
              <Key className="w-3.5 h-3.5 mr-1 text-stone-500 shrink-0" />
              <span>模型: {modelName}</span>
              <span className={`ml-1.5 w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer ${
                activeTab === 'export'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-indigo-50 hover:text-indigo-900'
              }`}
            >
              <Download className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'export' ? 'text-white' : 'text-indigo-600'}`} />
              导入/导出
            </button>

            {onLogout && (
              <button
                onClick={onLogout}
                className="inline-flex items-center px-2.5 py-1.5 border border-red-200 bg-red-50/60 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer"
                title="退出当前系统登录"
              >
                <LogOut className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                退出
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: Active Novel Selection, Custom Actions, and Central Tabs & Stats */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-2 md:h-12 gap-2 md:gap-4 overflow-x-auto">
          {/* Active Book Selector & New Action */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="relative">
              <select
                aria-label="当前写作小说"
                value={currentNovel.id}
                onChange={(e) => onSelectNovel(e.target.value)}
                className="bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-bold max-w-[240px] truncate"
              >
                {allNovels.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onNewNovel}
              className="inline-flex items-center px-2.5 py-1.5 border border-stone-200 text-xs font-bold rounded-lg text-amber-700 bg-white hover:bg-amber-50 transition-all shadow-2xs cursor-pointer"
              title="新建一本小说"
            >
              <Plus className="w-3.5 h-3.5 mr-0.5 text-amber-600" />
              新建
            </button>
          </div>

          {/* Core Workspace Tabs */}
          <nav className="flex space-x-1 overflow-x-auto scrollbar-none shrink-0 py-0.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>总览</span>
            </button>
            <button
              onClick={() => setActiveTab('world')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                activeTab === 'world'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>世界观</span>
            </button>
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                activeTab === 'characters'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>人物</span>
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                activeTab === 'outline'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>大纲目录</span>
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                activeTab === 'editor'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>正文写作</span>
            </button>
          </nav>

          {/* Stats indicator */}
          <div className="flex items-center space-x-2 text-xs font-medium text-stone-500 bg-stone-50 px-3 py-1.5 border border-stone-200/60 rounded-lg shrink-0">
            <span>总字数: <strong className="text-stone-800 font-bold">{totalWords.toLocaleString()}</strong></span>
            <span className="text-stone-300 font-light">|</span>
            <span>章节: <strong className="text-stone-800 font-bold">{totalChapters}</strong></span>
          </div>
        </div>
      </div>
    </header>
  );
};
