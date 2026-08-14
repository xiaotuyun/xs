import React, { useState, useEffect } from 'react';
import {
  Key,
  Sparkles,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Play,
  Zap,
  Globe,
  Smile,
  Search,
  User,
  Filter,
  Tag,
  Flame,
  MessageSquare,
  FileText,
  Languages,
  HelpCircle,
  Fingerprint,
  Image as ImageIcon,
  Heart,
  Crosshair,
  GitCompare,
  Puzzle,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ExternalLink,
  Bot,
  Layers,
  X,
  RotateCcw
} from 'lucide-react';
import { apiHfWhoami, apiHfModels, apiHfInference, HfModelItem, apiTestModel } from '../lib/aiClient';

interface HuggingFacePanelProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;
  isSaved: boolean;
  customBaseUrl: string;
  onCustomBaseUrlChange: (url: string) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  hasEnvKey?: boolean;
  envMaskedKey?: string;
  feedbackMessage?: { success: boolean; message: string } | null;
}

type HfCallMode = 'local' | 'api';

// 18 Categories: 7 Model List + 11 Inference Tasks
export type HfCategoryType =
  // 一、模型列表 (7 个)
  | 'my_models'
  | 'by_author'
  | 'by_keyword'
  | 'by_task'
  | 'top_text_gen'
  | 'top_text_class'
  | 'top_downloads'
  // 二、推理任务 (11 个)
  | 'task_sentiment_finbert'
  | 'task_sentiment_twitter'
  | 'task_zero_shot'
  | 'task_sentence_sim'
  | 'task_text_gen'
  | 'task_fill_mask'
  | 'task_summarization'
  | 'task_translation'
  | 'task_qa'
  | 'task_ner'
  | 'task_zero_shot_image';

interface TaskConfig {
  id: HfCategoryType;
  name: string;
  model: string;
  taskType: string;
  icon: any;
  description: string;
  defaultInputs: any;
  defaultParams?: any;
}

const INFERENCE_TASKS: TaskConfig[] = [
  {
    id: 'task_sentiment_finbert',
    name: '1. 情感分析 (ProsusAI/finbert)',
    model: 'ProsusAI/finbert',
    taskType: 'text-classification',
    icon: Smile,
    description: '金融与通用文本情绪判断（积极/中性/消极）',
    defaultInputs: 'I love using Hugging Face! It makes deploying AI models so fast and easy.'
  },
  {
    id: 'task_sentiment_twitter',
    name: '2. 情感分析 (twitter-roberta-base)',
    model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
    taskType: 'text-classification',
    icon: Heart,
    description: '社交网络与推特短文本情绪多分类',
    defaultInputs: 'This new iPhone is amazing! I love it so much.'
  },
  {
    id: 'task_zero_shot',
    name: '3. 零样本分类 (bart-large-mnli)',
    model: 'facebook/bart-large-mnli',
    taskType: 'zero-shot-classification',
    icon: Crosshair,
    description: '无需训练，自定标签进行语义归类',
    defaultInputs: {
      text: 'This product is absolutely amazing, I love it so much!',
      labels: 'positive review, negative review, neutral review'
    }
  },
  {
    id: 'task_sentence_sim',
    name: '4. 句子相似度 (all-MiniLM-L6-v2)',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    taskType: 'sentence-similarity',
    icon: GitCompare,
    description: '计算待比对句子与原句之间的向量余弦相似度',
    defaultInputs: {
      source: 'I love this product',
      sentences: 'This product is great\nI hate it\nAmazing stuff\nNice weather'
    }
  },
  {
    id: 'task_text_gen',
    name: '5. 文本生成 (chat_completion)',
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    taskType: 'chat_completion',
    icon: MessageSquare,
    description: '基于 Hugging Face Router 的高质量大模型对话与创作',
    defaultInputs: '用一句话生动解释什么是人工智能与大语言模型？'
  },
  {
    id: 'task_fill_mask',
    name: '6. 填充掩码 (distilbert-base-uncased)',
    model: 'distilbert/distilbert-base-uncased',
    taskType: 'fill-mask',
    icon: Puzzle,
    description: '预测英文句子中被 [MASK] 遮挡的最佳单词',
    defaultInputs: 'The capital of France is [MASK].'
  },
  {
    id: 'task_summarization',
    name: '7. 摘要生成 (distilbart-cnn-12-6)',
    model: 'sshleifer/distilbart-cnn-12-6',
    taskType: 'summarization',
    icon: FileText,
    description: '对长篇新闻、文献或小说段落自动提炼要点摘要',
    defaultInputs: 'The quick brown fox jumps over the lazy dog. Machine learning and artificial intelligence are revolutionizing software development across the globe. Researchers have developed new transformer architectures that significantly boost inference performance while reducing power consumption.'
  },
  {
    id: 'task_translation',
    name: '8. 翻译 (opus-mt-en-zh)',
    model: 'Helsinki-NLP/opus-mt-en-zh',
    taskType: 'translation',
    icon: Languages,
    description: '英语到中文高质量神经机器翻译',
    defaultInputs: 'Hello world, this is a translation test of Hugging Face translation models.'
  },
  {
    id: 'task_qa',
    name: '9. 问答系统 (roberta-base-squad2)',
    model: 'deepset/roberta-base-squad2',
    taskType: 'question-answering',
    icon: HelpCircle,
    description: '根据提供的文章背景段落精准回答用户提问',
    defaultInputs: {
      question: 'What is the capital of France?',
      context: 'France is a country located in Western Europe. Its capital city is Paris, which is globally renowned as the City of Light and a major hub for art and culture.'
    }
  },
  {
    id: 'task_ner',
    name: '10. 命名实体识别 (bert-base-NER)',
    model: 'dslim/bert-base-NER',
    taskType: 'token-classification',
    icon: Fingerprint,
    description: '自动抽取文本中的人名 (PER)、地名 (LOC) 与组织名 (ORG)',
    defaultInputs: 'My name is John Smith and I work for Google in New York.'
  },
  {
    id: 'task_zero_shot_image',
    name: '11. 零样本图像分类 (clip-vit-base)',
    model: 'openai/clip-vit-base-patch32',
    taskType: 'zero-shot-image-classification',
    icon: ImageIcon,
    description: '基于视觉语言模型的多标签图像识别',
    defaultInputs: {
      image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&q=80',
      labels: 'cat, dog, bird, car, landscape'
    }
  }
];

