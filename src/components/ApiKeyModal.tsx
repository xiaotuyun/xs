import React, { useState, useEffect } from 'react';
import { TabType } from '../types';
import { fetchEnvConfig, apiFetchModels, apiTestModel } from '../lib/aiClient';
import { HuggingFacePanel } from './HuggingFacePanel';
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
  Play, 
  Zap, 
  Globe, 
  Bot, 
  Smile, 
  RotateCcw,
  Star,
  Layers,
  CheckSquare,
  Square
} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  setActiveTab?: (tab: TabType) => void;
}

export type ProviderType = 'gemini' | 'openai' | 'groq' | 'deepseek' | 'huggingface' | 'other' | 'auto';

export interface ProviderConfig {
  apiKey: string;
  customBaseUrl: string;
  customListUrl: string;
  useChatCompletions: boolean;
  selectedModel: string;
  selectedModels: string[];
  modelsList: string[];
}

const DEFAULT_PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  gemini: {
    apiKey: '',
    customBaseUrl: '',
    customListUrl: '',
    useChatCompletions: false,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  openai: {
    apiKey: '',
    customBaseUrl: 'https://api.openai.com/v1',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  groq: {
    apiKey: '',
    customBaseUrl: 'https://api.groq.com/openai/v1',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  deepseek: {
    apiKey: '',
    customBaseUrl: 'https://api.deepseek.com/v1',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  huggingface: {
    apiKey: '',
    customBaseUrl: 'https://router.huggingface.co/v1',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  other: {
    apiKey: '',
    customBaseUrl: 'https://api.siliconflow.cn/v1',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
  auto: {
    apiKey: '',
    customBaseUrl: '',
    customListUrl: '',
    useChatCompletions: true,
    selectedModel: '',
    selectedModels: [],
    modelsList: [],
  },
};

const sanitizeConfig = (prov: ProviderType, cfg: ProviderConfig): ProviderConfig => {
  const result = { ...cfg };
  let base = (result.customBaseUrl || '').trim();
  let list = (result.customListUrl || '').trim();

  // Normalize selectedModels
  if (!Array.isArray(result.selectedModels)) {
    result.selectedModels = result.selectedModel ? [result.selectedModel] : [];
  } else if (result.selectedModel && !result.selectedModels.includes(result.selectedModel)) {
    result.selectedModels = [result.selectedModel, ...result.selectedModels];
  }

  // Strip trailing /models or /chat/completions from Base URL
  if (base.endsWith('/models')) {
    base = base.replace(/\/models$/, '');
  }
  if (base.endsWith('/chat/completions')) {
    base = base.replace(/\/chat\/completions$/, '');
  }

  // If list URL equals base URL or base URL without /models, clear list URL so it defaults to [Base URL]/models
  if (list && base && (list === base || list === `${base}/`)) {
    list = '';
  }

  if (prov === 'groq') {
    if (!base || base === 'https://api.groq.com/openai/v1/models') {
      base = 'https://api.groq.com/openai/v1';
    }
  } else if (prov === 'openai') {
    if (!base || base === 'https://api.openai.com/v1/models') {
      base = 'https://api.openai.com/v1';
    }
  } else if (prov === 'deepseek') {
    if (!base || base === 'https://api.deepseek.com/v1/models') {
      base = 'https://api.deepseek.com/v1';
    }
  } else if (prov === 'huggingface') {
    if (!base || base === 'https://router.huggingface.co/v1/models') {
      base = 'https://router.huggingface.co/v1';
    }
  } else if (prov === 'other') {
    if (!base) {
      base = 'https://api.siliconflow.cn/v1';
    }
  }

  result.customBaseUrl = base;
  result.customListUrl = list;
  return result;
};

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen = true, onClose }) => {
  const [activeProvider, setActiveProvider] = useState<ProviderType>('gemini');
  const [providerConfigs, setProviderConfigs] = useState<Record<ProviderType, ProviderConfig>>(DEFAULT_PROVIDER_CONFIGS);
  
  const [showPassword, setShowPassword] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);

  // Model test state
  const [testPrompt, setTestPrompt] = useState('你好！请回复确认当前模型可用。');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelResponse, setModelResponse] = useState<string>('');
  const [testError, setTestError] = useState<string>('');

  // Single-model test states
  const [testingModelIds, setTestingModelIds] = useState<string[]>([]);
  const [singleTestResults, setSingleTestResults] = useState<Record<string, { success: boolean; response?: string; error?: string }>>({});

  const [envConfig, setEnvConfig] = useState<{
    providers?: Record<ProviderType, {
      hasEnvApiKey?: boolean;
      apiKeyMasked?: string;
      customBaseUrl?: string;
      customListUrl?: string;
    }>;
    hasEnvApiKey?: boolean;
    apiKeyMasked?: string;
    customBaseUrl?: string;
    customListUrl?: string;
    defaultModel?: string;
    useChatCompletions?: boolean;
  } | null>(null);

  const currentConfig = providerConfigs[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider];
  const apiKey = currentConfig.apiKey;
  const customModelBaseUrl = currentConfig.customBaseUrl;
  const customModelListUrl = currentConfig.customListUrl;
  const useChatCompletions = currentConfig.useChatCompletions;
  const selectedModel = currentConfig.selectedModel || '';
  const selectedModels = Array.isArray(currentConfig.selectedModels)
    ? currentConfig.selectedModels
    : (selectedModel ? [selectedModel] : []);
  const modelsList = currentConfig.modelsList || [];
  const isSaved = Boolean(apiKey.trim());

  const preferredModelKeywords = [
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gpt-4o-mini',
    'gpt-4o',
    'claude-3-5-sonnet',
    'gpt-3.5-turbo',
  ];

  const notifyStorageChange = () => {
    window.dispatchEvent(new Event('storage'));
  };

  // Synchronize isolated configs to storage and global keys
  const saveAndSyncConfigs = (
    newConfigs: Record<ProviderType, ProviderConfig>,
    activeProv: ProviderType
  ) => {
    localStorage.setItem('ai_novel_studio_provider_configs', JSON.stringify(newConfigs));
    localStorage.setItem('ai_novel_studio_active_provider', activeProv);

    let activeCfg: ProviderConfig;

    if (activeProv === 'auto') {
      const autoCfg = newConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
      let effectiveApiKey = autoCfg.apiKey;
      let effectiveBaseUrl = autoCfg.customBaseUrl;
      let effectiveListUrl = autoCfg.customListUrl;
      let effectiveUseChat = autoCfg.useChatCompletions;

      if (!effectiveApiKey.trim()) {
        const primaryModel = autoCfg.selectedModel || (autoCfg.selectedModels?.[0] || '');
        let matchedProvKey: ProviderType = 'openai';
        if (primaryModel.startsWith('gemini')) matchedProvKey = 'gemini';
        else if (primaryModel.startsWith('deepseek')) matchedProvKey = 'deepseek';
        else if (primaryModel.startsWith('gemma') || primaryModel.startsWith('llama-3') || primaryModel.startsWith('mixtral')) matchedProvKey = 'groq';
        else if (primaryModel.includes('/') || primaryModel.startsWith('hf:')) matchedProvKey = 'huggingface';

        const matchedCfg = newConfigs[matchedProvKey];
        if (matchedCfg && matchedCfg.apiKey.trim()) {
          effectiveApiKey = matchedCfg.apiKey;
          if (!effectiveBaseUrl) effectiveBaseUrl = matchedCfg.customBaseUrl;
          if (!effectiveListUrl) effectiveListUrl = matchedCfg.customListUrl;
          effectiveUseChat = matchedCfg.useChatCompletions;
        } else {
          const provKeys: ProviderType[] = ['gemini', 'openai', 'groq', 'deepseek', 'huggingface', 'other'];
          for (const pk of provKeys) {
            if (newConfigs[pk]?.apiKey.trim()) {
              effectiveApiKey = newConfigs[pk].apiKey;
              if (!effectiveBaseUrl) effectiveBaseUrl = newConfigs[pk].customBaseUrl;
              if (!effectiveListUrl) effectiveListUrl = newConfigs[pk].customListUrl;
              effectiveUseChat = newConfigs[pk].useChatCompletions;
              break;
            }
          }
        }
      }

      activeCfg = {
        ...autoCfg,
        apiKey: effectiveApiKey,
        customBaseUrl: effectiveBaseUrl,
        customListUrl: effectiveListUrl,
        useChatCompletions: effectiveUseChat
      };
    } else {
      activeCfg = newConfigs[activeProv] || DEFAULT_PROVIDER_CONFIGS[activeProv];
    }
    
    if (activeCfg.apiKey.trim()) {
      localStorage.setItem('ai_novel_studio_apikey', activeCfg.apiKey.trim());
    } else {
      localStorage.removeItem('ai_novel_studio_apikey');
    }

    localStorage.setItem('ai_novel_studio_custom_base_url', activeCfg.customBaseUrl.trim());
    localStorage.setItem('ai_novel_studio_custom_list_url', activeCfg.customListUrl.trim());
    localStorage.setItem('ai_novel_studio_use_chat_completions', String(activeCfg.useChatCompletions));
    
    // Save primary active model
    if (activeCfg.selectedModel.trim()) {
      localStorage.setItem('ai_novel_studio_model', activeCfg.selectedModel.trim());
    } else {
      localStorage.removeItem('ai_novel_studio_model');
    }

    // Save multi-model selections
    const modelsArr = Array.isArray(activeCfg.selectedModels) ? activeCfg.selectedModels : [];
    if (modelsArr.length > 0) {
      localStorage.setItem('ai_novel_studio_selected_models', JSON.stringify(modelsArr));
    } else if (activeCfg.selectedModel.trim()) {
      localStorage.setItem('ai_novel_studio_selected_models', JSON.stringify([activeCfg.selectedModel.trim()]));
    } else {
      localStorage.removeItem('ai_novel_studio_selected_models');
    }

    if (activeCfg.modelsList && activeCfg.modelsList.length > 0) {
      localStorage.setItem('ai_novel_studio_cached_models', JSON.stringify(activeCfg.modelsList));
    } else {
      localStorage.removeItem('ai_novel_studio_cached_models');
    }

    notifyStorageChange();
  };

  const updateCurrentConfig = (partial: Partial<ProviderConfig>) => {
    setProviderConfigs(prev => {
      const activeCfg = prev[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider];
      const updatedActive = { ...activeCfg, ...partial };
      const newConfigs = { ...prev, [activeProvider]: updatedActive };
      saveAndSyncConfigs(newConfigs, activeProvider);
      return newConfigs;
    });
  };

  const updateVendorConfig = (prov: ProviderType, partial: Partial<ProviderConfig>) => {
    setProviderConfigs(prev => {
      const targetCfg = prev[prov] || DEFAULT_PROVIDER_CONFIGS[prov];
      const updated = { ...targetCfg, ...partial };
      const newConfigs = { ...prev, [prov]: updated };
      saveAndSyncConfigs(newConfigs, activeProvider);
      return newConfigs;
    });
  };

  const handleToggleAutoModel = (modelId: string) => {
    if (!modelId) return;
    const autoCfg = providerConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
    const curr = Array.isArray(autoCfg.selectedModels) ? [...autoCfg.selectedModels] : [];
    const isSelected = curr.includes(modelId);
    let next: string[];
    let newPrimary = autoCfg.selectedModel;

    if (isSelected) {
      next = curr.filter(id => id !== modelId);
      if (newPrimary === modelId) {
        newPrimary = next[0] || '';
      }
    } else {
      next = [...curr, modelId];
      if (!newPrimary) {
        newPrimary = modelId;
      }
    }

    updateVendorConfig('auto', {
      selectedModels: next,
      selectedModel: newPrimary
    });
  };

  const handleSetAutoPrimaryModel = (modelId: string) => {
    if (!modelId) return;
    const autoCfg = providerConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
    const curr = Array.isArray(autoCfg.selectedModels) ? [...autoCfg.selectedModels] : [];
    const next = curr.includes(modelId) ? curr : [...curr, modelId];

    updateVendorConfig('auto', {
      selectedModel: modelId,
      selectedModels: next
    });
  };

  const handleSelectAllAutoModelsForVendor = (candidateModels: string[]) => {
    if (!candidateModels || candidateModels.length === 0) return;
    const autoCfg = providerConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
    const curr = Array.isArray(autoCfg.selectedModels) ? [...autoCfg.selectedModels] : [];
    const combined = Array.from(new Set([...curr, ...candidateModels]));
    const newPrimary = autoCfg.selectedModel || candidateModels[0] || combined[0] || '';

    updateVendorConfig('auto', {
      selectedModels: combined,
      selectedModel: newPrimary
    });
  };

  const handleClearAutoModelsForVendor = (candidateModels: string[]) => {
    if (!candidateModels || candidateModels.length === 0) return;
    const autoCfg = providerConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
    const curr = Array.isArray(autoCfg.selectedModels) ? [...autoCfg.selectedModels] : [];
    const candSet = new Set(candidateModels);
    const next = curr.filter(m => !candSet.has(m));
    let newPrimary = autoCfg.selectedModel;
    if (candSet.has(newPrimary)) {
      newPrimary = next[0] || '';
    }

    updateVendorConfig('auto', {
      selectedModels: next,
      selectedModel: newPrimary
    });
  };

  // Multi-model selection methods
  const handleToggleSelectModel = (modelId: string) => {
    if (!modelId) return;
    const curr = Array.isArray(currentConfig.selectedModels) ? [...currentConfig.selectedModels] : [];
    const isSelected = curr.includes(modelId);
    let next: string[];
    let newPrimary = currentConfig.selectedModel;

    if (isSelected) {
      next = curr.filter(id => id !== modelId);
      if (newPrimary === modelId) {
        newPrimary = next[0] || '';
      }
    } else {
      next = [...curr, modelId];
      if (!newPrimary) {
        newPrimary = modelId;
      }
    }

    updateCurrentConfig({
      selectedModels: next,
      selectedModel: newPrimary
    });
  };

  const handleSetPrimaryModel = (modelId: string) => {
    if (!modelId) {
      updateCurrentConfig({ selectedModel: '', selectedModels: [] });
      return;
    }
    const curr = Array.isArray(currentConfig.selectedModels) ? [...currentConfig.selectedModels] : [];
    const next = curr.includes(modelId) ? curr : [...curr, modelId];
    updateCurrentConfig({
      selectedModel: modelId,
      selectedModels: next
    });
  };

  const handleSelectAllModels = (modelsToSelect?: string[]) => {
    const list = modelsToSelect || modelsList;
    if (list.length === 0) return;
    const set = new Set([...(currentConfig.selectedModels || []), ...list]);
    const next = Array.from(set);
    const newPrimary = currentConfig.selectedModel || next[0] || '';
    updateCurrentConfig({
      selectedModels: next,
      selectedModel: newPrimary
    });
  };

  const handleClearAllSelectedModels = () => {
    updateCurrentConfig({
      selectedModels: [],
      selectedModel: ''
    });
  };

  const handleSelectOnlyTestedAvailable = () => {
    const passed = modelsList.filter(m => singleTestResults[m]?.success);
    if (passed.length === 0) return;
    updateCurrentConfig({
      selectedModels: passed,
      selectedModel: passed[0] || ''
    });
  };

  const findBestDefaultModel = (models: string[]): string => {
    if (!models || models.length === 0) return '';

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

    for (const pref of preferredModelKeywords) {
      const match = validModels.find(m => {
        const lower = m.toLowerCase();
        const isStable = !lower.includes('preview') && !lower.includes('exp') && !/-\d{2}-\d{2}/.test(lower);
        return isStable && lower.includes(pref);
      });
      if (match) return match;
    }

    for (const pref of preferredModelKeywords) {
      const match = validModels.find(m => m.toLowerCase().includes(pref));
      if (match) return match;
    }

    const anyStable = validModels.find(m => {
      const lower = m.toLowerCase();
      return !lower.includes('preview') && !lower.includes('exp') && !/-\d{2}-\d{2}/.test(lower);
    });

    return anyStable || validModels[0] || '';
  };

  useEffect(() => {
    if (isOpen) {
      let savedConfigsRaw = localStorage.getItem('ai_novel_studio_provider_configs');
      let savedActiveProvider = (localStorage.getItem('ai_novel_studio_active_provider') as ProviderType) || 'gemini';

      let configs: Record<ProviderType, ProviderConfig> = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS));

      if (savedConfigsRaw) {
        try {
          const parsed = JSON.parse(savedConfigsRaw);
          configs = {
            gemini: sanitizeConfig('gemini', { ...DEFAULT_PROVIDER_CONFIGS.gemini, ...(parsed.gemini || {}) }),
            openai: sanitizeConfig('openai', { ...DEFAULT_PROVIDER_CONFIGS.openai, ...(parsed.openai || {}) }),
            groq: sanitizeConfig('groq', { ...DEFAULT_PROVIDER_CONFIGS.groq, ...(parsed.groq || {}) }),
            deepseek: sanitizeConfig('deepseek', { ...DEFAULT_PROVIDER_CONFIGS.deepseek, ...(parsed.deepseek || {}) }),
            huggingface: sanitizeConfig('huggingface', { ...DEFAULT_PROVIDER_CONFIGS.huggingface, ...(parsed.huggingface || {}) }),
            other: sanitizeConfig('other', { ...DEFAULT_PROVIDER_CONFIGS.other, ...(parsed.other || {}) }),
            auto: sanitizeConfig('auto', { ...DEFAULT_PROVIDER_CONFIGS.auto, ...(parsed.auto || {}) }),
          };
        } catch {}
      } else {
        // Legacy migration
        const legacyKey = localStorage.getItem('ai_novel_studio_apikey') || '';
        const legacyBaseUrl = localStorage.getItem('ai_novel_studio_custom_base_url') || '';
        const legacyListUrl = localStorage.getItem('ai_novel_studio_custom_list_url') || '';
        const legacyUseChat = localStorage.getItem('ai_novel_studio_use_chat_completions') === 'true';
        const legacyModel = localStorage.getItem('ai_novel_studio_model') || '';
        let legacyModelsList: string[] = [];
        try {
          legacyModelsList = JSON.parse(localStorage.getItem('ai_novel_studio_cached_models') || '[]');
        } catch {}

        if (legacyBaseUrl.includes('groq.com')) {
          savedActiveProvider = 'groq';
        } else if (legacyBaseUrl.includes('deepseek.com')) {
          savedActiveProvider = 'deepseek';
        } else if (legacyBaseUrl.includes('openai.com')) {
          savedActiveProvider = 'openai';
        } else if (legacyBaseUrl.trim() !== '') {
          savedActiveProvider = 'other';
        } else {
          savedActiveProvider = 'gemini';
        }

        configs[savedActiveProvider] = {
          apiKey: legacyKey,
          customBaseUrl: legacyBaseUrl,
          customListUrl: legacyListUrl,
          useChatCompletions: legacyUseChat,
          selectedModel: legacyModel || DEFAULT_PROVIDER_CONFIGS[savedActiveProvider].selectedModel,
          selectedModels: legacyModel ? [legacyModel] : [],
          modelsList: legacyModelsList
        };

        localStorage.setItem('ai_novel_studio_provider_configs', JSON.stringify(configs));
        localStorage.setItem('ai_novel_studio_active_provider', savedActiveProvider);
      }

      setProviderConfigs(configs);
      setActiveProvider(savedActiveProvider);

      fetchEnvConfig()
        .then(data => {
          if (data && data.success) {
            setEnvConfig(data);
          }
        })
        .catch(() => {});

      setFetchResult(null);
      setModelResponse('');
      setTestError('');
      setSingleTestResults({});
      setCustomModelInput('');
    }
  }, [isOpen]);

  const handleSelectProvider = (provider: ProviderType) => {
    setActiveProvider(provider);
    setFetchResult(null);
    setTestError('');
    setModelResponse('');
    setSingleTestResults({});

    saveAndSyncConfigs(providerConfigs, provider);
  };

  const handleApiKeyChange = (val: string) => {
    updateCurrentConfig({
      apiKey: val,
      ...(val.trim() === '' ? { modelsList: [], selectedModel: '', selectedModels: [] } : {})
    });

    if (!val.trim()) {
      setFetchResult(null);
      setModelResponse('');
      setTestError('');
      setSingleTestResults({});
    }
  };

  const handleSaveKeyOnly = () => {
    if (apiKey.trim()) {
      saveAndSyncConfigs(providerConfigs, activeProvider);
      setFetchResult({
        success: true,
        message: `【${currentVendor.name}】API Key 已保存。请点击下方“刷新/获取所有模型”按钮拉取专属可用模型列表。`
      });
    } else {
      handleClearKeyOnly();
    }
  };

  const handleClearKeyOnly = () => {
    updateCurrentConfig({
      apiKey: '',
      modelsList: [],
      selectedModel: '',
      selectedModels: []
    });
    setFetchResult({
      success: true,
      message: `【${currentVendor.name}】API Key 已成功清除。`
    });
    setSingleTestResults({});
    setModelResponse('');
    setTestError('');
  };

  const handleClearCurrentProvider = () => {
    const resetCfg = { ...DEFAULT_PROVIDER_CONFIGS[activeProvider] };
    setProviderConfigs(prev => {
      const newConfigs = { ...prev, [activeProvider]: resetCfg };
      saveAndSyncConfigs(newConfigs, activeProvider);
      return newConfigs;
    });
    setFetchResult({
      success: true,
      message: `已重置【${currentVendor.name}】的所有独立配置。`
    });
    setSingleTestResults({});
    setModelResponse('');
    setTestError('');
  };

  const handleTestSingleModel = async (modelId: string): Promise<boolean> => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setSingleTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, error: `请先填写并保存【${currentVendor.name}】的 API Key` }
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
      setTestError(`请先填写并保存【${currentVendor.name}】的 API Key`);
      return;
    }
    if (modelsList.length === 0) {
      setTestError('无可测试的模型列表，请先点击【刷新/获取所有模型】');
      return;
    }

    setIsTestingModel(true);
    setTestError('');
    setSingleTestResults({});

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
      if (selectedModel && passedModels.includes(selectedModel)) {
        setTestError(`✅ 全量测试完成！共 ${passedModels.length} 个模型服务连通良好，您选中的【${selectedModel}】运行正常。`);
      } else {
        setTestError(`✅ 全量测试完成！共 ${passedModels.length} 个模型服务连通良好。请在下方列表中点击【选择此模型】选用您想使用的模型。`);
      }
    } else {
      setTestError(`⚠️ 全量测试完成，【${currentVendor.name}】所测模型在您的 API 服务商处均暂无可用渠道或响应异常。`);
    }
  };

  const handleSave = () => {
    saveAndSyncConfigs(providerConfigs, activeProvider);
    setFetchResult({
      success: true,
      message: `配置保存成功！当前已激活【${currentVendor.name}】${selectedModel ? `及其模型【${selectedModel}】` : '（尚未指定模型）'}。`
    });
    if (onClose) onClose();
  };

  const handleFetchModels = async () => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setFetchResult({ success: false, message: `请先填写并保存【${currentVendor.name}】的 API Key` });
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
        // Keep selectedModels that are present in the newly fetched models
        const validSelectedModels = selectedModels.filter(m => data.models.includes(m));
        const validPrimary = validSelectedModels.includes(selectedModel)
          ? selectedModel
          : (validSelectedModels[0] || '');

        updateCurrentConfig({
          modelsList: data.models,
          selectedModels: validSelectedModels,
          selectedModel: validPrimary
        });

        setFetchResult({
          success: true,
          message: `连接成功！已从【${currentVendor.name}】成功在线获取到 ${data.models.length} 个专属可用模型。您可以在列表中勾选多个模型使用。`
        });
      } else {
        updateCurrentConfig({
          modelsList: [],
          selectedModels: [],
          selectedModel: ''
        });
        setFetchResult({
          success: false,
          message: data.error || '连接接口失败或未找到可用模型。'
        });
      }
    } catch (err: any) {
      updateCurrentConfig({
        modelsList: []
      });
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
    const newList = modelsList.includes(custom) ? modelsList : [...modelsList, custom];
    const newSelected = selectedModels.includes(custom) ? selectedModels : [...selectedModels, custom];
    updateCurrentConfig({
      modelsList: newList,
      selectedModels: newSelected,
      selectedModel: custom
    });
    setCustomModelInput('');
  };

  const getModelDescription = (modelName: string) => {
    if (activeProvider === 'gemini') {
      return "Google Gemini 官方多模态大语言模型，支持长文本理解、图像与推理任务。";
    }
    if (activeProvider === 'openai') {
      return "OpenAI ChatGPT 官方与兼容模型，具备顶尖的语言理解、写作与逻辑推理能力。";
    }
    if (activeProvider === 'groq') {
      return "Groq LPU 硬件加速极速推理模型，超低延迟，高并发响应。";
    }
    if (activeProvider === 'deepseek') {
      return "DeepSeek 深度求索官方模型，擅长长文本思考、逻辑代码与创作推理。";
    }
    return "通用 OpenAI 协议兼容大语言模型。";
  };

  const vendors = [
    {
      id: 'gemini' as ProviderType,
      name: '1. Gemini',
      tag: 'Google 官方',
      icon: Sparkles,
      placeholder: '填写 Google Gemini API Key (如 AIzaSy...)',
      showCustomConfig: false,
      description: 'Google 官方 API (可通过 API Key 获取支持的 Gemini 系列模型列表)'
    },
    {
      id: 'openai' as ProviderType,
      name: '2. OpenAI',
      tag: 'ChatGPT',
      icon: Cpu,
      placeholder: '填写 OpenAI API Key (如 sk-proj-... 或 sk-...)',
      showCustomConfig: true,
      description: 'OpenAI 官方与兼容接口 (可通过 API Key 获取支持的 GPT 系列模型列表)'
    },
    {
      id: 'groq' as ProviderType,
      name: '3. Groq',
      tag: 'LPU 极速',
      icon: Zap,
      placeholder: '填写 Groq Cloud API Key (如 gsk_...)',
      showCustomConfig: true,
      description: 'Groq Cloud 超高速 LPU 推理接口 (可通过 API Key 获取可用模型列表)'
    },
    {
      id: 'deepseek' as ProviderType,
      name: '4. DeepSeek',
      tag: '深度求索',
      icon: Bot,
      placeholder: '填写 DeepSeek API Key (如 sk-...)',
      showCustomConfig: true,
      description: 'DeepSeek 官方 API (可通过 API Key 获取可用对话与推理模型列表)'
    },
    {
      id: 'huggingface' as ProviderType,
      name: '5. Hugging Face',
      tag: '开源生态',
      icon: Smile,
      placeholder: '填写 Hugging Face Access Token (如 hf_...)',
      showCustomConfig: true,
      description: 'Hugging Face 官方 Hub 模型生态与推理 API（7类模型库检索与11类NLP/视觉在线推理任务）'
    },
    {
      id: 'other' as ProviderType,
      name: '其他',
      tag: '自定义/中转/本地',
      icon: Globe,
      placeholder: '填写 API Key (如 sk-...)',
      showCustomConfig: true,
      description: '支持 硅基流动、月之暗面、Ollama 本地模型、OneAPI 及任意 OpenAI 标准兼容接口'
    },
    {
      id: 'auto' as ProviderType,
      name: '综合 auto',
      tag: '全厂商模型聚合',
      icon: Layers,
      placeholder: '',
      showCustomConfig: false,
      description: '全景展示所有厂商已选的主模型与备选模型池，支持按厂商分类预览与跨厂商自由勾选配置'
    }
  ];

  const standardProvKeys: ProviderType[] = ['gemini', 'openai', 'groq', 'deepseek', 'huggingface', 'other'];
  const autoCfg = providerConfigs.auto || DEFAULT_PROVIDER_CONFIGS.auto;
  const autoTotalSelectedModels = Array.isArray(autoCfg.selectedModels) ? autoCfg.selectedModels : [];
  const autoPrimaryModel = autoCfg.selectedModel || autoTotalSelectedModels[0] || '';

  const currentVendor = vendors.find(v => v.id === activeProvider) || vendors[0];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fade-in p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
          <Key className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-stone-900">AI 模型接入与 API Key 配置</h2>
          <p className="text-sm text-stone-500 mt-1">
            各个厂商拥有独立隔离的密钥、接口配置与模型列表，自由切换并自动激活
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
        {/* Main 2-Column Container */}
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[640px]">
          
          {/* Left Sidebar: Vendor List */}
          <div className="md:col-span-3 bg-stone-50/80 border-r border-stone-200/80 p-4 space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 px-3 py-2">
              模型厂商分类
            </div>

            <div className="space-y-1.5">
              {vendors.map((v) => {
                const VIcon = v.icon;
                const isActive = activeProvider === v.id;
                const vConfig = providerConfigs[v.id];
                const hasVKey = v.id === 'auto'
                  ? standardProvKeys.some(pk => Boolean(providerConfigs[pk]?.apiKey?.trim() || (pk === 'gemini' && envConfig?.hasEnvApiKey) || envConfig?.providers?.[pk]?.hasEnvApiKey))
                  : Boolean(vConfig?.apiKey?.trim() || (v.id === 'gemini' && envConfig?.hasEnvApiKey) || envConfig?.providers?.[v.id]?.hasEnvApiKey);

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectProvider(v.id)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all flex items-center justify-between group cursor-pointer ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md font-bold'
                        : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200/60 font-medium'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-600 group-hover:bg-purple-100'
                      }`}>
                        <VIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm truncate flex items-center gap-1.5">
                          <span>{v.name}</span>
                          {v.tag && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              isActive ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                            }`}>
                              {v.tag}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {hasVKey && (
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main Content */}
          <div className="md:col-span-9 p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {activeProvider === 'auto' ? (
                <div className="space-y-6">
                  {/* Auto Banner Header */}
                  <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 text-purple-200 flex items-center justify-center backdrop-blur-xs">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                            综合 Auto - 多厂商模型全景控制台
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-100 border border-purple-400/30">
                              全聚合模式
                            </span>
                          </h3>
                          <p className="text-xs text-purple-200/80 mt-0.5">
                            自动汇总各厂商已配置的主模型与备选模型。支持跨厂商按分类直观展示、自由勾选模型与灵活切换首选主模型。
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center gap-2 flex-wrap text-xs text-purple-100">
                      <div className="bg-white/10 px-3 py-1 rounded-lg flex items-center gap-1.5">
                        <span className="text-purple-300">已就绪厂商：</span>
                        <span className="font-bold text-white">
                          {standardProvKeys.filter(pk => {
                            const cfg = providerConfigs[pk];
                            const env = envConfig?.providers?.[pk] || (pk === 'gemini' && envConfig?.hasEnvApiKey ? { hasEnvApiKey: true } : null);
                            return Boolean(cfg?.apiKey.trim() || env?.hasEnvApiKey);
                          }).length} / 6 个
                        </span>
                      </div>
                      <div className="bg-white/10 px-3 py-1 rounded-lg flex items-center gap-1.5">
                        <span className="text-purple-300">跨厂商已选模型：</span>
                        <span className="font-bold text-amber-300">{autoTotalSelectedModels.length} 个</span>
                      </div>
                      <div className="bg-white/10 px-3 py-1 rounded-lg flex items-center gap-1.5">
                        <span className="text-purple-300">当前激活主模型：</span>
                        <span className="font-mono font-bold text-emerald-300">{autoPrimaryModel || '未指定'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor List Sections */}
                  <div className="space-y-4">
                    {vendors.filter(v => v.id !== 'auto').map((v) => {
                      const pk = v.id;
                      const cfg = providerConfigs[pk] || DEFAULT_PROVIDER_CONFIGS[pk];
                      const env = envConfig?.providers?.[pk] || (pk === 'gemini' && envConfig?.hasEnvApiKey ? { hasEnvApiKey: true, apiKeyMasked: envConfig.apiKeyMasked } : null);
                      const isConfigured = Boolean(cfg.apiKey.trim() || env?.hasEnvApiKey);

                      const candidateModels = Array.from(new Set([
                        ...(Array.isArray(cfg.selectedModels) ? cfg.selectedModels : []),
                        ...(cfg.selectedModel ? [cfg.selectedModel] : [])
                      ].filter(Boolean)));

                      const vendorSelectedInAuto = candidateModels.filter(m => autoTotalSelectedModels.includes(m));

                      return (
                        <div key={pk} className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-3xs space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-100">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                                <v.icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-stone-900 text-sm">{v.name}</h4>
                                  {v.tag && (
                                    <span className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full font-medium">
                                      {v.tag}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isConfigured ? (
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Key 已就绪 {cfg.apiKey.trim() ? '' : '(系统内置)'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectProvider(pk)}
                                  className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors cursor-pointer"
                                >
                                  未配置 Key (去配置)
                                </button>
                              )}

                              {candidateModels.length > 0 && (
                                <div className="flex items-center space-x-1.5 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAllAutoModelsForVendor(candidateModels)}
                                    className="text-[11px] px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-medium transition-colors cursor-pointer"
                                  >
                                    全选该厂商
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleClearAutoModelsForVendor(candidateModels)}
                                    className="text-[11px] px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg font-medium transition-colors cursor-pointer"
                                  >
                                    清空
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-stone-500">
                            <span>
                              综合模式已选模型：
                              <b className={vendorSelectedInAuto.length > 0 ? "text-purple-700 ml-1" : "text-amber-600 ml-1 font-normal"}>
                                {vendorSelectedInAuto.length > 0 ? `${vendorSelectedInAuto.length} 个` : '默认为空 (未选择)'}
                              </b>
                            </span>
                            {vendorSelectedInAuto.includes(autoPrimaryModel) && (
                              <span className="text-amber-800 font-mono text-[11px] font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                综合主模型: {autoPrimaryModel}
                              </span>
                            )}
                          </div>

                          {candidateModels.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                              {candidateModels.map((m) => {
                                const isSelectedInAuto = autoTotalSelectedModels.includes(m);
                                const isPrimaryInAuto = autoPrimaryModel === m;

                                return (
                                  <div
                                    key={m}
                                    className={`p-2 rounded-xl border text-xs flex items-center justify-between transition-all cursor-pointer select-none ${
                                      isPrimaryInAuto
                                        ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-2xs font-semibold'
                                        : isSelectedInAuto
                                        ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-medium'
                                        : 'bg-stone-50/60 border-stone-200/80 text-stone-600 hover:bg-stone-100'
                                    }`}
                                    onClick={() => handleToggleAutoModel(m)}
                                  >
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isSelectedInAuto}
                                        onChange={() => {}}
                                        className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                      />
                                      <span className="font-mono text-[11px] truncate" title={m}>
                                        {m}
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetAutoPrimaryModel(m);
                                      }}
                                      className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5 shrink-0 transition-colors cursor-pointer ${
                                        isPrimaryInAuto
                                          ? 'bg-amber-500 text-white font-bold'
                                          : 'bg-stone-200/70 hover:bg-amber-200 text-stone-600 hover:text-amber-900'
                                      }`}
                                      title={isPrimaryInAuto ? '当前综合主模型' : '设为综合主模型'}
                                    >
                                      <Star className={`w-3 h-3 ${isPrimaryInAuto ? 'fill-white' : ''}`} />
                                      <span>{isPrimaryInAuto ? '主模型' : '设为主'}</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-center text-xs text-stone-500 flex items-center justify-between flex-wrap gap-2">
                              <span>
                                暂无选定模型 (默认为空)。请先在【{v.name}】配置页面勾选您需要的模型，勾选后将在此处显示。
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSelectProvider(pk)}
                                className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium rounded-lg transition-colors cursor-pointer shrink-0"
                              >
                                进入【{v.name}】勾选模型
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : activeProvider === 'huggingface' ? (
                <HuggingFacePanel
                  apiKey={apiKey}
                  onApiKeyChange={handleApiKeyChange}
                  onSaveKey={handleSaveKeyOnly}
                  onClearKey={handleClearKeyOnly}
                  isSaved={isSaved}
                  customBaseUrl={customModelBaseUrl}
                  onCustomBaseUrlChange={(url) => {
                  const sanitized = sanitizeConfig(activeProvider, {
                    ...currentConfig,
                    customBaseUrl: url
                  });
                  const newConfigs = { ...providerConfigs, [activeProvider]: sanitized };
                  setProviderConfigs(newConfigs);
                  saveAndSyncConfigs(newConfigs, activeProvider);
                }}
                selectedModel={selectedModel}
                selectedModels={selectedModels}
                onSelectModel={handleSetPrimaryModel}
                onToggleSelectModel={handleToggleSelectModel}
                onSelectAllModels={handleSelectAllModels}
                onClearSelectedModels={handleClearAllSelectedModels}
                hasEnvKey={envConfig?.providers?.huggingface?.hasEnvApiKey}
                envMaskedKey={envConfig?.providers?.huggingface?.apiKeyMasked}
                feedbackMessage={fetchResult}
              />
            ) : (
              <>
                {/* Vendor Banner Header */}
            <div className="bg-white border border-stone-200/80 rounded-2xl p-4 flex items-center justify-between shadow-3xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <currentVendor.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base flex items-center gap-2">
                    {currentVendor.name} 接入方法
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      {currentVendor.tag}
                    </span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">{currentVendor.description}</p>
                </div>
              </div>
            </div>

            {(() => {
              const activeEnv = envConfig?.providers?.[activeProvider] || (activeProvider === 'gemini' && envConfig?.hasEnvApiKey ? {
                hasEnvApiKey: envConfig.hasEnvApiKey,
                apiKeyMasked: envConfig.apiKeyMasked
              } : null);

              if (!activeEnv?.hasEnvApiKey) return null;

              return (
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-900 shadow-xs">
                  <div className="p-2 bg-emerald-100/80 rounded-xl text-emerald-700 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                      已检测到【{currentVendor.name}】服务端环境变量预设 API Key
                    </div>
                    <p className="text-emerald-800/90 leading-relaxed">
                      服务端已预设密钥 <code className="px-1.5 py-0.5 bg-emerald-100 rounded font-mono">{activeEnv.apiKeyMasked || '已加载'}</code>。在下方填入独立 API Key 可随时覆盖。
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 1. 填写密钥 */}
            <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">1</span>
                  1. 填写密钥 ({currentVendor.name} API KEY)
                </label>
                
                {isSaved ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3 h-3" />
                    已保存专属 Key
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertCircle className="w-3 h-3" />
                    尚未填写专属 Key
                  </span>
                )}
              </div>

              <div className="flex gap-2.5">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={currentVendor.placeholder}
                    className="w-full rounded-xl border border-stone-300 pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-stone-50/50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveKeyOnly}
                  disabled={!apiKey.trim()}
                  className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>保存 Key</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearKeyOnly}
                  disabled={!apiKey.trim() && !isSaved}
                  className="px-4 py-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 border border-stone-200 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-stone-500" />
                  <span>清除 Key</span>
                </button>
              </div>

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

            {/* 2. 自定义模型配置 (Shown for OpenAI, Groq, Other) */}
            {currentVendor.showCustomConfig && (
              <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">2</span>
                    2. 自定义模型配置
                  </label>
                  <p className="text-[10px] text-stone-400 mt-1">
                    配置接入点 Base URL 与通信协议：
                  </p>
                </div>

                {/* Quick Presets / Reset for providers */}
                {activeProvider === 'groq' && (
                  <div className="flex items-center gap-2 flex-wrap pb-1">
                    <span className="text-[11px] font-bold text-stone-500 shrink-0">快捷重置:</span>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.groq.com/openai/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                    >
                      重置 Groq 官方默认 URL (https://api.groq.com/openai/v1)
                    </button>
                  </div>
                )}
                {activeProvider === 'openai' && (
                  <div className="flex items-center gap-2 flex-wrap pb-1">
                    <span className="text-[11px] font-bold text-stone-500 shrink-0">快捷重置:</span>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.openai.com/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                    >
                      重置 OpenAI 官方默认 URL (https://api.openai.com/v1)
                    </button>
                  </div>
                )}
                {activeProvider === 'deepseek' && (
                  <div className="flex items-center gap-2 flex-wrap pb-1">
                    <span className="text-[11px] font-bold text-stone-500 shrink-0">快捷重置:</span>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.deepseek.com/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                    >
                      重置 DeepSeek 官方默认 URL (https://api.deepseek.com/v1)
                    </button>
                  </div>
                )}
                {activeProvider === 'other' && (
                  <div className="flex items-center gap-2 flex-wrap pb-1">
                    <span className="text-[11px] font-bold text-stone-500 shrink-0">快捷充填服务商:</span>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.deepseek.com/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-purple-50 hover:text-purple-700 text-stone-700 rounded-lg text-xs font-medium border border-stone-200 transition-colors cursor-pointer"
                    >
                      DeepSeek
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.siliconflow.cn/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-purple-50 hover:text-purple-700 text-stone-700 rounded-lg text-xs font-medium border border-stone-200 transition-colors cursor-pointer"
                    >
                      硅基流动
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'https://api.moonshot.cn/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-purple-50 hover:text-purple-700 text-stone-700 rounded-lg text-xs font-medium border border-stone-200 transition-colors cursor-pointer"
                    >
                      月之暗面 (Kimi)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentConfig({ customBaseUrl: 'http://localhost:11434/v1', customListUrl: '', useChatCompletions: true })}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-purple-50 hover:text-purple-700 text-stone-700 rounded-lg text-xs font-medium border border-stone-200 transition-colors cursor-pointer"
                    >
                      Ollama (本地)
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-600">基础 API URL (Base URL):</label>
                    <input
                      type="text"
                      value={customModelBaseUrl}
                      onChange={(e) => updateCurrentConfig({ customBaseUrl: e.target.value })}
                      placeholder="例如: https://api.openai.com/v1"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 outline-none bg-stone-50 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-600">模型列表 API URL (可选):</label>
                    <input
                      type="text"
                      value={customModelListUrl}
                      onChange={(e) => updateCurrentConfig({ customListUrl: e.target.value })}
                      placeholder="留空则自动请求 [Base URL]/models"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 outline-none bg-stone-50 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="useChatCompletions"
                      checked={useChatCompletions}
                      onChange={(e) => updateCurrentConfig({ useChatCompletions: e.target.checked })}
                      className="w-4 h-4 text-purple-600 rounded border-stone-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <label htmlFor="useChatCompletions" className="text-[11px] font-bold text-stone-600 cursor-pointer">
                      自动补充 /chat/completions (OpenAI 协议标准)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 账号对应的所有模型列表 */}
            <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">
                      {currentVendor.showCustomConfig ? '3' : '2'}
                    </span>
                    {currentVendor.showCustomConfig ? '3' : '2'}. {currentVendor.name} 账号对应的模型列表 ( {modelsList.length} )
                  </label>
                  <p className="text-[10px] text-stone-400 mt-1">
                    使用当前 Key 在线拉取 【{currentVendor.name}】 包含的所有授权可用模型，支持多选
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={isFetchingModels || !apiKey.trim()}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold rounded-xl shadow-2xs transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {isFetchingModels ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在拉取...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>刷新/获取所有模型</span>
                    </>
                  )}
                </button>
              </div>

              {!apiKey.trim() && (
                <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>请先在上方填写并保存【{currentVendor.name}】的 API Key 以拉取其独立模型列表</span>
                </div>
              )}

              {/* 当前厂商已选模型池 (Multi-Model Pool) */}
              <div className="p-4 bg-purple-50/40 border border-purple-200/80 rounded-2xl space-y-3 shadow-3xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <span>已选模型池 ({selectedModels.length})</span>
                    </span>
                    {selectedModel ? (
                      <span className="text-xs text-stone-600">
                        当前主模型: <span className="font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">{selectedModel}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                        尚未设置主创作模型
                      </span>
                    )}
                  </div>

                  {/* 快捷批量操作按钮 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {modelsList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSelectAllModels()}
                        className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                        title="将当前获取到的所有模型全选加入可用池"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>全选当前 ({modelsList.length})</span>
                      </button>
                    )}

                    {modelsList.some(m => singleTestResults[m]?.success) && (
                      <button
                        type="button"
                        onClick={handleSelectOnlyTestedAvailable}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                        title="只选用全量测试中验证可用的模型"
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>全选可用</span>
                      </button>
                    )}

                    {selectedModels.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllSelectedModels}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                        title="清空所有已勾选模型"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                        <span>清空已选</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 选中的模型标签池 */}
                {selectedModels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedModels.map((m) => {
                      const isPrimary = selectedModel === m;
                      return (
                        <div
                          key={m}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono transition-all ${
                            isPrimary
                              ? 'bg-amber-100/90 text-amber-950 border border-amber-300 font-bold shadow-2xs'
                              : 'bg-white text-stone-800 border border-stone-200 hover:border-purple-300'
                          }`}
                        >
                          {isPrimary ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded-md">
                              <Star className="w-2.5 h-2.5 fill-white" />
                              主模型
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryModel(m)}
                              className="text-stone-400 hover:text-amber-600 cursor-pointer"
                              title="点击设为当前小说创作主模型"
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          )}
                          <span className="truncate max-w-[200px]">{m}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleSelectModel(m)}
                            className="text-stone-400 hover:text-rose-600 p-0.5 rounded hover:bg-stone-100 transition-colors cursor-pointer"
                            title="从已选模型池移除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 italic">
                    尚未勾选任何模型。您可以在下方模型列表中点击「选用」勾选任意多个模型，或点击上方「全选当前」。
                  </p>
                )}
              </div>

              {/* Batch Test Prompt Bar */}
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
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    {isTestingModel ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>全量测试中...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>一键测试所有模型</span>
                      </>
                    )}
                  </button>
                </div>

                {(modelResponse || testError) && (
                  <div className="rounded-lg p-3 text-xs border bg-stone-900 font-mono text-stone-100 max-h-[160px] overflow-y-auto relative animate-fade-in space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] text-stone-400 border-b border-stone-800 pb-1.5">
                      <span>测试响应情况：</span>
                      <span className={modelResponse ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {modelResponse ? "✓ 正常通畅" : "✗ 诊断状态"}
                      </span>
                    </div>
                    {modelResponse && <p className="whitespace-pre-wrap leading-relaxed select-text text-stone-200">{modelResponse}</p>}
                    {testError && <p className="text-red-400 whitespace-pre-wrap leading-relaxed">{testError}</p>}
                  </div>
                )}
              </div>

              {/* Models List Display */}
              <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
                {modelsList.length > 0 && apiKey.trim() ? (
                  <div className="p-4 space-y-3 bg-stone-50/40">
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {modelsList.map((m) => {
                        const isSelected = selectedModels.includes(m);
                        const isPrimary = selectedModel === m;
                        const isTestingThis = testingModelIds.includes(m);
                        const testResult = singleTestResults[m];

                        return (
                          <div
                            key={m}
                            className={`border rounded-xl p-3.5 transition-all flex flex-col space-y-2.5 ${
                              isPrimary
                                ? 'border-amber-400 bg-amber-50/30 shadow-2xs'
                                : isSelected
                                ? 'border-purple-400 bg-purple-50/20 shadow-3xs'
                                : 'border-stone-200 bg-white hover:border-stone-300'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSelectModel(m)}
                                    className="cursor-pointer flex items-center gap-1.5 text-stone-900 text-left group"
                                    title={isSelected ? "点击取消勾选" : "点击加入已选模型池"}
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                                    ) : (
                                      <Square className="w-4 h-4 text-stone-300 group-hover:text-stone-500 shrink-0" />
                                    )}
                                    <span className="font-bold text-sm font-mono truncate">{m}</span>
                                  </button>

                                  {isPrimary && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white gap-0.5 shrink-0 shadow-3xs">
                                      <Star className="w-2.5 h-2.5 fill-white" />
                                      当前主创作模型
                                    </span>
                                  )}
                                  {isSelected && !isPrimary && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 gap-0.5 shrink-0">
                                      ✓ 已选入模型池
                                    </span>
                                  )}
                                  {testResult && (
                                    testResult.success ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 gap-0.5 shrink-0">
                                        ✓ 验证可用
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 gap-0.5 shrink-0">
                                        ✗ 不可用
                                      </span>
                                    )
                                  )}
                                </div>
                                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                                  {getModelDescription(m)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleTestSingleModel(m)}
                                  disabled={isTestingModel || testingModelIds.includes(m)}
                                  className="px-2.5 py-1.5 border border-stone-200 hover:bg-stone-50 disabled:opacity-50 text-stone-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors bg-white shadow-2xs cursor-pointer"
                                >
                                  {isTestingThis ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                  ) : (
                                    <Play className="w-3 h-3 text-stone-500 fill-stone-500" />
                                  )}
                                  <span>测试</span>
                                </button>

                                {isSelected && !isPrimary && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetPrimaryModel(m)}
                                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                                    title="设为当前小说创作主模型"
                                  >
                                    <Star className="w-3 h-3 text-amber-600" />
                                    <span>设为主模型</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectModel(m)}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                                    isSelected
                                      ? "bg-purple-600 text-white hover:bg-purple-700 shadow-xs"
                                      : "bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200"
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>已选用</span>
                                    </>
                                  ) : (
                                    <span>+ 选用</span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {testResult && (
                              <div className="p-2.5 bg-stone-950 rounded-xl font-mono text-[11px] text-stone-200 border border-stone-800 animate-fade-in">
                                <div className="flex justify-between items-center text-[10px] text-stone-400 border-b border-stone-800 pb-1 mb-1">
                                  <span>测试回复：</span>
                                  <span className={testResult.success ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                    {testResult.success ? "✓ 成功" : "✗ 失败"}
                                  </span>
                                </div>
                                {testResult.success ? (
                                  <p className="whitespace-pre-wrap leading-relaxed select-text">{testResult.response}</p>
                                ) : (
                                  <p className="text-red-400 whitespace-pre-wrap leading-relaxed">{testResult.error}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-stone-200/60">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        placeholder="手动输入特定模型ID（如 gpt-4o 或 deepseek-chat）..."
                        className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono focus:ring-1 focus:ring-purple-500 outline-none bg-white shadow-3xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomModel}
                        disabled={!customModelInput.trim()}
                        className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shrink-0 flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>添加并加入已选</span>
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
                        ? `暂无模型。请点击右上角【刷新/获取所有模型】获取 ${currentVendor.name} 专属授权模型。`
                        : `请先在上方填写并保存 ${currentVendor.name} 专属 API Key，以输出该账号对应的所有可用模型。账户对应模型将通过授权密钥获取。对方使用自身密钥则获取对方账户对应模型。已支持同时多选多个模型。 `}
                    </p>
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>

      {/* Footer info & Actions */}
      <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="text-[11px] text-stone-500 flex items-center gap-1.5 flex-wrap">
          <span>当前激活 AI 厂商：</span>
          {activeProvider === 'auto' ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-purple-900 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-lg">
                综合 Auto 聚合模式
              </span>
              <span className="text-stone-600">
                已勾选 <b className="text-purple-700 font-mono">{autoTotalSelectedModels.length}</b> 个跨厂商模型
              </span>
              {autoPrimaryModel ? (
                <span className="font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                  主: {autoPrimaryModel}
                </span>
              ) : (
                <span className="text-stone-400">（尚未选定主模型）</span>
              )}
            </div>
          ) : (apiKey.trim() || envConfig?.providers?.[activeProvider]?.hasEnvApiKey) ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-purple-900 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-lg">
                {currentVendor.name}
              </span>
              <span className="text-stone-600">
                已选 <b className="text-purple-700 font-mono">{selectedModels.length}</b> 个模型
              </span>
              {selectedModel ? (
                <span className="font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                  主: {selectedModel}
                </span>
              ) : (
                <span className="text-stone-400">（尚未选定主模型）</span>
              )}
            </div>
          ) : (
            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg font-medium">
              尚未在选定厂商中激活可用的 API 密钥
            </span>
          )}
        </div>
        <div className="flex space-x-2.5">
          {(apiKey || selectedModel || selectedModels.length > 0) && (
            <button
              type="button"
              onClick={handleClearCurrentProvider}
              className="px-3.5 py-2 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              title="重置并清空当前所选厂商的 API Key 及配置"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>重置当前厂商</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
          >
            完成配置
          </button>
        </div>
      </div>
    </div>
  </div>
);
};

export default ApiKeyModal;
