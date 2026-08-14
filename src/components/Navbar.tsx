import React, { useState, useEffect } from 'react';
import { Novel, TabType } from '../types';
import { BookOpen, Globe, Users, FileText, PenTool, Download, Plus, Sparkles, FolderKanban, Key, HardDrive, LogOut, Settings, MessageCircle, Lightbulb } from 'lucide-react';
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
  onOpenAdminSettings?: () => void;
  onOpenFeedback?: () => void;
  onOpenUsageGuide?: () => void;
  isLimitedUser?: boolean;
  isAdminUser?: boolean;
  maxSeconds?: number;
  usedSeconds?: number;
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
  onOpenAdminSettings,
  onOpenFeedback,
  onOpenUsageGuide,
  isLimitedUser = false,
  isAdminUser = false,
  maxSeconds = 0,
  usedSeconds = 0,
}) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const userEmail = localStorage.getItem('ai_novel_studio_user_email') || '';
    if (!userEmail) return;
    
    const savedKey = localStorage.getItem('ai_novel_studio_cloud_api_key') || '';
    const adminKeyQuery = savedKey.trim() ? `&admin_key=${encodeURIComponent(savedKey.trim())}` : '';

    // Check admin via worker2 API
    fetch(`/api/auth/is-admin?account=${encodeURIComponent(userEmail.trim())}${adminKeyQuery}`)
       .then(res => res.json())
       .then(data => setIsAdmin(data.isAdmin))
       .catch(() => setIsAdmin(false));
  }, []);

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
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-2xs">
      {/* 1. DESKTOP CLIENT (md:block, hidden on mobile) - 100% UNTOUCHED ORIGINAL LAYOUT */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 lg:px-8">
        {/* ROW 1: Brand & Top Utilities */}
        <div className="flex justify-between h-14 items-center border-b border-stone-100 gap-2">
          {/* Logo Brand */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="font-bold text-stone-900 text-base leading-none tracking-tight">
                小说创作工坊
              </h1>
              <p className="text-[10px] text-stone-400 font-medium whitespace-nowrap">AI Novel Studio</p>
            </div>
            
            {isAdminUser && (
              <div className="px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-black border border-blue-200 shadow-3xs flex items-center gap-0.5 shrink-0 ml-1">
                <Users className="w-2.5 h-2.5" />
                <span>管理员</span>
              </div>
            )}

            <button 
              onClick={onOpenUsageGuide}
              className="flex items-center space-x-1 px-2 py-1 rounded-md bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition-all text-[11px] font-bold border border-stone-200 shadow-sm ml-2 shrink-0"
              title="查看使用指南"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>使用说明</span>
            </button>

            {isLimitedUser && (
              <div className="flex items-center space-x-2.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 shadow-3xs ml-4 shrink-0">
                <div className="flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">剩余:</span>
                </div>
                <span className="text-xs font-black tabular-nums text-amber-900 min-w-[50px]">
                  {(() => {
                    const rem = Math.max(0, maxSeconds - usedSeconds);
                    if (rem >= 3600) {
                      const hrs = Math.floor(rem / 3600);
                      const mins = Math.floor((rem % 3600) / 60);
                      return `${hrs}h ${mins}m`;
                    }
                    const mins = Math.floor(rem / 60);
                    const secs = rem % 60;
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                  })()}
                </span>
              </div>
            )}
          </div>

          {/* Right utilities */}
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none py-1 shrink-0 ml-auto pl-2">
            <button
              onClick={onToggleGeneralChat}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all shadow-3xs cursor-pointer shrink-0"
              title="与 AI 通用助手交流"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
              <span>通用助手</span>
            </button>

            <button
              onClick={onOpenFeedback}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 text-xs font-bold transition-all shadow-3xs cursor-pointer shrink-0"
              title="反馈问题或改进建议"
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1 text-stone-500 shrink-0" />
              <span>反馈</span>
            </button>

            <button
              onClick={onOpenAllNovels}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg border transition-all text-xs font-bold shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'bookshelf'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-amber-50/40 text-stone-700 hover:bg-amber-50 hover:text-amber-800'
              }`}
              title="查看已创建的全部书籍"
            >
              <FolderKanban className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'bookshelf' ? 'text-white' : 'text-amber-600'}`} />
              <span>所有书籍</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'storage'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-amber-50/20 hover:text-amber-900'
              }`}
              title="配置本地硬盘自动同步与存储位置"
            >
              <HardDrive className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'storage' ? 'text-white' : 'text-amber-600'}`} />
              <span>存储同步</span>
            </button>

            <button
              onClick={onOpenApiKey}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'apikeys'
                  ? 'border-purple-600 bg-purple-600 text-white'
                  : hasKey
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/70'
                  : 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/70'
              }`}
              title="模型配置"
            >
              <Key className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'apikeys' ? 'text-white' : 'text-stone-500'}`} />
              <span>模型: {modelName}</span>
              <span className={`ml-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${activeTab === 'apikeys' ? 'bg-white' : hasKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'export'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-indigo-50 hover:text-indigo-900'
              }`}
              title="作品导入与导出"
            >
              <Download className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'export' ? 'text-white' : 'text-indigo-600'}`} />
              <span>导入/导出</span>
            </button>

            {isAdmin && (
                <button
                  onClick={onOpenAdminSettings}
                  className={`inline-flex items-center px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 ${
                    activeTab === 'admin'
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-amber-50 hover:text-amber-900'
                  }`}
                  title="系统设置"
                >
                  <Settings className={`w-3.5 h-3.5 mr-1 shrink-0 ${activeTab === 'admin' ? 'text-white' : 'text-amber-600'}`} />
                  <span>设置</span>
                </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="inline-flex items-center px-2.5 py-1.5 border border-red-200 bg-red-50/60 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
                title="退出当前系统登录"
              >
                <LogOut className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                <span>退出</span>
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: Active Novel Selection, Custom Actions, and Central Tabs & Stats */}
        <div className="flex items-center justify-between h-12 gap-2.5">
          {/* Left: Book selector + New button */}
          <div className="flex items-center space-x-2 shrink-0">
            <select
              aria-label="当前写作小说"
              value={currentNovel.id}
              onChange={(e) => onSelectNovel(e.target.value)}
              className="bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-bold max-w-[220px] truncate"
            >
              {allNovels.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>

            <button
              onClick={onNewNovel}
              className="inline-flex items-center px-2.5 py-1.5 border border-stone-200 text-xs font-bold rounded-lg text-amber-700 bg-white hover:bg-amber-50 transition-all shadow-2xs cursor-pointer shrink-0"
              title="新建一本小说"
            >
              <Plus className="w-3.5 h-3.5 mr-0.5 text-amber-600" />
              新建
            </button>
          </div>

          {/* Core Workspace Tabs */}
          <nav className="flex space-x-1.5 py-0.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap shrink-0 ${
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

      {/* 2. MOBILE VERSION (block md:hidden) - Custom single-row mobile layout */}
      <div className="block md:hidden px-2 py-1.5">
        <div className="flex items-center justify-between h-12 gap-2 overflow-x-auto scrollbar-none">
          {/* Logo Brand */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>

          {/* Book selector */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <select
              aria-label="当前写作小说"
              value={currentNovel.id}
              onChange={(e) => onSelectNovel(e.target.value)}
              className="bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-bold max-w-[120px] truncate"
            >
              {allNovels.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>

            <button
              onClick={onNewNovel}
              className="inline-flex items-center px-2 py-1.5 border border-stone-200 text-xs font-bold rounded-lg text-amber-700 bg-white hover:bg-amber-50 transition-all shadow-2xs cursor-pointer shrink-0"
              title="新建一本小说"
            >
              <Plus className="w-3.5 h-3.5 text-amber-600" />
            </button>
          </div>

          {/* Core Workspace Tabs */}
          <nav className="flex space-x-1 shrink-0">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer select-none whitespace-nowrap shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="总览"
            >
              <FolderKanban className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTab('world')}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer select-none whitespace-nowrap shrink-0 ${
                activeTab === 'world'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="世界观"
            >
              <Globe className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer select-none whitespace-nowrap shrink-0 ${
                activeTab === 'characters'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="人物"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer select-none whitespace-nowrap shrink-0 ${
                activeTab === 'outline'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="大纲"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer select-none whitespace-nowrap shrink-0 ${
                activeTab === 'editor'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="写作"
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
          </nav>

          {/* Mobile Right Utilities */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={onToggleGeneralChat}
              className="inline-flex items-center p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all shadow-3xs cursor-pointer shrink-0"
              title="助手"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            </button>

            <button
              onClick={onOpenAllNovels}
              className={`inline-flex items-center p-1.5 rounded-lg border transition-all text-xs font-bold shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'bookshelf'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-200 bg-amber-50/40 text-stone-700'
              }`}
              title="书架"
            >
              <FolderKanban className={`w-3.5 h-3.5 ${activeTab === 'bookshelf' ? 'text-white' : 'text-amber-600'}`} />
            </button>

            <button
              onClick={onOpenApiKey}
              className={`inline-flex items-center p-1.5 border text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0 ${
                activeTab === 'apikeys'
                  ? 'border-purple-600 bg-purple-600 text-white'
                  : 'border-stone-200 bg-white text-stone-700'
              }`}
              title="模型配置"
            >
              <Key className="w-3.5 h-3.5 text-stone-500" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