export const HuggingFacePanel: React.FC<HuggingFacePanelProps> = ({
  apiKey,
  onApiKeyChange,
  onSaveKey,
  onClearKey,
  isSaved,
  customBaseUrl,
  onCustomBaseUrlChange,
  selectedModel,
  onSelectModel,
  hasEnvKey,
  envMaskedKey,
  feedbackMessage
}) => {
  // Call mode: 'local' (本地封装调用) or 'api' (API 调用)
  const [callMode, setCallMode] = useState<HfCallMode>('local');
  const [activeCategory, setActiveCategory] = useState<HfCategoryType>('my_models');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Model List Filters
  const [authorFilter, setAuthorFilter] = useState('meta-llama');
  const [keywordFilter, setKeywordFilter] = useState('bert');
  const [taskFilter, setTaskFilter] = useState('text-generation');
  const [customModelInput, setCustomModelInput] = useState('');

  // Loaded models and states
  const [modelList, setModelList] = useState<HfModelItem[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState('');
  const [whoamiUser, setWhoamiUser] = useState<{ name: string; fullname?: string; email?: string } | null>(null);

  // Single Model quick test state
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [singleTestResults, setSingleTestResults] = useState<Record<string, { success: boolean; response?: string; error?: string }>>({});

  // Inference Task States
  const [taskInputs, setTaskInputs] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    INFERENCE_TASKS.forEach(t => {
      init[t.id] = t.defaultInputs;
    });
    return init;
  });

  const [taskOutputs, setTaskOutputs] = useState<Record<string, {
    loading: boolean;
    result?: any;
    text?: string;
    duration?: number;
    error?: string;
  }>>({});

  // Quick preset pills
  const presetAuthors = ['meta-llama', 'Qwen', 'deepseek-ai', 'google', 'mistralai', 'facebook', 'BAAI', 'THUDM', '01-ai'];
  const presetKeywords = ['bert', 'llama', 'qwen', 'deepseek', 'chatglm', 'mistral', 'gemma', 'diffusion'];
  const presetTasks = [
    { value: 'text-generation', label: '文本生成 (text-generation)' },
    { value: 'text-classification', label: '文本分类 (text-classification)' },
    { value: 'fill-mask', label: '填充掩码 (fill-mask)' },
    { value: 'translation', label: '机器翻译 (translation)' },
    { value: 'question-answering', label: '问答系统 (question-answering)' },
    { value: 'token-classification', label: '命名实体 (token-classification)' },
    { value: 'sentence-similarity', label: '句子相似度 (sentence-similarity)' },
    { value: 'summarization', label: '摘要提取 (summarization)' },
    { value: 'zero-shot-classification', label: '零样本分类 (zero-shot)' }
  ];

  // Fetch models for current category
  const fetchCategoryModels = async (category: HfCategoryType) => {
    setIsLoadingModels(true);
    setModelFetchError('');

    try {
      if (category === 'my_models') {
        // First get whoami
        let user = whoamiUser;
        if (!user && apiKey.trim()) {
          const who = await apiHfWhoami(apiKey.trim());
          if (who.success && who.user) {
            user = who.user;
            setWhoamiUser(who.user);
          }
        }
        const authorName = user?.name || '';
        if (!authorName) {
          if (!apiKey.trim()) {
            setModelFetchError('请先填写并保存您的 Hugging Face Token 以获取您的个人模型');
            setIsLoadingModels(false);
            return;
          }
          const who = await apiHfWhoami(apiKey.trim());
          if (who.success && who.user) {
            user = who.user;
            setWhoamiUser(who.user);
          } else {
            setModelFetchError(who.error || '无法获取个人账户信息，请检查 Token 权限');
            setIsLoadingModels(false);
            return;
          }
        }

        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          author: user?.name,
          limit: 50
        });

        if (res.success) {
          setModelList(res.models);
          if (res.models.length === 0) {
            setModelFetchError(`账户 @${user?.name} 下暂无已发布的模型。`);
          }
        } else {
          setModelFetchError(res.error || '获取个人模型列表失败');
        }
      } else if (category === 'by_author') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          author: authorFilter.trim() || 'meta-llama',
          sort: 'downloads',
          direction: '-1',
          limit: 50
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '未查找到该作者的模型');
        }
      } else if (category === 'by_keyword') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          search: keywordFilter.trim() || 'bert',
          sort: 'downloads',
          direction: '-1',
          limit: 50
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '未查找到包含该关键词的模型');
        }
      } else if (category === 'by_task') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          filter: taskFilter.trim() || 'text-generation',
          sort: 'downloads',
          direction: '-1',
          limit: 50
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '未查找到该任务类型的模型');
        }
      } else if (category === 'top_text_gen') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          filter: 'text-generation',
          sort: 'downloads',
          direction: '-1',
          limit: 10
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '获取热门文本生成模型失败');
        }
      } else if (category === 'top_text_class') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          filter: 'text-classification',
          sort: 'downloads',
          direction: '-1',
          limit: 10
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '获取热门文本分类模型失败');
        }
      } else if (category === 'top_downloads') {
        const res = await apiHfModels({
          apiKey: apiKey.trim(),
          sort: 'downloads',
          direction: '-1',
          limit: 15
        });
        if (res.success) {
          setModelList(res.models);
        } else {
          setModelFetchError(res.error || '获取热门下载模型失败');
        }
      }
    } catch (err: any) {
      setModelFetchError(err.message || '网络连接失败');
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Trigger load when category changes (for model list categories)
  useEffect(() => {
    if (
      activeCategory === 'my_models' ||
      activeCategory === 'by_author' ||
      activeCategory === 'by_keyword' ||
      activeCategory === 'by_task' ||
      activeCategory === 'top_text_gen' ||
      activeCategory === 'top_text_class' ||
      activeCategory === 'top_downloads'
    ) {
      fetchCategoryModels(activeCategory);
    }
  }, [activeCategory]);

  // If user has key saved, try to whoami once
  useEffect(() => {
    if (apiKey.trim() && !whoamiUser) {
      apiHfWhoami(apiKey.trim()).then(res => {
        if (res.success && res.user) {
          setWhoamiUser(res.user);
        }
      }).catch(() => {});
    }
  }, [apiKey]);

  // Run single test for model in list
  const handleTestSingleModel = async (modelId: string) => {
    const activeKey = apiKey.trim();
    if (!activeKey) {
      setSingleTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, error: '请先在上方填写并保存 Hugging Face Token' }
      }));
      return;
    }

    setTestingModelId(modelId);
    setSingleTestResults(prev => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });

    try {
      // Use test model endpoint with HF router
      const data = await apiTestModel({
        apiKey: activeKey,
        model: modelId,
        prompt: '你好！请回复确认当前模型可用。',
        customBaseUrl: customBaseUrl.trim() || 'https://router.huggingface.co/v1',
        useChatCompletions: true
      });

      if (data.success) {
        setSingleTestResults(prev => ({
          ...prev,
          [modelId]: { success: true, response: data.response || '测试成功，模型响应正常。' }
        }));
      } else {
        throw new Error(data.error || '测试该模型失败');
      }
    } catch (err: any) {
      setSingleTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, error: err.message || '连接超时或未开启该模型推理通道' }
      }));
    } finally {
      setTestingModelId(null);
    }
  };

  // Run inference task
  const handleRunInference = async (task: TaskConfig) => {
    const activeKey = apiKey.trim();
    const inputVal = taskInputs[task.id];

    setTaskOutputs(prev => ({
      ...prev,
      [task.id]: { loading: true }
    }));

    try {
      let inputsPayload: any = inputVal;
      let paramsPayload: any = undefined;

      if (task.id === 'task_zero_shot') {
        inputsPayload = inputVal.text;
        paramsPayload = {
          candidate_labels: (inputVal.labels || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        };
      } else if (task.id === 'task_sentence_sim') {
        inputsPayload = {
          source_sentence: inputVal.source,
          sentences: (inputVal.sentences || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
        };
      } else if (task.id === 'task_qa') {
        inputsPayload = {
          question: inputVal.question,
          context: inputVal.context
        };
      } else if (task.id === 'task_zero_shot_image') {
        inputsPayload = {
          image: inputVal.image
        };
        paramsPayload = {
          candidate_labels: (inputVal.labels || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        };
      }

      const res = await apiHfInference({
        apiKey: activeKey,
        model: task.model,
        task: task.taskType,
        inputs: inputsPayload,
        parameters: paramsPayload
      });

      if (res.success) {
        setTaskOutputs(prev => ({
          ...prev,
          [task.id]: {
            loading: false,
            result: res.result,
            text: res.text,
            duration: res.duration
          }
        }));
      } else {
        throw new Error(res.error || '推理任务执行失败');
      }
    } catch (err: any) {
      setTaskOutputs(prev => ({
        ...prev,
        [task.id]: {
          loading: false,
          error: err.message || '推理请求异常'
        }
      }));
    }
  };

  const handleAddCustomModel = () => {
    const custom = customModelInput.trim();
    if (!custom) return;
    onSelectModel(custom);
    setCustomModelInput('');
  };

  const formatNumber = (num?: number) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  const isModelListCategory = (cat: HfCategoryType) => {
    return [
      'my_models',
      'by_author',
      'by_keyword',
      'by_task',
      'top_text_gen',
      'top_text_class',
      'top_downloads'
    ].includes(cat);
  };

  const currentTaskConfig = INFERENCE_TASKS.find(t => t.id === activeCategory);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between shadow-3xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl font-bold shadow-2xs">
            🤗
          </div>
          <div>
            <h3 className="font-black text-stone-900 text-base flex items-center gap-2">
              Hugging Face 官方模型生态与推理 API
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                开源模型基座
              </span>
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              支持 7 类开源模型库精准检索与 11 种热门 NLP / 视觉推理任务实时在线调用
            </p>
          </div>
        </div>
        {whoamiUser && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-xs text-stone-700 shadow-3xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-stone-900 font-mono">@{whoamiUser.name}</span>
            <span className="text-[10px] text-stone-400">已授权</span>
          </div>
        )}
      </div>

      {hasEnvKey && (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-900 shadow-xs">
          <div className="p-2 bg-emerald-100/80 rounded-xl text-emerald-700 shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="font-bold text-emerald-950 flex items-center gap-1.5">
              已检测到服务端环境变量预设 Hugging Face Token
            </div>
            <p className="text-emerald-800/90 leading-relaxed">
              系统已预加载 Token <code className="px-1.5 py-0.5 bg-emerald-100 rounded font-mono">{envMaskedKey || '已加载'}</code>。在下方填入个人 Access Token 可覆盖使用。
            </p>
          </div>
        </div>
      )}

      {/* 顶部：输入保存密钥 (HF Token) */}
      <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-black">
              Key
            </span>
            输入保存密钥 (Hugging Face User Access Token)
          </label>

          {isSaved ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3 h-3" />
              已保存专属 Token
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <AlertCircle className="w-3 h-3" />
              尚未填写专属 Token
            </span>
          )}
        </div>

        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="填写 Hugging Face Access Token (如 hf_...)"
              className="w-full rounded-xl border border-stone-300 pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-stone-50/50 font-mono"
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
            onClick={onSaveKey}
            disabled={!apiKey.trim()}
            className="px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>保存 Key</span>
          </button>
          <button
            type="button"
            onClick={onClearKey}
            disabled={!apiKey.trim() && !isSaved}
            className="px-4 py-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 border border-stone-200 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-stone-500" />
            <span>清除 Key</span>
          </button>
        </div>

        {feedbackMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-start space-x-2 border animate-fade-in ${
              feedbackMessage.success
                ? 'bg-emerald-50/80 text-emerald-900 border-emerald-200'
                : 'bg-red-50/80 text-red-900 border-red-200'
            }`}
          >
            {feedbackMessage.success ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{feedbackMessage.message}</div>
          </div>
        )}
      </div>

      {/* 第一行：调用方式选择 (本地封装调用 vs API 调用) */}
      <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
        <div>
          <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">
              1
            </span>
            第一行：调用方式选择
          </label>
          <p className="text-[10px] text-stone-400 mt-1">
            选择通过 Node 服务端内置封装直连 Hugging Face Hub / 推理端点，或使用兼容 OpenAI 标准路由的 API 代理
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setCallMode('local');
              onCustomBaseUrlChange('https://router.huggingface.co/v1');
            }}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start space-x-3 cursor-pointer ${
              callMode === 'local'
                ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20 shadow-xs'
                : 'border-stone-200 bg-stone-50/40 hover:bg-stone-50'
            }`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${
              callMode === 'local' ? 'bg-amber-500 text-white' : 'bg-stone-200 text-stone-600'
            }`}>
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-stone-900">💻 本地封装调用 (Direct Hub & Inference)</span>
                {callMode === 'local' && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
              </div>
              <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                无需外部中转，直接调用 Hugging Face Hub REST API 与 InferenceClient 任务推理
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setCallMode('api');
              if (!customBaseUrl) onCustomBaseUrlChange('https://router.huggingface.co/v1');
            }}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start space-x-3 cursor-pointer ${
              callMode === 'api'
                ? 'border-purple-600 bg-purple-50/40 ring-2 ring-purple-500/20 shadow-xs'
                : 'border-stone-200 bg-stone-50/40 hover:bg-stone-50'
            }`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${
              callMode === 'api' ? 'bg-purple-600 text-white' : 'bg-stone-200 text-stone-600'
            }`}>
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-stone-900">🌐 API 调用 (OpenAI 协议 Router)</span>
                {callMode === 'api' && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
              </div>
              <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                基于 Hugging Face 官方 Router (<code className="font-mono text-[10px]">https://router.huggingface.co/v1</code>)
              </p>
            </div>
          </button>
        </div>

        {callMode === 'api' && (
          <div className="pt-2 border-t border-stone-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-stone-600">基础 API URL (Base URL):</label>
              <button
                type="button"
                onClick={() => onCustomBaseUrlChange('https://router.huggingface.co/v1')}
                className="text-[10px] font-bold text-purple-600 hover:text-purple-800 cursor-pointer"
              >
                重置为默认官方 Router
              </button>
            </div>
            <input
              type="text"
              value={customBaseUrl}
              onChange={(e) => onCustomBaseUrlChange(e.target.value)}
              placeholder="https://router.huggingface.co/v1"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono focus:ring-1 focus:ring-purple-500 outline-none bg-stone-50"
            />
          </div>
        )}
      </div>

      {/* 第二行：分类选择 (18 个分类选项，划分为两大部分) */}
      <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
        <div>
          <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-black">
              2
            </span>
            第二行：功能与分类选择 (18 个专属分类)
          </label>
          <p className="text-[10px] text-stone-400 mt-1">
            选择上方的大类分类以检索模型库或体验对应的预设推理任务
          </p>
        </div>

        {/* 一、模型列表部分 (7个分类) */}
        <div className="space-y-2 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200/80">
          <div className="text-[11px] font-extrabold text-stone-700 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>一、模型列表部分（7个分类）</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[
              { id: 'my_models' as HfCategoryType, name: '1. 你自己的模型', icon: User },
              { id: 'by_author' as HfCategoryType, name: '2. 按作者筛选', icon: User },
              { id: 'by_keyword' as HfCategoryType, name: '3. 按关键词搜索', icon: Search },
              { id: 'by_task' as HfCategoryType, name: '4. 按任务类型筛选', icon: Filter },
              { id: 'top_text_gen' as HfCategoryType, name: '5. 文本生成类模型(热门前10)', icon: Sparkles },
              { id: 'top_text_class' as HfCategoryType, name: '6. 文本分类模型(热门前10)', icon: Tag },
              { id: 'top_downloads' as HfCategoryType, name: '7. 热门模型(下载量前15)', icon: Flame },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200/80'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-blue-600'}`} />
                  <span className="truncate">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 二、推理任务部分 (11个分类) */}
        <div className="space-y-2 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200/80">
          <div className="text-[11px] font-extrabold text-stone-700 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>二、推理任务部分（11个分类）</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {INFERENCE_TASKS.map((task) => {
              const Icon = task.icon;
              const isActive = activeCategory === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setActiveCategory(task.id)}
                  className={`p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200/80'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-amber-600'}`} />
                  <span className="truncate">{task.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 第三行：选择的分类对应的模型列表 / 推理任务执行面板 */}
      <div className="bg-white border border-stone-200/60 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-black">
                3
              </span>
              第三行：【
              {isModelListCategory(activeCategory)
                ? '模型列表'
                : (currentTaskConfig?.name || '推理任务')}
              】对应的模型与执行面板
            </label>
            <p className="text-[10px] text-stone-400 mt-1">
              {isModelListCategory(activeCategory)
                ? '点击「选择此模型」可设置为小说创作主模型，点击「测试模型」可在线测试模型可用性'
                : '配置输入文本后点击「运行推理任务」，实时获取 Hugging Face 推理结果与置信度'}
            </p>
          </div>

          {isModelListCategory(activeCategory) && (
            <button
              type="button"
              onClick={() => fetchCategoryModels(activeCategory)}
              disabled={isLoadingModels}
              className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl shadow-3xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLoadingModels ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在查询...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>刷新当前列表</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* 当前选用主模型状态展示与一键取消重置栏 */}
        <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-stone-500 font-medium shrink-0">当前小说创作主模型:</span>
            {selectedModel ? (
              <span className="font-mono font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-2.5 py-0.5 rounded-lg truncate">
                {selectedModel}
              </span>
            ) : (
              <span className="font-mono text-stone-500 bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded-lg">
                未指定（请从下方列表点击「选择此模型」或手动输入）
              </span>
            )}
          </div>
          {selectedModel && (
            <button
              type="button"
              onClick={() => onSelectModel('')}
              className="px-3 py-1 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1 shrink-0"
              title="取消选择当前模型"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
              <span>取消选择 / 清空已选</span>
            </button>
          )}
        </div>

        {/* 1. 模型列表分类处理 */}
        {isModelListCategory(activeCategory) && (
          <div className="space-y-4">
            {/* Filter conditions bar if by_author / by_keyword / by_task */}
            {activeCategory === 'by_author' && (
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={authorFilter}
                    onChange={(e) => setAuthorFilter(e.target.value)}
                    placeholder="输入作者/机构名称，如 meta-llama, Qwen, deepseek-ai..."
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => fetchCategoryModels('by_author')}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    按作者查询
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-bold text-stone-500 shrink-0">快捷作者:</span>
                  {presetAuthors.map((author) => (
                    <button
                      key={author}
                      type="button"
                      onClick={() => {
                        setAuthorFilter(author);
                        // Trigger search with this author
                        setIsLoadingModels(true);
                        apiHfModels({ apiKey: apiKey.trim(), author, sort: 'downloads', direction: '-1', limit: 50 })
                          .then(res => res.success ? setModelList(res.models) : setModelFetchError(res.error || ''))
                          .finally(() => setIsLoadingModels(false));
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        authorFilter === author
                          ? 'bg-blue-100 text-blue-800 border-blue-300 font-bold'
                          : 'bg-white text-stone-600 hover:bg-stone-100 border-stone-200'
                      }`}
                    >
                      {author}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeCategory === 'by_keyword' && (
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keywordFilter}
                    onChange={(e) => setKeywordFilter(e.target.value)}
                    placeholder="输入搜索关键词，如 bert, llama, qwen, deepseek..."
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => fetchCategoryModels('by_keyword')}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    按关键词搜索
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-bold text-stone-500 shrink-0">热门关键词:</span>
                  {presetKeywords.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => {
                        setKeywordFilter(kw);
                        setIsLoadingModels(true);
                        apiHfModels({ apiKey: apiKey.trim(), search: kw, sort: 'downloads', direction: '-1', limit: 50 })
                          .then(res => res.success ? setModelList(res.models) : setModelFetchError(res.error || ''))
                          .finally(() => setIsLoadingModels(false));
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        keywordFilter === kw
                          ? 'bg-blue-100 text-blue-800 border-blue-300 font-bold'
                          : 'bg-white text-stone-600 hover:bg-stone-100 border-stone-200'
                      }`}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeCategory === 'by_task' && (
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={taskFilter}
                    onChange={(e) => {
                      setTaskFilter(e.target.value);
                      setIsLoadingModels(true);
                      apiHfModels({ apiKey: apiKey.trim(), filter: e.target.value, sort: 'downloads', direction: '-1', limit: 50 })
                        .then(res => res.success ? setModelList(res.models) : setModelFetchError(res.error || ''))
                        .finally(() => setIsLoadingModels(false));
                    }}
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    {presetTasks.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => fetchCategoryModels('by_task')}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    按任务筛选
                  </button>
                </div>
              </div>
            )}

            {activeCategory === 'my_models' && whoamiUser && (
              <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl text-xs flex items-center justify-between text-blue-900">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>当前 Hugging Face 账户：<strong className="font-mono">{whoamiUser.name}</strong> ({whoamiUser.fullname || '个人开发者'})</span>
                </div>
                <span className="font-mono text-[11px] bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                  共找到 {modelList.length} 个模型
                </span>
              </div>
            )}

            {/* Error Display */}
            {modelFetchError && (
              <div className="p-3.5 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{modelFetchError}</span>
              </div>
            )}

            {/* Model List Cards */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-3xs">
              {isLoadingModels ? (
                <div className="py-12 bg-stone-50/40 text-center flex flex-col items-center justify-center p-6 space-y-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-xs text-stone-500 font-medium">正在从 Hugging Face 获取模型列表中...</p>
                </div>
              ) : modelList.length > 0 ? (
                <div className="p-4 space-y-2.5 bg-stone-50/40 max-h-[360px] overflow-y-auto pr-1">
                  {modelList.map((m) => {
                    const isSelected = selectedModel === m.id;
                    const isTestingThis = testingModelId === m.id;
                    const testResult = singleTestResults[m.id];

                    return (
                      <div
                        key={m.id}
                        className={`border rounded-xl p-3.5 transition-all flex flex-col space-y-2.5 ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/30 shadow-2xs'
                            : 'border-stone-200 bg-white hover:border-stone-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm font-mono text-stone-900 truncate">{m.id}</span>
                              {m.pipeline_tag && (
                                <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] font-mono border border-stone-200">
                                  {m.pipeline_tag}
                                </span>
                              )}
                              {isSelected && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white gap-0.5 shrink-0">
                                  <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                                  当前选中使用
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-stone-400 mt-1 font-mono">
                              <span>⬇️ {formatNumber(m.downloads)} 下载</span>
                              <span>❤️ {formatNumber(m.likes)} 赞</span>
                              {m.private && <span className="text-amber-600 font-bold">🔒 私有模型</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end">
                            <button
                              type="button"
                              onClick={() => handleTestSingleModel(m.id)}
                              disabled={isTestingThis}
                              className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 disabled:opacity-50 text-stone-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors bg-white shadow-3xs cursor-pointer"
                            >
                              {isTestingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              ) : (
                                <Play className="w-3 h-3 text-stone-500 fill-stone-500" />
                              )}
                              <span>测试模型</span>
                            </button>

                            {isSelected ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>已选用</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onSelectModel('')}
                                  className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-bold rounded-lg transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                                  title="取消选用此模型"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>取消</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onSelectModel(m.id)}
                                className="px-3 py-1.5 bg-stone-100 hover:bg-amber-50 hover:text-amber-800 text-stone-700 text-xs font-bold rounded-lg transition-colors border border-stone-200 cursor-pointer"
                              >
                                选择此模型
                              </button>
                            )}
                          </div>
                        </div>

                        {testResult && (
                          <div className="p-2.5 bg-stone-950 rounded-xl font-mono text-[11px] text-stone-200 border border-stone-800 animate-fade-in">
                            <div className="flex justify-between items-center text-[10px] text-stone-400 border-b border-stone-800 pb-1 mb-1">
                              <span>测试响应情况：</span>
                              <span className={testResult.success ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                {testResult.success ? "✓ 成功连通" : "✗ 诊断未通"}
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
              ) : (
                <div className="py-10 bg-stone-50/40 text-center flex flex-col items-center justify-center p-6 space-y-2">
                  <Layers className="w-8 h-8 text-stone-300" />
                  <p className="text-xs text-stone-500 font-medium">当前分类下暂无模型，请点击上方「刷新当前列表」或更换关键词</p>
                </div>
              )}

              {/* 手动添加特定 HF 模型 */}
              <div className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
                <input
                  type="text"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="手动输入特定 Hugging Face 模型 ID (如 Qwen/Qwen2.5-72B-Instruct)..."
                  className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono focus:ring-1 focus:ring-amber-500 outline-none bg-stone-50"
                />
                <button
                  type="button"
                  onClick={handleAddCustomModel}
                  disabled={!customModelInput.trim()}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shrink-0 flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加并选中</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. 推理任务分类处理 (11 个任务) */}
        {!isModelListCategory(activeCategory) && currentTaskConfig && (
          <div className="space-y-4">
            {/* Task Info & Model Selector */}
            <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-stone-900">{currentTaskConfig.name}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-mono text-[10px] font-bold border border-amber-200">
                    {currentTaskConfig.taskType}
                  </span>
                </div>
                <p className="text-xs text-stone-600">{currentTaskConfig.description}</p>
                <div className="text-[11px] font-mono text-stone-500">
                  推荐测试模型: <strong className="text-amber-900">{currentTaskConfig.model}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedModel === currentTaskConfig.model ? (
                  <div className="flex items-center gap-1.5">
                    <span className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                      <Check className="w-3.5 h-3.5" />
                      <span>已设为主模型</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectModel('')}
                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-bold rounded-xl transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                      title="取消设置该模型"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>取消选择</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectModel(currentTaskConfig.model)}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors shadow-3xs cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>设为小说主模型</span>
                  </button>
                )}
              </div>
            </div>

            {/* Task Inputs Form */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
              <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>测试输入参数：</span>
                <button
                  type="button"
                  onClick={() => setTaskInputs(prev => ({ ...prev, [currentTaskConfig.id]: currentTaskConfig.defaultInputs }))}
                  className="text-[10px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                >
                  恢复默认样例
                </button>
              </label>

              {/* Specific inputs per task */}
              {currentTaskConfig.id === 'task_zero_shot' ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] text-stone-500">待分类文本:</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.text || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), text: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500">候选标签 (逗号分隔):</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.labels || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), labels: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              ) : currentTaskConfig.id === 'task_sentence_sim' ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] text-stone-500">源句子 (基准句):</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.source || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), source: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500">比对句子列表 (每行一句):</span>
                    <textarea
                      rows={3}
                      value={taskInputs[currentTaskConfig.id]?.sentences || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), sentences: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              ) : currentTaskConfig.id === 'task_qa' ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] text-stone-500">提问 (Question):</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.question || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), question: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500">背景段落 (Context):</span>
                    <textarea
                      rows={3}
                      value={taskInputs[currentTaskConfig.id]?.context || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), context: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              ) : currentTaskConfig.id === 'task_zero_shot_image' ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] text-stone-500">图片 URL (公开可访问图像):</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.image || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), image: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500">候选分类标签 (逗号分隔):</span>
                    <input
                      type="text"
                      value={taskInputs[currentTaskConfig.id]?.labels || ''}
                      onChange={(e) => setTaskInputs(prev => ({
                        ...prev,
                        [currentTaskConfig.id]: { ...(prev[currentTaskConfig.id] || {}), labels: e.target.value }
                      }))}
                      className="w-full mt-1 rounded-xl border border-stone-300 px-3.5 py-2 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={3}
                    value={typeof taskInputs[currentTaskConfig.id] === 'string' ? taskInputs[currentTaskConfig.id] : JSON.stringify(taskInputs[currentTaskConfig.id])}
                    onChange={(e) => setTaskInputs(prev => ({
                      ...prev,
                      [currentTaskConfig.id]: e.target.value
                    }))}
                    className="w-full rounded-xl border border-stone-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none leading-relaxed"
                  />
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleRunInference(currentTaskConfig)}
                  disabled={taskOutputs[currentTaskConfig.id]?.loading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {taskOutputs[currentTaskConfig.id]?.loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在执行推理...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 fill-white" />
                      <span>运行推理任务</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Inference Output Display */}
            {taskOutputs[currentTaskConfig.id] && (
              <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 text-stone-100 font-mono text-xs space-y-2 animate-fade-in shadow-xs">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2 text-[10px] text-stone-400">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>推理输出结果</span>
                  </span>
                  {taskOutputs[currentTaskConfig.id].duration && (
                    <span className="text-emerald-400 font-bold">
                      耗时: {taskOutputs[currentTaskConfig.id].duration}ms
                    </span>
                  )}
                </div>

                {taskOutputs[currentTaskConfig.id].loading && (
                  <div className="py-6 text-center text-amber-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在连接 Hugging Face 端点推理模型...</span>
                  </div>
                )}

                {taskOutputs[currentTaskConfig.id].error && (
                  <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-300 text-xs leading-relaxed">
                    <strong>执行失败：</strong> {taskOutputs[currentTaskConfig.id].error}
                  </div>
                )}

                {taskOutputs[currentTaskConfig.id].result && (
                  <div className="space-y-2 pt-1 max-h-[260px] overflow-y-auto">
                    {/* Render specific friendly view for tasks */}
                    {Array.isArray(taskOutputs[currentTaskConfig.id].result) ? (
                      <div className="space-y-1.5">
                        {taskOutputs[currentTaskConfig.id].result.flat().map((item: any, idx: number) => {
                          if (typeof item === 'number') {
                            return (
                              <div key={idx} className="flex justify-between items-center bg-stone-800/60 px-3 py-1.5 rounded-lg">
                                <span>对比项 #{idx + 1} 相似度：</span>
                                <span className="font-bold text-amber-300">{(item * 100).toFixed(2)}% ({item.toFixed(4)})</span>
                              </div>
                            );
                          }
                          if (item && item.label && typeof item.score === 'number') {
                            return (
                              <div key={idx} className="flex justify-between items-center bg-stone-800/60 px-3 py-1.5 rounded-lg">
                                <span className="font-bold text-stone-200">{item.label}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-stone-700 h-2 rounded-full overflow-hidden">
                                    <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.round(item.score * 100)}%` }} />
                                  </div>
                                  <span className="font-bold text-amber-300 text-[11px]">{(item.score * 100).toFixed(2)}%</span>
                                </div>
                              </div>
                            );
                          }
                          if (item && item.token_str) {
                            return (
                              <div key={idx} className="flex justify-between items-center bg-stone-800/60 px-3 py-1.5 rounded-lg">
                                <span>预测词：<strong className="text-amber-300 font-bold">{item.token_str}</strong> (完整: {item.sequence})</span>
                                <span className="text-emerald-400 font-bold">{(item.score * 100).toFixed(2)}%</span>
                              </div>
                            );
                          }
                          if (item && item.summary_text) {
                            return (
                              <div key={idx} className="p-3 bg-stone-800/60 rounded-lg space-y-1">
                                <span className="text-stone-400 text-[10px]">精炼摘要：</span>
                                <p className="text-stone-200 leading-relaxed font-sans">{item.summary_text}</p>
                              </div>
                            );
                          }
                          if (item && item.translation_text) {
                            return (
                              <div key={idx} className="p-3 bg-stone-800/60 rounded-lg space-y-1">
                                <span className="text-stone-400 text-[10px]">译文结果：</span>
                                <p className="text-emerald-300 text-sm font-bold font-sans">{item.translation_text}</p>
                              </div>
                            );
                          }
                          if (item && (item.entity_group || item.entity)) {
                            return (
                              <div key={idx} className="flex justify-between items-center bg-stone-800/60 px-3 py-1.5 rounded-lg">
                                <span>实体: <strong className="text-amber-300">{item.word}</strong> ({item.entity_group || item.entity})</span>
                                <span className="text-emerald-400">{(item.score * 100).toFixed(2)}%</span>
                              </div>
                            );
                          }
                          return (
                            <pre key={idx} className="text-[11px] text-stone-300 whitespace-pre-wrap">
                              {JSON.stringify(item, null, 2)}
                            </pre>
                          );
                        })}
                      </div>
                    ) : typeof taskOutputs[currentTaskConfig.id].result === 'object' ? (
                      <div className="space-y-1.5">
                        {taskOutputs[currentTaskConfig.id].result.answer && (
                          <div className="p-3 bg-stone-800/80 rounded-xl space-y-1 border border-amber-500/30">
                            <span className="text-stone-400 text-[10px]">提取出的答案 (Answer)：</span>
                            <div className="text-amber-300 text-sm font-bold font-sans">
                              {taskOutputs[currentTaskConfig.id].result.answer}
                            </div>
                            <div className="text-[10px] text-stone-400">
                              置信度: {(taskOutputs[currentTaskConfig.id].result.score * 100).toFixed(2)}%
                            </div>
                          </div>
                        )}
                        {taskOutputs[currentTaskConfig.id].result.labels && (
                          <div className="space-y-1">
                            {taskOutputs[currentTaskConfig.id].result.labels.map((lbl: string, i: number) => {
                              const score = taskOutputs[currentTaskConfig.id].result.scores?.[i] || 0;
                              return (
                                <div key={lbl} className="flex justify-between items-center bg-stone-800/60 px-3 py-1.5 rounded-lg">
                                  <span className="text-stone-200">{lbl}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 bg-stone-700 h-2 rounded-full overflow-hidden">
                                      <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.round(score * 100)}%` }} />
                                    </div>
                                    <span className="font-bold text-amber-300 text-[11px]">{(score * 100).toFixed(2)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {taskOutputs[currentTaskConfig.id].text && (
                          <div className="p-3 bg-stone-800/60 rounded-lg space-y-1">
                            <span className="text-stone-400 text-[10px]">生成回复：</span>
                            <p className="text-stone-200 leading-relaxed font-sans select-text">
                              {taskOutputs[currentTaskConfig.id].text}
                            </p>
                          </div>
                        )}
                        {!taskOutputs[currentTaskConfig.id].result.answer &&
                         !taskOutputs[currentTaskConfig.id].result.labels &&
                         !taskOutputs[currentTaskConfig.id].text && (
                          <pre className="text-[11px] text-stone-300 whitespace-pre-wrap">
                            {JSON.stringify(taskOutputs[currentTaskConfig.id].result, null, 2)}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <p className="text-stone-200">{String(taskOutputs[currentTaskConfig.id].result)}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
