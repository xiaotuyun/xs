import React, { useState, useEffect } from 'react';
import { fetchEnvConfig, apiFetchModels, apiTestModel } from '../lib/aiClient';
import { 
  Key, 
  Sparkles, 
  Check, 
  X, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Send, 
  HelpCircle, 
  Trash2, 
  Eye, 
  EyeOff, 
  Cpu, 
  Plus,
  Play
} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [customModelListUrl, setCustomModelListUrl] = useState('');
  const [customModelBaseUrl, setCustomModelBaseUrl] = useState('');
  const [useChatCompletions, setUseChatCompletions] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [modelsList, setModelsList] = useState<string[]>([]);

  // Model test state
  const [testPrompt, setTestPrompt] = useState('你好！请回复确认当前模型可用。');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelResponse, setModelResponse] = useState<string>('');
  const [testError, setTestError] = useState<string>('');

  // Single-model test states
  const [testingModelIds, setTestingModelIds] = useState<string[]>([]);
  const [singleTestResults, setSingleTestResults] = useState<Record<string, { success: boolean; response?: string; error?: string }>>({});

  // Loaded and saved key check
  const [isSaved, setIsSaved] = useState(false);
  const [envConfig, setEnvConfig] = useState<{
    hasEnvApiKey?: boolean;
    apiKeyMasked?: string;
    customBaseUrl?: string;
    customListUrl?: string;
    defaultModel?: string;
    useChatCompletions?: boolean;
  } | null>(null);

  const preferredModelKeywords = [
    'gpt-4o-mini',
    'gemini-2.5-flash',
    'gpt-4o',
    'claude-3-5-sonnet',
    'gemini-1.5-flash',
    'gpt-3.5-turbo',
  ];

  const findBestDefaultModel = (models: string[]): string => {
    if (!models || models.length === 0) return '';

    // Filter out unusable utility/legacy models
    const validModels = models.filter(m => {
      const lower = m.toLowerCase();
      return !lower.includes('davinci') && 
             !lower.includes('curie') && 
             !lower.includes('babbage') && 
             !lower.includes('ada') &&
             !lower.includes('whisper') &&
             !lower.includes('tts') &&
             !lower.includes('embedding') &&
             !lower.includes('dall-e') &&
             !lower.includes('realtime') &&
             !lower.includes('audio');
    });

    if (validModels.length === 0) return models[0] || '';

    // Step 1: Prefer stable models (without -preview / -exp / dated tags) matching preferred keywords
    for (const pref of preferredModelKeywords) {
      const match = validModels.find(m => {
        const lower = m.toLowerCase();
        const isStable = !lower.includes('preview') && !lower.includes('exp') && !/-\d{2}-\d{2}/.test(lower);
        return isStable && lower.includes(pref);
      });
      if (match) return match;
    }

    // Step 2: Any preferred model matching keywords
    for (const pref of preferredModelKeywords) {
      const match = validModels.find(m => m.toLowerCase().includes(pref));
      if (match) return match;
    }

    // Step 3: Any stable model without preview/exp/date tags
    const anyStable = validModels.find(m => {
      const lower = m.toLowerCase();
      return !lower.includes('preview') && !lower.includes('exp') && !/-\d{2}-\d{2}/.test(lower);
    });

    return anyStable || validModels[0] || '';
  };

  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem('ai_novel_studio_apikey') || '';
      let savedModel = localStorage.getItem('ai_novel_studio_model') || '';
      const savedListUrl = localStorage.getItem('ai_novel_studio_custom_list_url') || '';
      const savedBaseUrl = localStorage.getItem('ai_novel_studio_custom_base_url') || '';
      const savedUseChat = localStorage.getItem('ai_novel_studio_use_chat_completions');
      setApiKey(savedKey);
      setCustomModelListUrl(savedListUrl);
      setCustomModelBaseUrl(savedBaseUrl);
      setUseChatCompletions(savedUseChat === null ? true : savedUseChat === 'true');
      setIsSaved(Boolean(savedKey));
      setCustomModelInput('');

      let activeModels: string[] = [];
      const cached = localStorage.getItem('ai_novel_studio_cached_models');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            activeModels = parsed;
            setModelsList(parsed);
          } else {
            setModelsList([]);
          }
        } catch {
          setModelsList([]);
        }
      } else {
        setModelsList([]);
      }

      // If saved model is legacy or dated preview, or not in active list, pick best default
      const lowerSaved = savedModel.toLowerCase();
      const isLegacyOrPreview = lowerSaved.includes('davinci') || 
                                lowerSaved.includes('babbage') || 
                                lowerSaved.includes('curie') ||
                                lowerSaved.includes('preview');

      if (!savedModel || isLegacyOrPreview || (activeModels.length > 0 && !activeModels.includes(savedModel))) {
        const best = findBestDefaultModel(activeModels);
        if (best) {
          savedModel = best;
          localStorage.setItem('ai_novel_studio_model', best);
        }
      }

      fetchEnvConfig()
        .then(data => {
          if (data && data.success) {
            setEnvConfig(data);
            if (!savedBaseUrl && data.customBaseUrl) {
              setCustomModelBaseUrl(data.customBaseUrl);
            }
            if (!savedListUrl && data.customListUrl) {
              setCustomModelListUrl(data.customListUrl);
            }
            if (!savedModel && data.defaultModel) {
              setSelectedModel(data.defaultModel);
            }
          }
        })
        .catch(() => {});

      setSelectedModel(savedModel);
      
      setFetchResult(null);
      setModelResponse('');
      setTestError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const notifyStorageChange = () => {
    window.dispatchEvent(new Event('storage'));
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    if (!val.trim()) {
      // Clear states if manually emptied
      setSelectedModel('');
      setCustomModelInput('');
      setModelsList([]);
      setIsSaved(false);
      setFetchResult(null);
      setModelResponse('');
      setTestError('');
      
      localStorage.removeItem('ai_novel_studio_apikey');
      localStorage.removeItem('ai_novel_studio_model');
      localStorage.removeItem('ai_novel_studio_cached_models');
      notifyStorageChange();
    }
  };

  const handleSaveKeyOnly = () => {
    if (apiKey.trim()) {
      localStorage.setItem('ai_novel_studio_apikey', apiKey.trim());
      setIsSaved(true);
      notifyStorageChange();
      setFetchResult({
        success: true,
        message: '密钥已保存。请在下方点击“刷新/获取所有模型”按钮拉取可用模型列表。'
      });
    } else {
      handleClearAll();
    }
  };

  const handleClearKeyOnly = () => {
    setApiKey('');
    setIsSaved(false);
    localStorage.removeItem('ai_novel_studio_apikey');
    notifyStorageChange();
    setFetchResult({
      success: true,
      message: 'API Key 已成功清除。'
    });
    setSingleTestResults({});
    setModelResponse('');
    setTestError('');
  };

  const handleClearAll = () => {
    setApiKey('');
    setSelectedModel('');
    setCustomModelInput('');
    setCustomModelListUrl('');
    setCustomModelBaseUrl('');
    setModelsList([]);
    setIsSaved(false);
    setFetchResult(null);
    setModelResponse('');
    setTestError('');
    setSingleTestResults({});
    localStorage.removeItem('ai_novel_studio_apikey');
    localStorage.removeItem('ai_novel_studio_model');
    localStorage.removeItem('ai_novel_studio_cached_models');
    localStorage.removeItem('ai_novel_studio_custom_list_url');
    localStorage.removeItem('ai_novel_studio_custom_base_url');
    localStorage.removeItem('ai_novel_studio_use_chat_completions');
    notifyStorageChange();
  };

  const handleTestSingleModel = async (modelId: string): Promise<boolean> => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setSingleTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, error: '请先填写并保存您的 Gemini API Key' }
      }));
      return false;
    }

    setTestingModelIds(prev => [...prev, modelId]);
    setSingleTestResults(prev => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });

    try {
      const data = await apiTestModel({
        apiKey: activeKey,
        model: modelId,
        prompt: testPrompt.trim(),
        customBaseUrl: customModelBaseUrl.trim() || undefined,
        useChatCompletions
      });
      
      if (data.success) {
        setSingleTestResults(prev => ({
          ...prev,
          [modelId]: { success: true, response: data.response || '测试成功，但返回内容为空。' }
        }));
        return true;
      } else {
        throw new Error(data.error || '测试该模型失败');
      }
    } catch (err: any) {
      setSingleTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, error: err.message || '连接超时或诊断错误' }
      }));
      return false;
    } finally {
      setTestingModelIds(prev => prev.filter(id => id !== modelId));
    }
  };

  const handleTestAllModels = async () => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setTestError('请先填写并保存您的 Gemini API Key');
      return;
    }
    if (modelsList.length === 0) {
      setTestError('无可测试的模型列表，请先在上方获取或添加可用模型');
      return;
    }

    setIsTestingModel(true);
    setTestError('');
    setSingleTestResults({}); // Start fresh for all models

    const queue = [...modelsList];
    const concurrency = 5;
    const passedModels: string[] = [];

    const runWorker = async () => {
      while (queue.length > 0) {
        const nextModel = queue.shift();
        if (!nextModel) break;
        const ok = await handleTestSingleModel(nextModel);
        if (ok) {
          passedModels.push(nextModel);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => runWorker());
    await Promise.all(workers);

    setIsTestingModel(false);

    if (passedModels.length > 0) {
      if (!selectedModel || !passedModels.includes(selectedModel)) {
        const bestPassed = findBestDefaultModel(passedModels) || passedModels[0];
        setSelectedModel(bestPassed);
        localStorage.setItem('ai_novel_studio_model', bestPassed);
        setTestError(`✅ 全量测试完成！当前使用模型已自动优化切换至验证通过的【${bestPassed}】。`);
      } else {
        setTestError(`✅ 全量测试完成！共 ${passedModels.length} 个模型服务连通良好，您选中的【${selectedModel}】运行正常。`);
      }
    } else {
      setTestError('⚠️ 全量测试完成，所测模型在您的 API 服务商处均暂无可用渠道或响应异常。请在代理商后台检查渠道绑定或切换 API 密钥。');
    }
  };

  const handleSave = () => {
    const finalModel = selectedModel || customModelInput.trim();
    if (!apiKey.trim()) {
      localStorage.removeItem('ai_novel_studio_apikey');
      localStorage.removeItem('ai_novel_studio_model');
      localStorage.removeItem('ai_novel_studio_cached_models');
      localStorage.removeItem('ai_novel_studio_custom_list_url');
      localStorage.removeItem('ai_novel_studio_custom_base_url');
      localStorage.removeItem('ai_novel_studio_use_chat_completions');
    } else {
      localStorage.setItem('ai_novel_studio_apikey', apiKey.trim());
      localStorage.setItem('ai_novel_studio_model', finalModel);
      localStorage.setItem('ai_novel_studio_cached_models', JSON.stringify(modelsList));
      localStorage.setItem('ai_novel_studio_custom_list_url', customModelListUrl.trim());
      localStorage.setItem('ai_novel_studio_custom_base_url', customModelBaseUrl.trim());
      localStorage.setItem('ai_novel_studio_use_chat_completions', String(useChatCompletions));
    }
    notifyStorageChange();
    onClose();
  };

  const handleFetchModels = async () => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setFetchResult({ success: false, message: '请先填写并保存您的 Gemini API Key' });
      return;
    }

    setIsFetchingModels(true);
    setFetchResult(null);
    setModelResponse('');
    setTestError('');

    try {
      const data = await apiFetchModels({
        apiKey: activeKey,
        customListUrl: customModelListUrl.trim() || undefined,
        customBaseUrl: customModelBaseUrl.trim() || undefined
      });

      if (data.success && Array.isArray(data.models) && data.models.length > 0) {
        localStorage.setItem('ai_novel_studio_apikey', activeKey);
        setIsSaved(true);
        setModelsList(data.models);
        localStorage.setItem('ai_novel_studio_cached_models', JSON.stringify(data.models));
        if (!selectedModel || !data.models.includes(selectedModel)) {
          const bestModel = findBestDefaultModel(data.models);
          setSelectedModel(bestModel);
          localStorage.setItem('ai_novel_studio_model', bestModel);
          setCustomModelInput('');
        }
        notifyStorageChange();
        setFetchResult({
          success: true,
          message: `连接成功！已成功从您的 API Key 在线获取支持的 ${data.models.length} 个可用模型。`
        });
      } else {
        setModelsList([]);
        localStorage.removeItem('ai_novel_studio_cached_models');
        setSelectedModel('');
        notifyStorageChange();
        setFetchResult({
          success: false,
          message: data.error || '连接接口成功，但通过当前 API Key 未查找到任何可用模型。'
        });
      }
    } catch (err: any) {
      setModelsList([]);
      localStorage.removeItem('ai_novel_studio_cached_models');
      setSelectedModel('');
      notifyStorageChange();
      setFetchResult({
        success: false,
        message: err.message || '连接测试失败，请检查 API Key 是否正确或网络是否畅通。'
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddCustomModel = () => {
    const custom = customModelInput.trim();
    if (!custom) return;
    if (!modelsList.includes(custom)) {
      const newList = [...modelsList, custom];
      setModelsList(newList);
      localStorage.setItem('ai_novel_studio_cached_models', JSON.stringify(newList));
    }
    setSelectedModel(custom);
    setCustomModelInput('');
  };

  const handleTestSelectedModel = async () => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setTestError('请先填写您的 API Key 并在上方验证连接');
      return;
    }

    const currentModel = selectedModel;
    if (!currentModel) {
      setTestError('请先选择一个要测试的模型');
      return;
    }

    setIsTestingModel(true);
    setModelResponse('');
    setTestError('');

    try {
      const data = await apiTestModel({
        apiKey: activeKey,
        model: currentModel,
        prompt: testPrompt.trim(),
        customBaseUrl: customModelBaseUrl.trim() || undefined,
        useChatCompletions
      });
      
      if (data.success) {
        setModelResponse(data.response || '模型响应成功，但返回了空内容。');
      } else {
        throw new Error(data.error || '测试模型失败');
      }
    } catch (err: any) {
      setTestError(err.message || '测试连接超时或失败，请检查密钥是否支持该模型。');
    } finally {
      setIsTestingModel(false);
    }
  };

  const getModelDescription = (modelName: string) => {
    const descMap: Record<string, string> = {
      "gemini-2.5-flash": "Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.",
      "gemini-2.5-pro": "Stable release (June 17th, 2025) of Gemini 2.5 Pro.",
      "gemini-2.5-flash-lite": "Lightweight Gemini 2.5 Flash variant optimized for fast response times and efficient throughput.",
      "gemini-2.0-flash-exp": "Experimental Gemini 2.0 Flash preview featuring next-generation multimodal capabilities.",
      "gemini-1.5-pro": "Highly capable multimodal reasoning and context-processing model supporting up to 2 million tokens.",
      "gemini-1.5-flash": "Fast, lightweight, and highly cost-efficient Gemini 1.5 model for general multimodal generation.",
      "gemini-1.5-flash-8b": "High-volume, ultra-fast Gemini 1.5 model variant for ultra-low latency tasks.",
      "gemini-1.0-pro": "Standard language and reasoning processing model optimized for text instructions."
    };
    
    const key = modelName.toLowerCase();
    for (const [k, desc] of Object.entries(descMap)) {
      if (key.includes(k)) {
        return desc;
      }
    }
    return "Google Gemini Family multimodal reasoning model supporting generation and coding tasks.";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-up">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-start justify-between shrink-0">
          <div className="flex items-start space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                Gemini 轴与模型配置
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                手动设置您的专属 API Key，输出所有可用模型，支持一键联通测试与自定义模型选择
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 p-1.5 rounded-xl hover:bg-stone-50 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-stone-50/30">
          
          {envConfig?.hasEnvApiKey && (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-900 shadow-xs">
              <div className="p-2 bg-emerald-100/80 rounded-xl text-emerald-700 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                  已检测到本地/服务端环境变量配置 (.env)
                  <span className="px-2 py-0.2 rounded-full bg-emerald-200/60 text-emerald-800 text-[10px] font-semibold">本地部署已兼容</span>
                </div>
                <p className="text-emerald-800/90 leading-relaxed">
                  服务端已预设 API Key <code className="px-1.5 py-0.5 bg-emerald-100 rounded text-emerald-900 font-mono">{envConfig.apiKeyMasked || '已隐式加载'}</code>。无需在浏览器重复输入即可直接生成或创作！您也可以在下方填入独立 API Key 进行覆盖。
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Input API Key */}
          <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">1</span>
                1.手动填写GEMINI API密钥(API KEY)
              </label>
              
              {isSaved && apiKey.trim() ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Check className="w-3 h-3" />
                  已保存 API Key
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertCircle className="w-3 h-3" />
                  尚未填写 API Key
                </span>
              )}
            </div>

            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="这里输入 AI Studio 或 Google Gemini 的 API Key (如 AIzaSy...)"
                  className="w-full rounded-xl border border-stone-300 pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-stone-50/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveKeyOnly}
                disabled={!apiKey.trim()}
                className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>保存 Key</span>
              </button>
              <button
                type="button"
                onClick={handleClearKeyOnly}
                disabled={!apiKey.trim() && !isSaved}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 border border-stone-200"
              >
                <Trash2 className="w-4 h-4 text-stone-500" />
                <span>清除 Key</span>
              </button>
            </div>
            
            <p className="text-[11px] text-stone-400 leading-normal">
              提示：填写入库后仅保存在当前浏览器本地，直接用于请求获取模型和智能生成，不占用全局共享份额。
            </p>

            {fetchResult && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start space-x-2 border animate-fade-in ${
                  fetchResult.success
                    ? 'bg-emerald-50/80 text-emerald-900 border-emerald-200'
                    : 'bg-red-50/80 text-red-900 border-red-200'
                }`}
              >
                {fetchResult.success ? (
                  <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{fetchResult.message}</div>
              </div>
            )}
          </div>

          {/* Step 2: Display Models Available & Manual Selection */}
          <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
            <div>
              <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">3</span>
                3.自定义模型配置
              </label>
              <p className="text-[10px] text-stone-400 mt-1">
                若使用非官方 API 代理，请在此配置自定义的 API URL
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-600">模型列表 API URL:</label>
                <input
                  type="text"
                  value={customModelListUrl}
                  onChange={(e) => setCustomModelListUrl(e.target.value)}
                  placeholder="例如: https://api.proxy.com/v1/models"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 outline-none bg-stone-50 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-600">模型基础 API URL:</label>
                <input
                  type="text"
                  value={customModelBaseUrl}
                  onChange={(e) => setCustomModelBaseUrl(e.target.value)}
                  placeholder="例如: https://openkey.cloud/v1 或 https://api.openai.com/v1"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 outline-none bg-stone-50 font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useChatCompletions"
                  checked={useChatCompletions}
                  onChange={(e) => setUseChatCompletions(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-stone-300 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="useChatCompletions" className="text-[11px] font-bold text-stone-600 cursor-pointer">
                  自动补全 /chat/completions (OpenAI 协议标准)
                </label>
              </div>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                💡 说明：<br />
                • <strong>勾选（推荐）</strong>：输入 Base URL（如 <code>https://api.openai.com/v1</code>）时，系统会自动在末尾补充 <code>/chat/completions</code> 路径；<br />
                • <strong>不勾选</strong>：系统<strong>不会添加</strong> <code>/chat/completions</code>，将直接向您填写的原始完整 URL 发送请求（适用于自定义非标接口或已包含完整 Endpoint 的 URL）。
              </p>
            </div>
          </div>

          <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">2</span>
                  2.账号对应的所有模型列表 ( {modelsList.length} )
                </label>
                <p className="text-[10px] text-stone-400 mt-1">
                  可推出所有 Gemini 语言和分析模型的 API 密钥支持
                </p>
              </div>
              
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels || !apiKey.trim()}
                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold rounded-xl shadow-2xs transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >
                {isFetchingModels ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>联通测试中...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>刷新/获取所有模型</span>
                  </>
                )}
              </button>
            </div>

            {/* Alert Badge if key not filled */}
            {!apiKey.trim() && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>请先在上方填写并保存您的 Gemini API 密钥以拉取对应模型</span>
              </div>
            )}

            {/* Test prompt area (Always visible inside Step 2, above grid!) */}
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/60 space-y-2.5">
              <div className="flex gap-2.5 items-center">
                <span className="text-xs font-bold text-stone-600 shrink-0">测试提示词：</span>
                <input
                  type="text"
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="输入测试提示词，例如：你好"
                  disabled={!apiKey.trim()}
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs focus:ring-1 focus:ring-purple-500 outline-none bg-white disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleTestAllModels}
                  disabled={isTestingModel || !apiKey.trim() || modelsList.length === 0}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1"
                >
                  {isTestingModel ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>正在全量测试...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>一键测试所有模型</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live Output Terminal */}
              {(modelResponse || testError) && (
                <div className="rounded-lg p-3 text-xs border bg-stone-900 font-mono text-stone-100 max-h-[160px] overflow-y-auto relative animate-fade-in space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-stone-400 border-b border-stone-800 pb-1.5">
                    <span>测试提示词响应：</span>
                    <span className={modelResponse ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {modelResponse ? "✓ 正常通畅" : "✗ 诊断错误"}
                    </span>
                  </div>
                  {modelResponse && <p className="whitespace-pre-wrap leading-relaxed select-text text-stone-200">{modelResponse}</p>}
                  {testError && (
                    <div className="space-y-1">
                      <p className="text-red-400 whitespace-pre-wrap leading-relaxed">{testError}</p>
                      {(testError.includes('503') || testError.includes('400') || testError.includes('heavy load') || testError.includes('无可用渠道') || testError.includes('deprecated')) && (
                        <p className="text-[11px] text-amber-300/90 font-sans leading-relaxed pt-1 border-t border-stone-800/80">
                          💡 <strong>解决方案提示</strong>：此错误来自您的第三方 API 代理服务商（如 OpenKey / OneAPI 渠道挂载点或高负载）。请在下方的【模型列表】中选择其他正在运行的可用模型（例如 <code>gpt-4o-mini</code> 或 <code>gemini-2.5-flash</code>），或更换其他服务商直连。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Models list output box */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
              {modelsList.length > 0 && apiKey.trim() ? (
                <div className="p-4 space-y-3 bg-stone-50/40">
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {modelsList.map((m) => {
                      const isSelected = selectedModel === m;
                      const isTestingThis = testingModelIds.includes(m);
                      const testResult = singleTestResults[m];

                      return (
                        <div
                          key={m}
                          className={`border rounded-xl p-4 transition-all flex flex-col space-y-3 ${
                            isSelected
                              ? 'border-purple-600 bg-purple-50/20 shadow-2xs'
                              : 'border-stone-200 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm font-mono text-stone-900 truncate">{m}</span>
                                {isSelected && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white gap-0.5 shrink-0">
                                    <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                                    当前使用中
                                  </span>
                                )}
                                {testResult && (
                                  testResult.success ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 gap-0.5 shrink-0">
                                      ✓ 验证可用
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 gap-0.5 shrink-0">
                                      ✗ 渠道不可用
                                    </span>
                                  )
                                )}
                              </div>
                              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                                {getModelDescription(m)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end">
                              <button
                                type="button"
                                onClick={() => handleTestSingleModel(m)}
                                disabled={isTestingModel || testingModelIds.includes(m)}
                                className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 disabled:opacity-50 text-stone-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors bg-white shadow-2xs"
                              >
                                {isTestingThis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                ) : (
                                  <Play className="w-3 h-3 text-stone-500 fill-stone-500" />
                                )}
                                <span>测试模型</span>
                              </button>

                              {isSelected ? (
                                <button
                                  type="button"
                                  disabled={true}
                                  className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>已选用</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedModel(m);
                                    setCustomModelInput('');
                                  }}
                                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition-colors border border-stone-200"
                                >
                                  选择此模型
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Individual Test Terminal Output */}
                          {testResult && (
                            <div className="p-3 bg-stone-950 rounded-xl font-mono text-[11px] text-stone-200 border border-stone-800 animate-fade-in">
                              <div className="flex justify-between items-center text-[10px] text-stone-400 border-b border-stone-800 pb-1.5 mb-1.5">
                                <span>实时测试回复：</span>
                                <span className={testResult.success ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                  {testResult.success ? "✓ 正常通畅" : "✗ 诊断错误"}
                                </span>
                              </div>
                              {testResult.success ? (
                                <p className="whitespace-pre-wrap leading-relaxed select-text">{testResult.response}</p>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-red-400 whitespace-pre-wrap leading-relaxed">{testResult.error}</p>
                                  {(testResult.error.includes('503') || testResult.error.includes('400') || testResult.error.includes('heavy load') || testResult.error.includes('无可用渠道') || testResult.error.includes('deprecated')) && (
                                    <p className="text-[10px] text-amber-300/90 font-sans leading-relaxed pt-1 border-t border-stone-800">
                                      💡 提示：该模型在您的代理服务商处暂无有效渠道或受高负载影响，请更换列表中其他正常模型。
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-2.5 border-t border-stone-200/60">
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      placeholder="手动输入特定模型ID（如gemini-3.6-flash）..."
                      className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono focus:ring-1 focus:ring-purple-500 outline-none bg-white shadow-3xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomModel}
                      disabled={!customModelInput.trim()}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shrink-0 flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>添加并选中</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 bg-stone-50/40 text-center flex flex-col items-center justify-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-400 shadow-3xs">
                    <X className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-stone-500 font-medium max-w-sm">
                    {apiKey.trim()
                      ? "暂无可用模型。请点击右上角【刷新/获取所有模型】通过 API 密钥在线获取。"
                      : "请先在上方填写并保存 Gemini API 密钥，以输出当前账号对应的所有可用模型。"}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer info & Actions */}
        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-stone-500 flex items-center gap-1.5">
            <span>当前选中AI智能生成模型：</span>
            {apiKey.trim() && selectedModel ? (
              <span className="font-mono font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg">
                {selectedModel}
              </span>
            ) : (
              <span className="text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-lg italic font-medium">
                无（需填写有效钥匙并选择型号）
              </span>
            )}
          </div>
          <div className="flex space-x-2.5">
            {(apiKey || selectedModel) && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3.5 py-2 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
                title="清空并移除本地保存的密钥及所选模型"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空配置</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-xs font-medium hover:bg-stone-100 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
            >
              完成配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
