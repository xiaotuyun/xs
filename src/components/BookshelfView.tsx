import React, { useState } from 'react';
import { Novel, TabType } from '../types';
import { Book, Trash2, ArrowRight, Plus, FileText, Sparkles, BookOpen, Clock, Tag, AlertTriangle, Info, X } from 'lucide-react';
import { getPureWordCount } from '../lib/wordCount';

interface BookshelfViewProps {
  allNovels: Novel[];
  currentNovelId: string;
  onSelectNovel: (id: string) => void;
  onNewNovel: () => void;
  onDeleteNovel: (id: string) => void;
  setActiveTab: (tab: TabType) => void;
}

export const BookshelfView: React.FC<BookshelfViewProps> = ({
  allNovels,
  currentNovelId,
  onSelectNovel,
  onNewNovel,
  onDeleteNovel,
  setActiveTab,
}) => {
  const [novelToDelete, setNovelToDelete] = useState<Novel | null>(null);
  const [showCannotDeleteModal, setShowCannotDeleteModal] = useState(false);
  // Helper to calculate total words of a novel
  const getWordCount = (novel: Novel) => {
    return novel.volumes.reduce(
      (acc, vol) => acc + vol.chapters.reduce((cAcc, c) => cAcc + getPureWordCount(c.content), 0),
      0
    );
  };

  // Helper to calculate total chapters of a novel
  const getChapterCount = (novel: Novel) => {
    return novel.volumes.reduce((acc, vol) => acc + vol.chapters.length, 0);
  };

  // Helper to calculate completed chapters of a novel
  const getCompletedChapterCount = (novel: Novel) => {
    return novel.volumes.reduce(
      (acc, vol) => acc + vol.chapters.reduce((cAcc, c) => {
        const isCompleted = c.status === 'completed' || (c.content && c.content.trim().length > 0);
        return cAcc + (isCompleted ? 1 : 0);
      }, 0),
      0
    );
  };

  // Calculate totals for the entire bookshelf
  const totalBooks = allNovels.length;
  const totalWordsCombined = allNovels.reduce((acc, novel) => acc + getWordCount(novel), 0);
  const totalChaptersCombined = allNovels.reduce((acc, novel) => acc + getChapterCount(novel), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      {/* Upper Statistics and Banner */}
      <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>我的创作书架</span>
            </div>
            <div className="inline-flex items-center space-x-1.5 bg-amber-500/30 border border-amber-400/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-xs">
              <Book className="w-3.5 h-3.5 text-amber-200" />
              <span>已创作: <strong className="text-white font-black">{totalBooks}</strong> 部作品</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">网络小说灵感与写作工坊</h2>
            <p className="text-amber-100/90 text-xs sm:text-sm max-w-xl">
              在这里，您的灵感将通过 AI 的辅助转化为情节严密、分卷清晰、人物丰满的长篇网络巨著。
            </p>
          </div>
        </div>

        <button
          onClick={onNewNovel}
          className="shrink-0 inline-flex items-center px-5 py-3 bg-white text-amber-900 hover:bg-amber-50 active:scale-95 transition-all rounded-xl text-sm font-extrabold shadow-sm cursor-pointer select-none"
        >
          <Plus className="w-4 h-4 mr-1.5 text-amber-700" />
          新建作品
        </button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-stone-100">
          <div>
            <h3 className="text-lg font-bold text-stone-900">书籍列表</h3>
            <p className="text-xs text-stone-500">点击切换正在创作的作品，或查看每本书的内容摘要</p>
          </div>
        </div>

        <div className="space-y-4">
          {allNovels.length === 0 ? (
            <div className="text-center py-16 space-y-4 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <Book className="w-16 h-16 text-stone-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-stone-700">书架空空如也</p>
                <p className="text-xs text-stone-400">目前还没有创建任何书籍，点击上方“新建作品”开始创作吧！</p>
              </div>
              <button
                onClick={onNewNovel}
                className="inline-flex items-center px-4.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                立即创建第一本书
              </button>
            </div>
          ) : (
            allNovels.map((novel) => {
              const words = getWordCount(novel);
              const chapters = getChapterCount(novel);
              const completedChapters = getCompletedChapterCount(novel);
              const isActive = novel.id === currentNovelId;

              return (
                <div
                  key={novel.id}
                  className={`p-6 rounded-2xl border transition-all relative overflow-hidden flex flex-col md:flex-row justify-between md:items-center gap-6 ${
                    isActive
                      ? 'border-amber-500 bg-amber-50/10 ring-1 ring-amber-500'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl tracking-wider shadow-sm">
                      当前编辑中
                    </div>
                  )}

                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                      <h4 className="font-extrabold text-stone-900 text-base sm:text-lg truncate max-w-[340px]">
                        {novel.title}
                      </h4>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-bold border border-stone-200">
                        {novel.genre}
                      </span>
                      {novel.targetLength && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-100/50">
                          {novel.targetLength}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed max-w-3xl">
                      {novel.logline || '暂无小说简介，快点击“切换至该作品”进入详情页编写简介和构思吧！'}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400 font-medium">
                      <span className="flex items-center">
                        <FileText className="w-3.5 h-3.5 mr-1 text-stone-400 shrink-0" />
                        每本总字数: <strong className="text-stone-700 ml-0.5">{words.toLocaleString()}</strong> 字
                      </span>
                      <span>•</span>
                      <span>
                        章节总数: <strong className="text-stone-700">{chapters}</strong> 章
                      </span>
                      <span>•</span>
                      <span>
                        已完成章节: <strong className="text-emerald-600 font-bold">{completedChapters}</strong> 章
                      </span>
                      <span>•</span>
                      <span>
                        总卷数: <strong className="text-stone-700">{novel.volumes ? novel.volumes.length : 0}</strong> 卷
                      </span>
                      {novel.updatedAt && (
                        <>
                          <span>•</span>
                          <span className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1 text-stone-400 shrink-0" />
                            最后更新: <span className="text-stone-600 ml-0.5 font-bold">{new Date(novel.updatedAt).toLocaleDateString()}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 shrink-0 border-t border-stone-100 pt-4 md:pt-0 md:border-t-0">
                    {isActive ? (
                      <button
                        onClick={() => setActiveTab('dashboard')}
                        className="inline-flex items-center px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        进入写作控制台
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onSelectNovel(novel.id);
                          setActiveTab('dashboard');
                        }}
                        className="inline-flex items-center px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs hover:translate-x-0.5 cursor-pointer"
                      >
                        切换至该作品
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (allNovels.length <= 1) {
                          setShowCannotDeleteModal(true);
                        } else {
                          setNovelToDelete(novel);
                        }
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 text-stone-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100 transition-all cursor-pointer"
                      title="删除本作品"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Custom Confirm Delete Modal */}
      {novelToDelete && (
        <div className="fixed inset-0 bg-stone-900/55 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 animate-fade-in border border-stone-200">
            <div className="flex items-start space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center border border-red-100 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-stone-900">确认删除该部小说？</h3>
                <p className="text-xs text-stone-500">删除操作一经确认，将无法撤销或恢复。</p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/60 space-y-2">
              <p className="text-xs font-semibold text-stone-500">正在删除的小说：</p>
              <p className="text-sm font-extrabold text-stone-800">《{novelToDelete.title}》</p>
              <p className="text-xs text-stone-400 font-medium">该作品下的所有世界观设定、人物关系、大纲目录及章节写作正文内容都将被彻底清空。</p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setNovelToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm rounded-xl transition-all cursor-pointer select-none border border-stone-200/50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onDeleteNovel(novelToDelete.id);
                  setNovelToDelete(null);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-red-200 cursor-pointer select-none"
              >
                确认永久删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Cannot Delete Notice Modal */}
      {showCannotDeleteModal && (
        <div className="fixed inset-0 bg-stone-900/55 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 animate-fade-in border border-stone-200">
            <div className="flex items-start space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 shrink-0">
                <Info className="w-5 h-5 text-amber-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-stone-900">无法删除该作品</h3>
                <p className="text-xs text-stone-500">小说创作工坊保护机制</p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/60">
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                为了保证您的写作空间不被完全清空，创作工坊要求您<strong className="text-stone-800">至少保留一部小说作品</strong>。
              </p>
              <p className="text-xs text-stone-400 mt-2">
                如果您不想保留该书，请先在下方或右上角“新建”一部新的小说，随后即可删除当前作品。
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowCannotDeleteModal(false)}
                className="w-full px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-sm rounded-xl transition-all cursor-pointer select-none"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
