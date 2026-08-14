import React, { useState, useEffect } from 'react';
import { TabType } from '../types';
import { 
  ArrowLeft,
  Search, 
  RotateCw, 
  Clock, 
  Edit2, 
  Shield, 
  Users, 
  Loader2, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface AdminSettingsViewProps {
  setActiveTab: (tab: TabType) => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ setActiveTab }) => {
  const userEmail = localStorage.getItem('ai_novel_studio_user_email') || '';
  const isEmailUser = userEmail.trim().toLowerCase().includes('@') || localStorage.getItem(`ai_novel_studio_login_type_${userEmail.trim().toLowerCase()}`) === 'email_limited';

  if (isEmailUser) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-sm border border-stone-200 text-center space-y-4">
        <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-stone-900">暂无访问权限</h2>
        <p className="text-xs text-stone-500 leading-relaxed">
          通过邮箱注册和验证码登录的用户不支持访问此系统设置面板。
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
        >
          返回仪表盘
        </button>
      </div>
    );
  }

  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [editingUser, setEditingUser] = useState<{ email: string; maxSeconds: number } | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取配置好的 API 绑定地址 (获取配置优先级：新版注册 D1 API > 原本 D1 API > 环境变量)
  const getCandidateApiEndpoints = (path: string) => {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const list: string[] = [];

    const cloudApiUrlNew = localStorage.getItem('ai_novel_studio_cloud_api_url_userdatas') || 
                           (import.meta as any).env.VITE_CLOUD_API_URL || '';
    const cloudApiUrlOriginal = localStorage.getItem('ai_novel_studio_cloud_api_url_original') || 
                               localStorage.getItem('ai_novel_studio_cloud_api_url') || '';

    const newUrl = cloudApiUrlNew.trim().replace(/\/+$/, '');
    const origUrl = cloudApiUrlOriginal.trim().replace(/\/+$/, '');

    if (newUrl) list.push(`${newUrl}${cleanPath}`);
    if (origUrl) list.push(`${origUrl}${cleanPath}`);
    
    // 容器部署相对地址
    list.push(cleanPath);

    return Array.from(new Set(list));
  };

  // 获取体验用户记录列表
  const fetchAdminUsers = async () => {
    setIsAdminLoading(true);
    setAdminFeedback(null);
    try {
      const endpoints = getCandidateApiEndpoints('/api/admin/users');
      let success = false;
      const keyToUse = localStorage.getItem('ai_novel_studio_cloud_api_key')?.trim() || '';

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
        setAdminFeedback({ type: 'error', text: `拉取用户列表失败 [${lastErrorDetail}]。请核对 D1 数据库绑定或 Worker 是否正常运行。` });
      }
    } catch (e: any) {
      setAdminFeedback({ type: 'error', text: e.message || '获取用户列表失败' });
    } finally {
      setIsAdminLoading(false);
    }
  };

  // 给特定账号修改体验秒数限制
  const handleUpdateUserDuration = async (email: string, maxSeconds: number) => {
    setIsUpdatingUser(true);
    setAdminFeedback(null);
    try {
      const endpoints = getCandidateApiEndpoints('/api/admin/update-time');
      let success = false;
      const keyToUse = localStorage.getItem('ai_novel_studio_cloud_api_key')?.trim() || '';

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

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const filteredUsers = adminUsers.filter(u => 
    (u.email || '').toLowerCase().includes(adminSearch.toLowerCase()) || 
    (u.account || '').toLowerCase().includes(adminSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-100 rounded-xl">
            <Shield className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900">系统设置</h1>
            <p className="text-xs text-stone-500 mt-0.5">全面管理与控制云端体验账户、使用时长及试用额度</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-1.5 px-4 py-2 border border-stone-300 hover:bg-stone-100 rounded-xl text-stone-700 text-xs font-bold cursor-pointer transition-colors shadow-2xs bg-white"
        >
          <ArrowLeft className="w-4 h-4" />
          返回仪表盘
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-6">
        {/* Info banner */}
        <div className="bg-amber-50/75 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 leading-relaxed flex gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">云端体验账户时间控制：</span>
            <span>可管理、延展和充值所有注册账号的使用时间。系统默认新用户给予 60 秒试用，在此追加的额度将实时同步并在下一次请求中更新。</span>
          </div>
        </div>

        {/* Search bar & Refresh */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              placeholder="搜索用户邮箱或账号..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none bg-stone-50/50 transition-all font-medium"
            />
          </div>
          <button
            type="button"
            onClick={fetchAdminUsers}
            disabled={isAdminLoading}
            className="px-4 py-2.5 border border-stone-300 rounded-xl hover:bg-stone-100 text-stone-700 text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5 bg-white shadow-2xs"
            title="刷新数据"
          >
            <RotateCw className={`w-4 h-4 ${isAdminLoading ? 'animate-spin' : ''}`} />
            刷新列表
          </button>
        </div>

        {/* Feedback Messages */}
        {adminFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              adminFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {adminFeedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="flex-1 leading-snug">{adminFeedback.text}</span>
            <button type="button" onClick={() => setAdminFeedback(null)} className="text-xs text-stone-400 hover:text-stone-600 px-1">✕</button>
          </div>
        )}

        {/* Recharge Inline Panel */}
        {editingUser && (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 animate-fade-in">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-700" />
                正在调整：<span className="font-mono text-amber-800 font-bold">{editingUser.email}</span>
              </span>
              <button 
                type="button" 
                onClick={() => setEditingUser(null)} 
                className="text-stone-400 hover:text-stone-600 text-xs font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 60 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +1分钟 (60s)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 600 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +10分钟 (600s)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 3600 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +1小时 (3600s)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 86400 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +1天 (24小时)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 2592000 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +1个月 (30天)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: editingUser.maxSeconds + 31536000 })}
                className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                +1年 (365天)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: 999999999 })}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                无限时长 (免流)
              </button>
              <button
                type="button"
                onClick={() => setEditingUser({ ...editingUser, maxSeconds: 60 })}
                className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                设为初始60秒
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                value={editingUser.maxSeconds}
                onChange={(e) => setEditingUser({ ...editingUser, maxSeconds: Math.max(0, parseInt(e.target.value) || 0) })}
                className="flex-1 p-2.5 rounded-xl border border-stone-300 text-xs font-mono bg-white outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                placeholder="直接输入最大可用体验秒数限制"
              />
              <button
                type="button"
                disabled={isUpdatingUser}
                onClick={() => handleUpdateUserDuration(editingUser.email, editingUser.maxSeconds)}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
              >
                {isUpdatingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                保存设置
              </button>
            </div>
          </div>
        )}

        {/* Users List Area */}
        <div className="border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden bg-stone-50/50">
          {isAdminLoading && adminUsers.length === 0 ? (
            <div className="p-16 text-center text-xs text-stone-500 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-600" />
              <p className="font-medium">正在拉取云端数据库注册用户列表...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-16 text-center text-xs text-stone-400">
              {adminUsers.length === 0 ? '数据库中尚无注册用户或当前无可用链接' : '没有找到匹配的体验账户记录'}
            </div>
          ) : (
            filteredUsers.map((user: any) => {
              const isUnlimited = user.max_seconds >= 99999;
              const isExpired = user.used_seconds >= user.max_seconds;
              return (
                <div key={user.id || user.email} className="p-4 hover:bg-white flex items-center justify-between text-xs transition-colors">
                  <div className="space-y-1">
                    <div className="font-bold text-stone-900 flex items-center gap-2">
                      <span className="font-mono text-sm">{user.email || user.account}</span>
                      {(user.email || user.account) && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                          {(user.email && user.email.includes('@')) ? '邮箱体验' : '体验账户'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono">
                      注册时间: {user.created_at ? user.created_at.replace('T', ' ').slice(0, 19) : '未知'}
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-stone-800">
                        已用 <span className="text-stone-500 font-mono">{user.used_seconds}s</span> / 
                        上限 <span className="text-amber-800 font-mono font-bold">{isUnlimited ? '无限' : `${user.max_seconds}s`}</span>
                      </div>
                      <div>
                        {isUnlimited ? (
                          <span className="inline-block text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">免流不限时</span>
                        ) : isExpired ? (
                          <span className="inline-block text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">已超限锁定</span>
                        ) : (
                          <span className="inline-block text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                            剩余 {Math.max(0, user.max_seconds - user.used_seconds)} 秒
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingUser({ email: user.email, maxSeconds: user.max_seconds })}
                      className="px-3 py-2 border border-stone-200 hover:bg-amber-50 hover:border-amber-300 text-stone-600 hover:text-amber-700 rounded-xl cursor-pointer transition-all bg-white shadow-2xs flex items-center gap-1 font-bold"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>调整时长</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
