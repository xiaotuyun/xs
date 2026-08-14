import React from 'react';
import { X, Book, Sparkles, PenTool, Globe, Users, Settings, Lightbulb, ChevronRight, AlertTriangle, Cloud, Save, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UsageGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UsageGuideModal({ isOpen, onClose }: UsageGuideModalProps) {
  const guides = [
    {
      icon: <Cloud className="h-5 w-5 text-sky-500" />,
      title: '网络与连接',
      content: '平台默认连接 Worker。动态网址加载可直接注册使用；若静态加载报错（验证失败），请手动核对 Worker 绑定或切换为动态网址。',
    },
    {
      icon: <Database className="h-5 w-5 text-amber-500" />,
      title: '离线存储',
      content: '前端文件为静态托管，数据采用离线缓存。请务必在完成每章后点击保存，或下载 JSON/TXT 备份，防止离开页面导致数据丢失。',
    },
    {
      icon: <Settings className="h-5 w-5 text-stone-500" />,
      title: '模型配置',
      content: 'Gemini 填入密钥即可刷新。支持 Groq 等模型，需手动输入模型列表与链接。注意：配置选项需手动点击保存按钮才会生效。',
    },
    {
      icon: <Users className="h-5 w-5 text-purple-500" />,
      title: '人物档案',
      content: '管理主要角色设定。AI 会根据您设定的人物性格、外貌及背景进行续写，确保角色性格逻辑连贯。',
    },
    {
      icon: <PenTool className="h-5 w-5 text-green-500" />,
      title: '智能写作',
      content: '支持 AI 续写、润色、扩写。AI 会自动抓取"世界观"和"人物设定"作为上下文，提升创作质量。',
    },
    {
      icon: <Lightbulb className="h-5 w-5 text-yellow-500" />,
      title: '大纲规划',
      content: '规划全书目录。支持"AI 续接大纲"，可根据当前已有的剧情走向，自动为您构思后续的章节发展。',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
                  <Book className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-black text-stone-900 tracking-tight leading-tight">使用指南</h2>
                  <p className="text-[10px] sm:text-sm text-stone-500">动态加载 · 离线缓存 · 智能辅助</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-stone-200">
              {/* Tips / Precautions */}
              <div className="p-4 sm:p-6 rounded-2xl bg-orange-50 border border-orange-100 flex items-start gap-3 sm:gap-4 shadow-3xs">
                <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-orange-500 shadow-sm">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="font-bold text-orange-900 text-xs sm:text-sm">注意事项</h4>
                  <ul className="text-[11px] sm:text-xs text-orange-800/80 leading-relaxed list-disc list-inside space-y-0.5 sm:space-y-1">
                    <li>前端为静态托管，Worker 负责模型交互等动态信息。</li>
                    <li>模型配置：Gemini 填入密钥即可；Groq 等需手动输入模型列表及链接。</li>
                    <li>保存配置选项只有点击"保存"才会生效。</li>
                  </ul>
                </div>
              </div>

              {/* Important Warning */}
              <div className="p-4 sm:p-5 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3 sm:gap-4 shadow-3xs">
                <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-red-500 shadow-sm animate-pulse">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="font-bold text-red-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                    <Save className="w-3.5 h-3.5 sm:w-4 h-4" /> 重要：数据安全须知
                  </h4>
                  <p className="text-[11px] sm:text-xs text-red-800/80 leading-relaxed font-medium">
                    平台采用<b>离线缓存</b>技术。请务必<b>完成一章后点击保存章节</b>或下载 JSON/TXT 到本地。未保存离开界面，数据<b>将会丢失</b>。
                  </p>
                </div>
              </div>

              {/* Connection Guide */}
              <div className="p-4 sm:p-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3 sm:gap-4 shadow-3xs">
                <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-blue-500 shadow-sm">
                  <Cloud className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="font-bold text-blue-900 text-xs sm:text-sm">平台连接与加载说明</h4>
                  <ul className="text-[11px] sm:text-xs text-blue-800/80 leading-relaxed list-disc list-inside space-y-0.5 sm:space-y-1">
                    <li>动态网址加载可直接正常注册使用。</li>
                    <li>静态网址若提示"验证失败"，请核对绑定或切换动态网址。</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {guides.map((guide, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 sm:p-5 rounded-2xl border border-stone-100 bg-stone-50/30 hover:bg-white hover:shadow-xl hover:shadow-stone-200/50 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-white shadow-sm group-hover:scale-110 transition-transform">
                        {guide.icon}
                      </div>
                      <h3 className="font-bold text-stone-800 text-xs sm:text-sm">{guide.title}</h3>
                    </div>
                    <p className="text-[11px] sm:text-xs text-stone-600 leading-relaxed">
                      {guide.content}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 py-4 sm:py-5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] text-stone-400 font-bold tracking-widest uppercase">Safe & Smart Creation</span>
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-2 rounded-xl bg-stone-900 text-white text-xs sm:text-sm font-bold hover:bg-stone-800 transition-all flex items-center gap-2 group cursor-pointer"
              >
                我知道了
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

