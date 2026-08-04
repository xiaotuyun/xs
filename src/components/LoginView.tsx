import React, { useState } from 'react';
import { BookOpen, Lock, User, Eye, EyeOff, ShieldCheck, Sparkles, KeyRound, Check, Loader2 } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [accountInput, setAccountInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 修改密码 modal / 弹窗
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetOldPass, setResetOldPass] = useState('');
  const [resetNewAccount, setResetNewAccount] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!accountInput.trim() || !passwordInput.trim()) {
      setErrorMessage('请输入完整的账号和密码');
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: accountInput.trim(),
          password: passwordInput,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('ai_novel_studio_auth_logged_in', 'true');
        onLoginSuccess();
      } else {
        setErrorMessage(data.error || '账号或密码不正确，请重新输入');
        triggerShake();
      }
    } catch (err) {
      console.error('Login request failed:', err);
      setErrorMessage('服务器网络连接异常，请重试');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  const handleUpdateAccountPass = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);

    if (!resetOldPass) {
      setResetMsg({ type: 'error', text: '请输入原密码！' });
      return;
    }

    if (!resetNewAccount.trim() || !resetNewPass.trim()) {
      setResetMsg({ type: 'error', text: '新账号和新密码不能为空！' });
      return;
    }

    if (resetNewPass !== resetConfirmPass) {
      setResetMsg({ type: 'error', text: '两次输入的新密码不一致！' });
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: resetOldPass,
          newAccount: resetNewAccount.trim(),
          newPassword: resetNewPass.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResetMsg({ type: 'success', text: data.message || '账号密码重置成功！请使用新凭证登录。' });
        setTimeout(() => {
          setShowResetModal(false);
          setResetOldPass('');
          setResetNewAccount('');
          setResetNewPass('');
          setResetConfirmPass('');
          setResetMsg(null);
        }, 1500);
      } else {
        setResetMsg({ type: 'error', text: data.error || '原密码验证失败或修改未成功！' });
      }
    } catch (err) {
      console.error('Change password error:', err);
      setResetMsg({ type: 'error', text: '网络请求失败，请稍后重试！' });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 flex items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-amber-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div
        className={`w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-stone-200/80 p-8 z-10 transition-transform ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header Icon & Title */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-600/30 ring-4 ring-amber-100">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">AI 智笔小说工坊</h2>
            <p className="text-xs font-semibold text-amber-700/90 mt-1 flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> 智能创作者工作台
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Account Field */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              账号
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
                placeholder="请输入您的账号"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              密码
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="请输入您的密码"
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-70 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-600/25 hover:shadow-amber-600/40 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>验证登录中...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>登录进入系统</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info & Modify Password Button */}
        <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowResetModal(true);
              setResetNewAccount('');
            }}
            className="text-xs text-stone-500 hover:text-amber-700 font-medium underline flex items-center gap-1 cursor-pointer transition-colors"
          >
            <KeyRound className="w-3 h-3" /> 修改账号或密码
          </button>
        </div>
      </div>

      {/* Modify Account/Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-stone-900">修改登录凭证</h3>
            </div>

            {resetMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  resetMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {resetMsg.type === 'success' && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span>{resetMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateAccountPass} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">原密码</label>
                <input
                  type="password"
                  value={resetOldPass}
                  onChange={(e) => setResetOldPass(e.target.value)}
                  placeholder="请输入当前的原密码"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                  disabled={isResetting}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">新账号</label>
                <input
                  type="text"
                  value={resetNewAccount}
                  onChange={(e) => setResetNewAccount(e.target.value)}
                  placeholder="请输入新的账号"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                  disabled={isResetting}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">新密码</label>
                <input
                  type="password"
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  placeholder="请输入新的密码"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                  disabled={isResetting}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">确认新密码</label>
                <input
                  type="password"
                  value={resetConfirmPass}
                  onChange={(e) => setResetConfirmPass(e.target.value)}
                  placeholder="再次输入新的密码"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                  disabled={isResetting}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={isResetting}
                  className="px-3 py-1.5 border border-stone-300 rounded-lg text-stone-600 text-xs font-medium hover:bg-stone-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                >
                  {isResetting ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
