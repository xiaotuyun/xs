import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function FeedbackModal({ isOpen, onClose, userEmail }: FeedbackModalProps) {
  const [problem, setProblem] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const MAX_LENGTH = 300;

  useEffect(() => {
    if (isOpen) {
      setProblem('');
      setStatus('idle');
      setErrorMessage('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problem.trim() || isSubmitting) return;

    if (problem.length > MAX_LENGTH) {
      setStatus('error');
      setErrorMessage(`内容不能超过 ${MAX_LENGTH} 字`);
      return;
    }

    setIsSubmitting(true);
    setStatus('idle');

    try {
      const response = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: userEmail || 'anonymous',
          problem: problem.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setStatus('error');
        setErrorMessage(data.error || '提交失败，请稍后重试');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('网络连接失败，请检查您的网络设置');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">问题反馈</h3>
                  <p className="text-xs text-gray-500">您的反馈是我们进步的最大动力</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {status === 'success' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 text-center"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900">提交成功</h4>
                  <p className="mt-1 text-gray-500">感谢您的反馈，我们会认真处理！</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      反馈账号
                    </label>
                    <div className="rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-600 border border-gray-100">
                      {userEmail || '未登录用户'}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        反馈内容 <span className="text-red-500">*</span>
                      </label>
                      <span className={`text-xs ${problem.length > MAX_LENGTH ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                        {problem.length} / {MAX_LENGTH}
                      </span>
                    </div>
                    <textarea
                      value={problem}
                      onChange={(e) => setProblem(e.target.value)}
                      placeholder="请详细描述您遇到的问题或改进建议..."
                      className="h-40 w-full resize-none rounded-xl border border-gray-200 p-4 text-sm focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
                      maxLength={MAX_LENGTH + 50} // 允许溢出一点点以便显示错误提示
                    />
                  </div>

                  {status === 'error' && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {errorMessage}
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !problem.trim() || problem.length > MAX_LENGTH}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 font-bold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        提交反馈
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50/50 px-6 py-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                AI Novel Studio · Quality Feedback System
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
