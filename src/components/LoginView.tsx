import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  KeyRound,
  Check,
  Loader2,
  Database,
  Mail,
  Send,
  UserPlus,
  LogIn,
  Shield,
  Clock,
  Search,
  Users,
  RotateCw,
  Edit2,
  Lightbulb
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
  onOpenUsageGuide?: () => void;
}

type AuthMode = 'login_pass' | 'login_code' | 'register';

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onOpenUsageGuide }) => {
  // 当前认证模式：'login_pass' (密码登录) | 'login_code' (验证码登录) | 'register' (邮箱注册)
  const [authMode, setAuthMode] = useState<AuthMode>('login_pass');

  // 表单状态
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 状态反馈
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 验证码倒计时
  const [countdown, setCountdown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // 修改密码 modal / 弹窗
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetMode, setResetMode] = useState<'password' | 'code'>('password');
  const [resetOldPass, setResetOldPass] = useState('');
  const [resetCodeEmail, setResetCodeEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetCodeCountdown, setResetCodeCountdown] = useState(0);
  const [isSendingResetCode, setIsSendingResetCode] = useState(false);
  const [resetNewAccount, setResetNewAccount] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cloudflare Worker / 云端 D1 API 配置 modal (两套绑定支持)
  const [showApiModal, setShowApiModal] = useState(false);
  
  // 管理后台 D1 用户管理及充值体验时长相关状态
  const [apiModalTab, setApiModalTab] = useState<'config' | 'users'>('config');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [editingUser, setEditingUser] = useState<{ email: string; maxSeconds: number } | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. 原来的/旧版 D1 数据库绑定
  const [cloudApiUrlOriginal, setCloudApiUrlOriginal] = useState(() => {
    return localStorage.getItem('ai_novel_studio_cloud_api_url_original') || 
           localStorage.getItem('ai_novel_studio_cloud_api_url') || '';
  });

  // 2. 新版 D1 数据库绑定 (邮箱注册绑定请使用这个)
  const [cloudApiUrlNew, setCloudApiUrlNew] = useState(() => {
    return localStorage.getItem('ai_novel_studio_cloud_api_url_userdatas') || 
           (import.meta as any).env.VITE_CLOUD_API_URL || '';
  });

  // 3. 鉴权密钥 (选填)
  const [workerDatasKey, setWorkerDatasKey] = useState(() => {
    return localStorage.getItem('ai_novel_studio_cloud_api_key') || '';
  });

  // 获取所有 D1 体验用户记录列表
  const fetchAdminUsers = async () => {
    setIsAdminLoading(true);
    setAdminFeedback(null);
    try {
      const endpoints = getCandidateApiEndpoints('/api/admin/users', true);
      let success = false;
      const keyToUse = workerDatasKey.trim() || localStorage.getItem('ai_novel_studio_cloud_api_key')?.trim() || '';

      let lastErrorDetail = '';
      for (const ep of endpoints) {
        try {
          const urlWithQuery = keyToUse ? `${ep}${ep.includes('?') ? '&' : '?'}admin_key=${encodeURIComponent(keyToUse)}` : ep;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (keyToUse) {
            headers['Authorization'] = `Bearer ${keyToUse}`;
          }

          const response = await fetch(urlWithQuery, {
            method: 'POST',
            headers,
            body: JSON.stringify({ admin_key: keyToUse })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setAdminUsers(data.users || []);
              success = true;
              break;
            } else {
              lastErrorDetail = data.error || 'Server returned success:false';
            }
          } else {
            const errData = await response.json().catch(() => ({}));
            lastErrorDetail = errData.error || `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (err: any) {
          lastErrorDetail = err.message || 'Network fetch failed (CORS or offline)';
        }
      }
      if (!success) {
        setAdminFeedback({ type: 'error', text: `拉取用户列表失败 [${lastErrorDetail}]。请核对 D1 数据库绑定或 Worker 是否已更新并正常运行。` });
      }

    } catch (e: any) {
      setAdminFeedback({ type: 'error', text: e.message || '获取用户列表失败' });
    } finally {
      setIsAdminLoading(false);
    }
  };

  // 给特定账号修改或追加体验秒数
  const handleUpdateUserDuration = async (email: string, maxSeconds: number) => {
    setIsUpdatingUser(true);
    setAdminFeedback(null);
    try {
      const endpoints = getCandidateApiEndpoints('/api/admin/update-time', true);
      let success = false;
      const keyToUse = workerDatasKey.trim() || localStorage.getItem('ai_novel_studio_cloud_api_key')?.trim() || '';

      let lastErrorDetail = '';
      for (const ep of endpoints) {
        try {
          const urlWithQuery = keyToUse ? `${ep}${ep.includes('?') ? '&' : '?'}admin_key=${encodeURIComponent(keyToUse)}` : ep;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (keyToUse) {
            headers['Authorization'] = `Bearer ${keyToUse}`;
          }

          const response = await fetch(urlWithQuery, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, max_seconds: maxSeconds, admin_key: keyToUse })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setAdminFeedback({ type: 'success', text: `成功将账号 (${email}) 的体验上限设置为 ${maxSeconds} 秒！` });
              success = true;
              break;
            } else {
              lastErrorDetail = data.error || 'Server returned success:false';
            }
          } else {
            const errData = await response.json().catch(() => ({}));
            lastErrorDetail = errData.error || `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (err: any) {
          lastErrorDetail = err.message || 'Network fetch failed (CORS or offline)';
        }
      }
      if (success) {
        setEditingUser(null);
        await fetchAdminUsers();
      } else {
        setAdminFeedback({ type: 'error', text: `更新体验时长限额失败 [${lastErrorDetail}]，请核对 Worker 通讯状态。` });
      }
    } catch (e: any) {
      setAdminFeedback({ type: 'error', text: e.message || '网络连接异常' });
    } finally {
      setIsUpdatingUser(false);
    }
  };

  // 定期在打开 Tab 时拉取数据
  useEffect(() => {
    if (showApiModal && apiModalTab === 'users') {
      fetchAdminUsers();
    }
  }, [showApiModal, apiModalTab]);

  // 获取可用于请求的所有 Worker / API 候选 URL 列表
  const getCandidateApiEndpoints = (path: string, preferNew = true) => {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const list: string[] = [];

    const newUrl = cloudApiUrlNew.trim().replace(/\/+$/, '');
    const origUrl = cloudApiUrlOriginal.trim().replace(/\/+$/, '');

    // 支持双 Worker 候选依次探测，确保两套数据库均可登录
    if (preferNew) {
      if (newUrl) list.push(`${newUrl}${cleanPath}`);
      if (origUrl) list.push(`${origUrl}${cleanPath}`);
    } else {
      if (origUrl) list.push(`${origUrl}${cleanPath}`);
      if (newUrl) list.push(`${newUrl}${cleanPath}`);
    }

    // 总是包含本域相对路径 (适配容器/全栈 Node 环境)
    list.push(cleanPath);

    return Array.from(new Set(list));
  };

  // 依次尝试所有候选 API 接口，直到某个成功返回 success
  const tryAuthRequest = async (path: string, body: any, preferNew = true) => {
    const candidateEndpoints = getCandidateApiEndpoints(path, preferNew);
    let lastError = '';
    
    const savedKey = workerDatasKey.trim() || localStorage.getItem('ai_novel_studio_cloud_api_key')?.trim() || '';
    if (savedKey) {
      body.admin_key = savedKey;
    }

    for (const ep of candidateEndpoints) {
      try {
        const urlWithQuery = savedKey ? `${ep}${ep.includes('?') ? '&' : '?'}admin_key=${encodeURIComponent(savedKey)}` : ep;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (savedKey) {
          headers['Authorization'] = `Bearer ${savedKey}`;
        }

        const response = await fetch(urlWithQuery, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (response.ok && data.success) {
            return { ok: true, data, endpoint: ep };
          } else {
            const errMsg = data.error || data.message || '';
            // 如果接口返回了 403 Forbidden（代表体验超时锁定），或者错误包含达到上限字眼，立即阻断后续降级候选，返回该错误
            if (response.status === 403 || errMsg.includes('达到') || errMsg.includes('上限') || errMsg.includes('时间') || errMsg.includes('额度') || errMsg.includes('过期')) {
              return { ok: false, error: errMsg || '该体验账户已达到使用时间上限。如果需要增加时长，请联系管理员！' };
            }
            if (errMsg) {
              lastError = errMsg;
            }
          }
        }
      } catch (e: any) {
        if (!lastError) lastError = e.message || '网络连接异常';
      }
    }

    return { ok: false, error: lastError || '验证失败，请核对凭证或绑定的 Cloudflare Worker' };
  };

  // 倒计时计时器
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 检查是否有关联的体验时间到期提示
  useEffect(() => {
    const checkTimeout = async () => {
      if (localStorage.getItem('ai_novel_studio_timeout_active') === 'true') {
        const expiredEmail = localStorage.getItem('ai_novel_studio_timeout_email') || localStorage.getItem('ai_novel_studio_user_email') || '未知账号';
        
        // 尝试向服务器查询最新状态，如果已被管理员增加时间，则自动解除限制并恢复登录
        try {
          const apiURL = (localStorage.getItem('ai_novel_studio_cloud_api_url_userdatas') || (import.meta as any).env.VITE_CLOUD_API_URL || '').trim();
          const fetchBase = apiURL ? apiURL.replace(/\/$/, '') : '';
          const res = await fetch(`${fetchBase}/api/auth/sync-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: expiredEmail, increment: 0 })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && !data.expired) {
              // 服务器显示时间已增加，解除限制！
              localStorage.removeItem('ai_novel_studio_timeout_active');
              localStorage.setItem('ai_novel_studio_auth_logged_in', 'true');
              window.location.reload();
              return;
            }
          }
        } catch(e) {
          console.warn('恢复体验时间检查失败', e);
        }

        const usedS = localStorage.getItem('ai_novel_studio_timeout_used') || '';
        const maxS = localStorage.getItem('ai_novel_studio_timeout_max') || '';
        
        let detailStr = '';
        if (usedS && maxS) {
          detailStr = `（累计已用 ${usedS} 秒 / 最大限制 ${maxS} 秒，剩余 0 秒）`;
        } else {
          detailStr = `（已达到使用时间上限，剩余 0 秒）`;
        }

        setErrorMessage(`⚠️ 体验额度已用尽：账号 [${expiredEmail}] 已达到使用时间上限 ${detailStr}。如果需要增加时长，请联系管理员！`);
        setAuthMode('login_pass');
      }
    };
    checkTimeout();
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  // 发送 QQ 邮箱验证码
  const handleSendCode = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!emailInput.trim() || !emailInput.toLowerCase().endsWith('@qq.com')) {
      setErrorMessage('请输入有效的 QQ 邮箱 (例如: 12345@qq.com)');
      triggerShake();
      return;
    }

    setIsSendingCode(true);

    try {
      // 1. 尝试使用全栈 Node.js 服务端发送真实 QQ 邮箱 SMTP
      const activeWorkerUrl = cloudApiUrlNew.trim() || cloudApiUrlOriginal.trim();
      const localRes = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), cloudWorkerUrl: activeWorkerUrl }),
      }).catch(() => null);

      if (localRes) {
        const data = await localRes.json().catch(() => ({}));
        if (data.success) {
          setSuccessMessage(data.message || `验证码已发送至 ${emailInput.trim()}，请打开邮箱查收并输入验证码！`);
          setCountdown(60);
          setIsSendingCode(false);
          return;
        }
      }
    } catch {}

    // 2. 尝试备用或绑定的 Cloudflare Worker D1 接口
    const result = await tryAuthRequest('/api/auth/send-code', { email: emailInput.trim() }, true);
    if (result.ok) {
      if (result.data && result.data.code) {
        setCodeInput(result.data.code);
        setSuccessMessage(`验证码: ${result.data.code} （Worker 已将验证码写入 D1 数据库。因无发信域名，系统已自动为您填充此验证码）`);
      } else {
        setSuccessMessage(result.data.message || `验证码已发送至 ${emailInput.trim()}，请查收邮件！`);
      }
      setCountdown(60);
      setIsSendingCode(false);
      return;
    } else {
      setErrorMessage(result.error || '发送验证码失败，请检查邮箱地址或 Cloudflare 绑定。');
      triggerShake();
      setIsSendingCode(false);
    }
  };

  // 统一提交登录或注册
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!emailInput.trim()) {
      setErrorMessage('请输入您的账号或邮箱');
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      // ===== 模式 1：邮箱新用户注册 =====
      if (authMode === 'register') {
        if (!emailInput.trim().toLowerCase().endsWith('@qq.com')) {
          setErrorMessage('请输入有效的 QQ 邮箱以进行注册');
          triggerShake();
          setIsLoading(false);
          return;
        }
        if (!codeInput.trim()) {
          setErrorMessage('请输入邮箱验证码');
          triggerShake();
          setIsLoading(false);
          return;
        }
        if (!passwordInput.trim() || passwordInput.trim().length < 6) {
          setErrorMessage('注册密码不能少于 6 个字符');
          triggerShake();
          setIsLoading(false);
          return;
        }
        if (passwordInput !== confirmPasswordInput) {
          setErrorMessage('两次输入的密码不一致，请核对');
          triggerShake();
          setIsLoading(false);
          return;
        }

        const activeWorkerUrl = cloudApiUrlNew.trim() || cloudApiUrlOriginal.trim();
        const result = await tryAuthRequest('/api/auth/register', {
          email: emailInput.trim(),
          password: passwordInput.trim(),
          code: codeInput.trim(),
          cloudWorkerUrl: activeWorkerUrl,
        }, true);

        if (result.ok) {
          const emailValue = emailInput.trim();
          setSuccessMessage('🎉 注册成功！正在自动登录...');
          setTimeout(() => {
            localStorage.setItem('ai_novel_studio_auth_logged_in', 'true');
            localStorage.setItem('ai_novel_studio_user_email', emailValue);
            localStorage.setItem(`ai_novel_studio_login_type_${emailValue.toLowerCase()}`, 'email_limited');
            localStorage.removeItem('ai_novel_studio_timeout_active');
            localStorage.removeItem('ai_novel_studio_timeout_email');
            onLoginSuccess();
          }, 1200);
          return;
        } else {
          setErrorMessage(result.error || '注册失败，请检查验证码或邮箱');
          triggerShake();
          setIsLoading(false);
          return;
        }
      }

      // ===== 模式 2：验证码快捷登录 =====
      if (authMode === 'login_code') {
        if (!emailInput.trim().toLowerCase().endsWith('@qq.com')) {
          setErrorMessage('验证码登录需使用有效的 QQ 邮箱');
          triggerShake();
          setIsLoading(false);
          return;
        }
        if (!codeInput.trim()) {
          setErrorMessage('请输入邮箱验证码');
          triggerShake();
          setIsLoading(false);
          return;
        }

        const activeWorkerUrl = cloudApiUrlNew.trim() || cloudApiUrlOriginal.trim();
        const result = await tryAuthRequest('/api/auth/login', {
          account: emailInput.trim(),
          email: emailInput.trim(),
          code: codeInput.trim(),
          loginType: 'code',
          cloudWorkerUrl: activeWorkerUrl,
        }, true);

        if (result.ok) {
          const emailValue = emailInput.trim();
          localStorage.setItem('ai_novel_studio_auth_logged_in', 'true');
          localStorage.setItem('ai_novel_studio_user_email', emailValue);
          localStorage.setItem(`ai_novel_studio_login_type_${emailValue.toLowerCase()}`, 'email_limited');
          localStorage.removeItem('ai_novel_studio_timeout_active');
          localStorage.removeItem('ai_novel_studio_timeout_email');
          onLoginSuccess();
          return;
        } else {
          setErrorMessage(result.error || '验证码不正确或已过期');
          triggerShake();
          setIsLoading(false);
          return;
        }
      }

      // ===== 模式 3：账号/邮箱密码登录 =====
      if (authMode === 'login_pass') {
        if (!passwordInput.trim()) {
          setErrorMessage('请输入登录密码');
          triggerShake();
          setIsLoading(false);
          return;
        }

        const activeWorkerUrl = cloudApiUrlNew.trim() || cloudApiUrlOriginal.trim();
        const result = await tryAuthRequest('/api/auth/login', {
          account: emailInput.trim(),
          password: passwordInput.trim(),
          loginType: 'password',
          cloudWorkerUrl: activeWorkerUrl,
        }, true);

        if (result.ok) {
          const emailValue = emailInput.trim();
          localStorage.setItem('ai_novel_studio_auth_logged_in', 'true');
          localStorage.setItem('ai_novel_studio_user_email', emailValue);
          if (emailValue.includes('@')) {
            localStorage.setItem(`ai_novel_studio_login_type_${emailValue.toLowerCase()}`, 'email_limited');
          }
          localStorage.removeItem('ai_novel_studio_timeout_active');
          localStorage.removeItem('ai_novel_studio_timeout_email');
          onLoginSuccess();
          return;
        } else {
          setErrorMessage(result.error || '账号/邮箱或密码不正确，请重新输入');
          triggerShake();
          setIsLoading(false);
          return;
        }
      }
    } catch (err: any) {
      console.warn('Network or API auth error:', err);
    }

    setErrorMessage('登录/注册验证失败，请确认输入的网络与凭证');
    triggerShake();
    setIsLoading(false);
  };

  // 密码重置验证码倒计时
  useEffect(() => {
    if (resetCodeCountdown <= 0) return;
    const timer = setInterval(() => {
      setResetCodeCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCodeCountdown]);

  // 重置密码模态框内发送验证码
  const handleSendResetCode = async () => {
    setResetMsg(null);
    const emailToUse = resetCodeEmail.trim() || emailInput.trim();
    if (!emailToUse || !emailToUse.includes('@')) {
      setResetMsg({ type: 'error', text: '请输入有效的邮箱地址以接收验证码！' });
      return;
    }

    setIsSendingResetCode(true);

    try {
      const activeWorkerUrl = cloudApiUrlNew.trim() || cloudApiUrlOriginal.trim();
      const localRes = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, cloudWorkerUrl: activeWorkerUrl }),
      }).catch(() => null);

      if (localRes) {
        const data = await localRes.json().catch(() => ({}));
        if (data.success) {
          setResetMsg({ type: 'success', text: data.message || `验证码已发送至 ${emailToUse}，请查收！` });
          setResetCodeCountdown(60);
          setIsSendingResetCode(false);
          return;
        }
      }
    } catch {}

    const result = await tryAuthRequest('/api/auth/send-code', { email: emailToUse }, true);
    if (result.ok) {
      if (result.data && result.data.code) {
        setResetCode(result.data.code);
        setResetMsg({ type: 'success', text: `验证码: ${result.data.code}（已自动填充该验证码）` });
      } else {
        setResetMsg({ type: 'success', text: result.data.message || `验证码已发送至 ${emailToUse}，请查收！` });
      }
      setResetCodeCountdown(60);
    } else {
      setResetMsg({ type: 'error', text: result.error || '发送验证码失败，请检查邮箱地址或 Cloudflare 绑定。' });
    }
    setIsSendingResetCode(false);
  };

  // 修改密码处理 (支持原密码修改 & 邮箱验证码重置密码)
  const handleUpdateAccountPass = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);

    if (resetMode === 'password') {
      if (!resetOldPass) {
        setResetMsg({ type: 'error', text: '请输入当前的原密码！' });
        return;
      }

      if (!resetNewPass.trim()) {
        setResetMsg({ type: 'error', text: '新密码不能为空！' });
        return;
      }

      if (resetNewPass !== resetConfirmPass) {
        setResetMsg({ type: 'error', text: '两次输入的新密码不一致！' });
        return;
      }

      setIsResetting(true);

      const result = await tryAuthRequest('/api/auth/change-password', {
        oldPassword: resetOldPass,
        newAccount: undefined,
        newPassword: resetNewPass.trim(),
        currentAccount: resetNewAccount.trim() || emailInput.trim() || undefined,
        resetType: 'password',
      });

      if (result.ok) {
        setResetMsg({ type: 'success', text: result.data.message || '账号密码修改成功！' });
        setTimeout(() => {
          setShowResetModal(false);
          setResetOldPass('');
          setResetNewAccount('');
          setResetNewPass('');
          setResetConfirmPass('');
          setResetMsg(null);
        }, 1500);
      } else {
        setResetMsg({ type: 'error', text: result.error || '原密码验证不正确，请重新核对！' });
      }
      setIsResetting(false);
    } else {
      // 邮箱验证码重置密码模式
      const emailToUse = resetCodeEmail.trim() || emailInput.trim();
      if (!emailToUse || !emailToUse.includes('@')) {
        setResetMsg({ type: 'error', text: '请输入接收验证码的完整邮箱地址！' });
        return;
      }

      if (!resetCode.trim()) {
        setResetMsg({ type: 'error', text: '请输入邮箱验证码！' });
        return;
      }

      if (!resetNewPass.trim()) {
        setResetMsg({ type: 'error', text: '新密码不能为空！' });
        return;
      }

      if (resetNewPass.length < 6) {
        setResetMsg({ type: 'error', text: '新密码不能少于 6 位字符！' });
        return;
      }

      if (resetNewPass !== resetConfirmPass) {
        setResetMsg({ type: 'error', text: '两次输入的新密码不一致！' });
        return;
      }

      setIsResetting(true);

      const result = await tryAuthRequest('/api/auth/change-password', {
        email: emailToUse,
        code: resetCode.trim(),
        newPassword: resetNewPass.trim(),
        newAccount: resetNewAccount.trim() || emailToUse,
        resetType: 'code',
      }, true);

      if (result.ok) {
        setResetMsg({ type: 'success', text: result.data.message || '密码通过验证码成功重置！' });
        setTimeout(() => {
          setShowResetModal(false);
          setResetCode('');
          setResetCodeEmail('');
          setResetNewAccount('');
          setResetNewPass('');
          setResetConfirmPass('');
          setResetMsg(null);
        }, 1500);
      } else {
        setResetMsg({ type: 'error', text: result.error || '验证码错误或重置密码失败，请重试！' });
      }
      setIsResetting(false);
    }
  };

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (cloudApiUrlOriginal.trim()) {
      localStorage.setItem('ai_novel_studio_cloud_api_url_original', cloudApiUrlOriginal.trim());
      localStorage.setItem('ai_novel_studio_cloud_api_url', cloudApiUrlOriginal.trim());
    } else {
      localStorage.removeItem('ai_novel_studio_cloud_api_url_original');
      localStorage.removeItem('ai_novel_studio_cloud_api_url');
    }

    if (cloudApiUrlNew.trim()) {
      localStorage.setItem('ai_novel_studio_cloud_api_url_userdatas', cloudApiUrlNew.trim());
    } else {
      localStorage.removeItem('ai_novel_studio_cloud_api_url_userdatas');
    }

    if (workerDatasKey.trim()) {
      localStorage.setItem('ai_novel_studio_cloud_api_key', workerDatasKey.trim());
    } else {
      localStorage.removeItem('ai_novel_studio_cloud_api_key');
    }

    setShowApiModal(false);
    alert('Cloudflare D1 数据库绑定配置已更新！');
  };

  const handleDisconnectOriginal = () => {
    localStorage.removeItem('ai_novel_studio_cloud_api_url_original');
    localStorage.removeItem('ai_novel_studio_cloud_api_url');
    setCloudApiUrlOriginal('');
  };

  const handleDisconnectNew = () => {
    localStorage.removeItem('ai_novel_studio_cloud_api_url_userdatas');
    setCloudApiUrlNew('');
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 flex items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-amber-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div
        className={`w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-stone-200/80 p-8 z-10 transition-all ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header Icon & Title */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-600/30 ring-4 ring-amber-100">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">AI 智笔小说工坊</h2>
            <p className="text-xs font-semibold text-amber-700/90 mt-1 flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> 智能网文创作与协同平台
              <button
                type="button"
                onClick={onOpenUsageGuide}
                className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-[10px] flex items-center gap-1 cursor-pointer border border-amber-200 shadow-sm"
              >
                <Lightbulb className="w-3 h-3" /> 使用说明
              </button>
            </p>
          </div>
        </div>

        {/* Tab Switcher: 密码登录 / 邮箱接码登录 / 邮箱注册 */}
        <div className="flex bg-stone-100 p-1 rounded-xl mb-6 border border-stone-200/60 text-[10px] sm:text-xs font-bold text-stone-600">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login_pass');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`flex-1 py-2.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
              authMode === 'login_pass' ? 'bg-white text-amber-800 shadow-xs' : 'hover:text-stone-900'
            }`}
          >
            <LogIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 
            <span>密码登录</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('login_code');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`flex-1 py-2.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
              authMode === 'login_code' ? 'bg-white text-amber-800 shadow-xs' : 'hover:text-stone-900'
            }`}
          >
            <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 
            <span>接码登录</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`flex-1 py-2.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
              authMode === 'register' ? 'bg-white text-amber-800 shadow-xs' : 'hover:text-stone-900'
            }`}
          >
            <UserPlus className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 
            <span>邮箱注册</span>
          </button>
        </div>

        {/* Alert Message Banners */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email / Account Field */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              {authMode === 'login_pass' ? '账号 / QQ 邮箱' : 'QQ 邮箱'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                {authMode === 'login_pass' ? <User className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
              </div>
              <input
                type={authMode === 'login_pass' ? 'text' : 'email'}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={authMode === 'login_pass' ? '请输入您的账号或电子邮箱' : '请输入您的电子邮箱'}
                className="w-full pl-10 pr-4 py-3 sm:py-3.5 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all shadow-3xs"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Verification Code Field (Shown in login_code and register mode) */}
          {(authMode === 'login_code' || authMode === 'register') && (
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                QQ 邮箱验证码
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="请输入 6 位数字验证码"
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all font-mono tracking-wider"
                    required
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isSendingCode || countdown > 0}
                  className="px-4 py-3 bg-stone-800 hover:bg-stone-900 active:bg-black disabled:bg-stone-300 disabled:text-stone-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isSendingCode ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Password Field (Shown in login_pass and register mode) */}
          {(authMode === 'login_pass' || authMode === 'register') && (
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                {authMode === 'register' ? '设置登录密码' : '密码'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={authMode === 'register' ? '设置 6 位以上密码' : '请输入您的密码'}
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
          )}

          {/* Confirm Password Field (Shown in register mode) */}
          {authMode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                确认登录密码
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="再次输入确认密码"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-70 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-600/25 hover:shadow-amber-600/40 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>验证请求处理中...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {authMode === 'register'
                    ? '提交注册并进入创作台'
                    : authMode === 'login_code'
                    ? '快捷验证码登录'
                    : '登录进入系统'}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Footer options */}
        <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setShowResetModal(true);
                setResetNewAccount('');
              }}
              className="text-[11px] sm:text-xs text-stone-500 hover:text-amber-700 font-medium underline flex items-center gap-1 cursor-pointer transition-colors px-2 py-1"
            >
              <KeyRound className="w-3 h-3" /> 修改密码
            </button>
            <span className="text-stone-300 hidden sm:inline">|</span>
            <button
              type="button"
              onClick={() => setShowApiModal(true)}
              className="text-[11px] sm:text-xs text-stone-500 hover:text-amber-700 font-medium underline flex items-center gap-1 cursor-pointer transition-colors px-2 py-1"
            >
              <Database className="w-3 h-3" /> 数据库绑定
            </button>
          </div>

          {/* Cloudflare Worker status badges */}
          <div className="flex flex-col items-center gap-1.5 mt-2">
            {cloudApiUrlOriginal ? (
              <div className="text-[11px] text-stone-700 font-semibold bg-stone-100 px-3 py-1 rounded-full border border-stone-200 flex items-center gap-2 shadow-2xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>已绑定原本 D1 数据库</span>
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectOriginal}
                  className="text-[10px] text-stone-500 hover:text-red-600 underline font-normal cursor-pointer ml-1 transition-colors"
                  title="解绑原本数据库"
                >
                  解绑
                </button>
              </div>
            ) : null}

            {cloudApiUrlNew ? (
              <div className="text-[11px] text-amber-900 font-semibold bg-amber-50 px-3 py-1 rounded-full border border-amber-200 flex items-center gap-2 shadow-2xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>已绑定新 D1 数据库 <span className="text-amber-700 font-bold">(邮箱注册绑定请使用这个)</span></span>
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectNew}
                  className="text-[10px] text-stone-500 hover:text-red-600 underline font-normal cursor-pointer ml-1 transition-colors"
                  title="解绑新数据库"
                >
                  解绑
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modify Account/Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-scale-up scrollbar-thin">
            <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-stone-900">修改/重置登录凭证</h3>
            </div>

            {/* 模式选择 TAB */}
            <div className="flex bg-stone-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setResetMode('password');
                  setResetMsg(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  resetMode === 'password'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                原密码修改
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetMode('code');
                  setResetMsg(null);
                  if (!resetCodeEmail) setResetCodeEmail(emailInput.trim());
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  resetMode === 'code'
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                邮箱验证码重置
              </button>
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
              {resetMode === 'password' ? (
                /* 模式 1：通过原密码修改 */
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">账号 / 邮箱</label>
                    <input
                      type="text"
                      value={resetNewAccount}
                      onChange={(e) => setResetNewAccount(e.target.value)}
                      placeholder="请输入当前账号或邮箱"
                      className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      required
                      disabled={isResetting}
                    />
                  </div>
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
                </>
              ) : (
                /* 模式 2：忘记原密码，通过邮箱验证码重置 */
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">接收验证码的邮箱</label>
                    <input
                      type="email"
                      value={resetCodeEmail}
                      onChange={(e) => setResetCodeEmail(e.target.value)}
                      placeholder="请输入注册或绑定的电子邮箱"
                      className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      required
                      disabled={isResetting}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">邮箱验证码</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                        className="flex-1 p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                        required
                        disabled={isResetting}
                      />
                      <button
                        type="button"
                        onClick={handleSendResetCode}
                        disabled={isSendingResetCode || resetCodeCountdown > 0}
                        className="px-3 py-2 bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white text-xs font-medium rounded-lg shrink-0 cursor-pointer transition-colors"
                      >
                        {resetCodeCountdown > 0 ? `${resetCodeCountdown}s 后重试` : isSendingResetCode ? '发送中...' : '获取验证码'}
                      </button>
                    </div>
                  </div>
                </>
              )}



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

      {/* Cloudflare D1 / Worker API 配置 Modal */}
      {showApiModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-scale-up scrollbar-thin">
            <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
              <Database className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-stone-900">绑定 Cloudflare D1 数据库</h3>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              系统支持绑定两套 Worker 服务。请输入绑定的 Worker API 域名或 Worker API 服务链接，进行手动配置或同时绑定：
            </p>

            <form onSubmit={handleSaveApiUrl} className="space-y-4">
              {/* 绑定 1：原本 D1 数据库 */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                <label className="block text-xs font-bold text-stone-800 flex items-center justify-between">
                  <span>1. 原本 D1 数据库 (基础账号绑定)</span>
                  {cloudApiUrlOriginal && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-normal">已连接</span>
                  )}
                </label>
                <div className="text-[11px] font-medium text-stone-600">
                  请输入绑定的 Worker API 域名，Worker API 服务链接:
                </div>
                <input
                  type="url"
                  value={cloudApiUrlOriginal}
                  onChange={(e) => setCloudApiUrlOriginal(e.target.value)}
                  placeholder="https://your-worker-subdomain.workers.dev"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none font-mono bg-white"
                />
                
                <div className="mt-3 border-t border-stone-200 pt-3">
                  <div className="text-[11px] font-medium text-stone-600 mb-1 flex justify-between">
                    <span>value</span>
                    <span className="text-stone-400">选填</span>
                  </div>
                  <input
                    type="password"
                    value={workerDatasKey}
                    onChange={(e) => setWorkerDatasKey(e.target.value)}
                    placeholder="请输入 value"
                    className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none font-mono bg-white"
                  />
                </div>

                <p className="text-[10px] text-stone-500 mt-2">
                  说明: 用于原本的基础账号与密码校验，填入正确的 value 可解锁最高管理权限
                </p>
              </div>

              {/* 绑定 2：新 D1 数据库 (邮箱注册绑定请使用这个) */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/90 space-y-1.5">
                <label className="block text-xs font-bold text-amber-900 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    2. 新 D1 数据库
                    <span className="text-amber-800 font-bold bg-amber-200/80 px-1.5 py-0.5 rounded text-[11px]">
                      (邮箱注册绑定请使用这个)
                    </span>
                  </span>
                  {cloudApiUrlNew ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-normal">自定义已连接</span>
                  ) : (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal">系统默认已启用</span>
                  )}
                </label>
                <div className="text-[11px] font-medium text-amber-900">
                  请输入绑定的 Worker API 域名，Worker API 服务链接:
                </div>
                <input
                  type="url"
                  value={cloudApiUrlNew}
                  onChange={(e) => setCloudApiUrlNew(e.target.value)}
                  placeholder="未绑定，默认使用系统内置云端数据库 (已在后台安全托管)"
                  className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none font-mono bg-white"
                />
                <p className="text-[10px] text-amber-800/90 font-medium">
                  说明: 专用于邮箱接码、邮箱账号注册与 xs_userdatas 云端数据同步
                </p>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="flex gap-2">
                  {cloudApiUrlOriginal && (
                    <button
                      type="button"
                      onClick={handleDisconnectOriginal}
                      className="px-2.5 py-1 border border-stone-300 text-stone-600 hover:bg-stone-100 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    >
                      解绑原本
                    </button>
                  )}
                  {cloudApiUrlNew && (
                    <button
                      type="button"
                      onClick={handleDisconnectNew}
                      className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    >
                      解绑新数据库
                    </button>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowApiModal(false)}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg text-stone-600 text-xs font-medium hover:bg-stone-50 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    保存配置
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
