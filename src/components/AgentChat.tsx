import React, { useState, useRef, useEffect } from 'react';
import { Novel } from '../types';
import { Bot, User, X, MessageSquare, Send, Loader2, Sparkles, Maximize2, Minimize2 } from 'lucide-react';

import { getAiConfig } from '../lib/aiConfig';
import { callAiApi } from '../lib/aiClient';

interface AgentChatProps {
  currentNovel?: Novel;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const AgentChat: React.FC<AgentChatProps> = ({ currentNovel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [position, setPosition] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 412 : 0, y: typeof window !== 'undefined' ? window.innerHeight - 624 : 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-agent-chat', handleOpen);
    return () => window.removeEventListener('open-agent-chat', handleOpen);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const { apiKey, model, customBaseUrl, useChatCompletions } = getAiConfig();

    if (!apiKey || !model) {
      alert("请先在设置中配置 Gemini API Key 和模型！");
      return;
    }

    const newUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input.trim()
    };
    
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const systemInstruction = currentNovel
        ? `你是一位专业的小说创作助理。你正在协助作者创作小说《${currentNovel.title}》。
小说类型: ${currentNovel.genre}
预估篇幅: ${currentNovel.targetLength}
文风基调: ${currentNovel.tone}
简介: ${currentNovel.logline}
世界观设定: 
- 背景: ${currentNovel.worldBuilding.background}
- 力量体系: ${currentNovel.worldBuilding.powerSystem}
- 势力分布: ${currentNovel.worldBuilding.factions}

最新章节内容摘要 (用于参考剧情发展):
${currentNovel.volumes.flatMap(v => v.chapters).slice(-3).map(c => `标题: ${c.title}\n内容: ${c.content.substring(0, 500)}...`).join('\n\n')}

请根据以上设定和最新章节内容，回答作者的问题、提供灵感、或者协助构思剧情。你的回答需要专业、有创意且符合当前小说的设定。`
        : `你是一位通用创作助理，可以协助作者处理各种任务、构思灵感、回答问题。你的回答需要专业、有创意。`;

      const data = await callAiApi('/api/ai/chat', {
        apiKey,
        model,
        messages: newMessages.map(m => ({ role: m.role, text: m.text })),
        systemInstruction,
        customBaseUrl,
        useChatCompletions
      });
      
      if (!data.success) {
        throw new Error(data.error || "请求失败");
      }

      const newAiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: data.text || '（没有返回内容）'
      };
      
      setMessages(prev => [...prev, newAiMsg]);
    } catch (error: any) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: `【发生错误】: ${error.message}`
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-700 hover:scale-105 transition-all z-40 group"
          title="AI 创作助手"
        >
          <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          style={{ 
            left: typeof window !== 'undefined' && window.innerWidth < 640 
              ? '16px' 
              : `${Math.max(10, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1000) - 400, position.x))}px`, 
            top: typeof window !== 'undefined' && window.innerWidth < 640 
              ? '16px' 
              : `${Math.max(10, Math.min((typeof window !== 'undefined' ? window.innerHeight : 800) - 620, position.y))}px` 
          }}
          className={`fixed bg-white border border-stone-200 rounded-2xl shadow-2xl flex flex-col z-50 ${
            isDragging ? 'transition-none' : 'transition-all duration-300'
          } ${
            isExpanded ? 'sm:w-[600px] sm:h-[80vh] w-[calc(100vw-32px)] h-[calc(100vh-32px)]' : 'sm:w-[380px] sm:h-[600px] w-[calc(100vw-32px)] h-[calc(100vh-80px)]'
          } max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-hidden`}
        >
          {/* Header */}
          <div 
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50/50 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-800">{currentNovel ? '创作助理' : '智能创作助手'}</h3>
                {currentNovel && <p className="text-[10px] text-stone-500">正在协助: {currentNovel.title}</p>}
              </div>
            </div>
            <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/30">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-3">
                <MessageSquare className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center">你好！我是你的{currentNovel ? `AI 创作助理。<br/>有关《${currentNovel.title}》的世界观、人物、剧情，都可以和我讨论。` : '通用 AI 创作助手。<br/>有关各种灵感、问题，都可以和我讨论。'}</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      msg.role === 'user' ? 'bg-amber-100 text-amber-700 ml-2' : 'bg-stone-200 text-stone-700 mr-2'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' 
                        ? 'bg-amber-600 text-white rounded-tr-sm' 
                        : 'bg-white border border-stone-200 text-stone-800 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] flex-row">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-stone-200 text-stone-700 mr-2">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-3 rounded-2xl text-sm bg-white border border-stone-200 text-stone-500 rounded-tl-sm flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在思考中...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-stone-100 bg-white">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="询问设定、讨论剧情、或者获取灵感... (Enter 发送，Shift+Enter 换行)"
                className="w-full resize-none rounded-xl border border-stone-200 pr-12 pl-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 max-h-32"
                rows={1}
                style={{ minHeight: '52px' }}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 w-9 h-9 flex items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
