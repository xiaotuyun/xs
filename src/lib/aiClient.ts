export interface AiConfigParams {
  apiKey: string;
  model: string;
  customListUrl?: string;
  customBaseUrl?: string;
  useChatCompletions?: boolean;
}

export async function fetchEnvConfig() {
  try {
    const res = await fetch('/api/ai/env-config');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch {}
  return null;
}

export async function apiFetchModels(params: {
  apiKey: string;
  customListUrl?: string;
  customBaseUrl?: string;
}): Promise<{ success: boolean; models: string[]; warning?: string; error?: string }> {
  const { apiKey, customListUrl, customBaseUrl } = params;
  if (!apiKey.trim()) {
    return { success: false, models: [], error: '请先填写并保存您的 Gemini API Key' };
  }

  // 1. 优先尝试服务端 Node /api/ai/fetch-models 接口
  try {
    const res = await fetch('/api/ai/fetch-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && typeof data.success === 'boolean') {
        return data;
      }
    }
  } catch {}

  // 2. 纯静态托管环境 (如 GitHub Pages) 自动退回浏览器客户端直连 API
  try {
    const activeListUrl = (customListUrl || '').trim();
    const activeBaseUrl = (customBaseUrl || '').trim();

    if (activeListUrl || activeBaseUrl) {
      let targetUrl = activeListUrl;
      if (!targetUrl && activeBaseUrl) {
        let baseUrl = activeBaseUrl.replace(/\/+$/, '');
        baseUrl = baseUrl.replace(/\/(chat\/)?completions$/, '');
        targetUrl = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;
      }
      const response = await fetch(targetUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch {
          return { success: false, models: [], error: '自定义 API 接口返回的不是有效 JSON 模型列表。' };
        }
        const rawList = data.data || data.models || data;
        if (Array.isArray(rawList)) {
          const models = rawList.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
          if (models.length > 0) {
            return { success: true, models };
          }
        }
      }
      return { success: false, models: [], error: `无法获取自定义模型列表 (响应状态: ${response.status})` };
    }

    // Direct Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.models)) {
        const models = data.models
          .map((m: any) => m.name ? m.name.replace(/^models\//, '') : '')
          .filter(Boolean);
        if (models.length > 0) {
          return { success: true, models };
        }
      }
    } else {
      const errorText = await response.text();
      let errJson: any = null;
      try { errJson = JSON.parse(errorText); } catch {}
      const errMsg = errJson?.error?.message || `Gemini API 响应状态异常 (${response.status})`;
      if (response.status === 403 || errMsg.toLowerCase().includes('permission') || errMsg.includes('PERMISSION_DENIED')) {
        return { success: false, models: [], error: `API Key 权限受限 (Permission Denied / 403): ${errMsg}` };
      }
      return { success: false, models: [], error: errMsg };
    }

    return { success: false, models: [], error: '通过该 API Key 未查询到任何可用模型。' };
  } catch (err: any) {
    return { success: false, models: [], error: err.message || '连接失败，请检查 Key 或网络。' };
  }
}

export async function apiTestModel(params: {
  apiKey: string;
  model: string;
  prompt: string;
  customBaseUrl?: string;
  useChatCompletions?: boolean;
}): Promise<{ success: boolean; response?: string; error?: string }> {
  const { apiKey, model, prompt, customBaseUrl, useChatCompletions } = params;

  // 1. 优先尝试服务端 Node /api/ai/test-model 接口
  try {
    const res = await fetch('/api/ai/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && typeof data.success === 'boolean') {
        return data;
      }
    }
  } catch {}

  // 2. 纯静态托管环境 (如 GitHub Pages) 自动退回浏览器客户端直连 API
  try {
    const activeBaseUrl = (customBaseUrl || '').trim();

    // 只有在明确设置了自定义 Base URL 且启用了 OpenAI 协议，或者使用了非 Gemini 模型且有 Base URL 时才走 OpenAI 格式
    const isGeminiKey = apiKey.trim().startsWith('AIza') || apiKey.trim().startsWith('AQ');
    const shouldUseOpenAI = (activeBaseUrl && useChatCompletions && !isGeminiKey) || (activeBaseUrl && !model.toLowerCase().includes('gemini') && !isGeminiKey);

    if (shouldUseOpenAI) {
      let url = activeBaseUrl || 'https://api.openai.com/v1';
      url = url.replace(/\/+$/, '');
      if (useChatCompletions !== false && !url.endsWith('/chat/completions')) {
        url = `${url}/chat/completions`;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });
      const text = await response.text();
      if (response.ok) {
        let data: any = null;
        try { data = JSON.parse(text); } catch {}
        const output = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
        if (output) return { success: true, response: output };
      }
      let errJson: any = null;
      try { errJson = JSON.parse(text); } catch {}
      let errMsg = errJson?.error?.message || errJson?.message || text || `API 错误 (${response.status})`;
      if (response.status === 429 || errMsg.toLowerCase().includes('resource_exhausted') || errMsg.toLowerCase().includes('quota')) {
        errMsg = '当前 AI 模型配额已用尽 (Quota Exceeded / 429 Resource Exhausted)。请点击右上角「模型/API Key」获取并选择其他可用模型，或配置您自己的可用 API Key。';
      }
      return { success: false, error: errMsg };
    }

    // Google Gemini Direct REST API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const text = await response.text();
    if (response.ok) {
      let data: any = null;
      try { data = JSON.parse(text); } catch {}
      const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (output) return { success: true, response: output };
    }
    let errJson: any = null;
    try { errJson = JSON.parse(text); } catch {}
    let errMsg = errJson?.error?.message || text || `Gemini API 响应异常 (${response.status})`;
    if (response.status === 429 || errMsg.toLowerCase().includes('resource_exhausted') || errMsg.toLowerCase().includes('quota')) {
      errMsg = '当前 AI 模型配额已用尽 (Quota Exceeded / 429 Resource Exhausted)。请点击右上角「模型/API Key」获取并选择其他可用模型，或配置您自己的可用 API Key。';
    }
    return { success: false, error: errMsg };
  } catch (err: any) {
    return { success: false, error: err.message || '网络连接超时或请求失败' };
  }
}

export async function callAiApi(path: string, payload: any): Promise<any> {
  // 1. Try server endpoint first
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data && typeof data === 'object') return data;
    }
  } catch {}

  // 2. Fallback for static hosting (GitHub Pages) or when Node.js API is unavailable
  const apiKey = localStorage.getItem('ai_novel_studio_apikey') || payload.apiKey || '';
  const model = localStorage.getItem('ai_novel_studio_model') || payload.model || '';
  const customBaseUrl = localStorage.getItem('ai_novel_studio_custom_base_url') || payload.customBaseUrl || '';
  const useChatCompletions = localStorage.getItem('ai_novel_studio_use_chat_completions') === 'true' || payload.useChatCompletions;

  if (!apiKey) {
    return { success: false, error: '当前运行在纯静态托管环境 (GitHub Pages)，请点击右上角“模型/API Key”配置您的 API Key。' };
  }

  let prompt = '';
  if (path.includes('/chat')) {
    const messages = payload.messages || [];
    const system = payload.systemInstruction ? `系统指令：${payload.systemInstruction}\n\n` : '';
    prompt = system + messages.map((m: any) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.text || m.content}`).join('\n') + '\nAI:';
  } else if (path.includes('/generate-outline')) {
    const vCount = payload.volumeCount || 3;
    const cCount = payload.chapterCount || 5;
    let specifiedStr = "";
    if (payload.title && payload.title !== "未命名小说") specifiedStr += `- 指定书名: 《${payload.title}》\n`;
    if (payload.logline) specifiedStr += `- 指定看点: ${payload.logline}\n`;
    if (payload.worldBuilding) {
      if (payload.worldBuilding.background) specifiedStr += `- 指定背景: ${payload.worldBuilding.background}\n`;
      if (payload.worldBuilding.powerSystem) specifiedStr += `- 指定力量体系: ${payload.worldBuilding.powerSystem}\n`;
      if (payload.worldBuilding.factions) specifiedStr += `- 指定势力: ${payload.worldBuilding.factions}\n`;
    }
    if (Array.isArray(payload.characters) && payload.characters.length > 0) {
      specifiedStr += `- 指定角色: ${payload.characters.map((c: any) => `【${c.name}】(${c.role}): ${c.description}`).join('; ')}\n`;
    }

    prompt = `你是一位经验丰富、畅销网文白金作家和资深主编。
请为以下小说构思完整的分卷与章节大纲：
- 书名/主题创意: ${payload.prompt || payload.title || '修仙玄幻大作'}
- 题材流派: ${payload.genre || '玄幻/修仙'}
- 目标篇幅: ${payload.targetLength || '中篇 (100万字)'}
- 文风基调: ${payload.tone || '热血爽快、节奏紧凑'}
- 命名风格: ${payload.titleStyle || '通俗白话风'}
- 要求生成分卷数量: ${vCount} 卷
- 每卷章节数量: ${cCount} 章
${specifiedStr ? `【用户指定的已有设定与规则，必须 100% 完全遵循】:\n${specifiedStr}` : ''}

【强制规则】：
1. 绝对严禁改变用户指定的主角姓名或力量体系！如用户给出了指定数据，必须 100% 原样采用！
2. 返回且仅返回严格的标准 JSON 格式数据（不要带有 markdown 外套或其它文字说明）。

JSON 数据格式必须为：
{
  "title": "精美书名",
  "logline": "核心看点一句话简介",
  "worldBuilding": {
    "background": "时代背景",
    "powerSystem": "力量体系",
    "factions": "主要势力"
  },
  "characters": [
    { "name": "主角姓名", "role": "主角", "description": "性格特点", "background": "背景" }
  ],
  "volumes": [
    {
      "volumeNumber": 1,
      "volumeTitle": "第1卷 分卷标题",
      "summary": "卷剧情概要",
      "chapters": [
        { "chapterNumber": 1, "title": "第1章 章节标题", "summary": "本章概要" }
      ]
    }
  ]
}`;
  } else if (path.includes('/extend-outline')) {
    const vCount = payload.volumeCount || 2;
    const cCount = payload.chapterCount || 5;
    const existing = payload.existingVolumes || [];
    const lastVolNum = existing.length > 0 ? Math.max(...existing.map((v: any) => v.volumeNumber || 0)) : 0;
    const totalExistingChapters = existing.reduce((acc: number, vol: any) => acc + (vol.chapters?.length || 0), 0);
    const nextChapStart = totalExistingChapters + 1;

    let charStr = "";
    if (Array.isArray(payload.characters) && payload.characters.length > 0) {
      charStr = payload.characters.map((c: any) => `【${c.name}】(${c.role})`).join(', ');
    }

    prompt = `你是一位经验丰富、畅销网文白金作家和资深主编。
请根据以下前情提要与前卷剧情，为小说《${payload.title || '小说'}》续接后续的分卷与章节剧情大纲。
- 题材流派: ${payload.genre || '玄幻/修仙'}
- 续接要求: ${payload.prompt || '顺理成章推进高潮'}
${charStr ? `- 主要角色: ${charStr}\n` : ''}- 要求生成新分卷数量: ${vCount} 个新分卷（从第 ${lastVolNum + 1} 卷开始）
- 每卷章节数量: ${cCount} 章（章节编号必须从第 ${nextChapStart} 章全局连续递增）

【强制规则】：必须 100% 保持主角与配角姓名、世界观设定一致，严禁更改主角名或世界观规则！

已有前卷结构：
${JSON.stringify(existing)}

必须返回且仅返回严格的标准 JSON 格式数据。
JSON 数据格式必须为：
{
  "newVolumes": [
    {
      "volumeNumber": ${lastVolNum + 1},
      "volumeTitle": "第${lastVolNum + 1}卷 续接标题",
      "summary": "卷剧情概要",
      "chapters": [
        { "chapterNumber": ${nextChapStart}, "title": "第${nextChapStart}章 章节标题", "summary": "本章概要" }
      ]
    }
  ]
}`;
  } else if (path.includes('/generate-chapter')) {
    let charsInfo = "";
    if (Array.isArray(payload.novelContext?.characters) && payload.novelContext.characters.length > 0) {
      charsInfo = payload.novelContext.characters.map((c: any) => `【${c.name}】(${c.role}): ${c.description}`).join('; ');
    }
    prompt = `请根据以下小说设定和上下文创作章节正文：
小说书名：《${payload.novelContext?.title}》
题材：${payload.novelContext?.genre}
${charsInfo ? `指定角色集（必须严格遵守主角及角色姓名）: ${charsInfo}\n` : ''}背景设定：${payload.novelContext?.worldBuilding?.background || ''}
力量体系：${payload.novelContext?.worldBuilding?.powerSystem || ''}
当前卷：${payload.currentVolumeTitle}
章节标题：${payload.chapterTitle}
章节摘要大纲：${payload.chapterSummary}
前文剧情回顾：${payload.previousChapterContext || '无'}
字数要求：大约 ${payload.chapterMinWords || 2000} - ${payload.chapterMaxWords || 4000} 字。

【强制最高规则】：正文必须 100% 严格采用上述指定的主角及角色姓名与人设，严禁擅自更换主角名字或捏造矛盾设定！
请直接输出流畅细腻的章节正文内容，情节生动，文笔优美。`;
  } else if (path.includes('/continue-chapter')) {
    prompt = `请根据以下前文内容续写小说章节《${payload.chapterTitle}》：
前文内容：${(payload.currentContent || '').slice(-1500)}
续写方向/要求：${payload.prompt || '顺着剧情自然续写，保持文风一致'}
字数要求：大约 ${payload.chapterMinWords || 1000} 字。
请直接输出续写的正文内容。`;
  } else if (path.includes('/polish-chapter')) {
    prompt = `请润色/扩写以下小说章节《${payload.chapterTitle}》：
原文内容：${payload.currentContent}
润色指令/要求：${payload.prompt || '优化文笔，增加细节描写'}
请直接输出润色修改后的完整正文内容。`;
  } else if (payload.prompt) {
    prompt = payload.prompt;
  } else {
    prompt = `请根据以下需求协助创作小说：\n${JSON.stringify(payload, null, 2)}`;
  }

  const testRes = await apiTestModel({
    apiKey,
    model,
    prompt,
    customBaseUrl: customBaseUrl || undefined,
    useChatCompletions,
  });

  if (testRes.success) {
    const text = testRes.response || '';
    let parsedData: any = null;
    if (path.includes('outline') || path.includes('recast')) {
      try {
        let cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
        parsedData = JSON.parse(cleanText);
      } catch (e) {
        console.warn('Failed to parse JSON from AI response in static mode:', e);
      }

      if (!parsedData || (!parsedData.volumes && !parsedData.newVolumes)) {
        // Fallback robust text parser
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const volumes: any[] = [];
        let currentVol: any = null;
        let currentChap: any = null;
        let volNum = 1;
        let chapNum = 1;

        for (const line of lines) {
          const isVolHeader = line.length < 80 && (
            /第\s*([0-9一二三四五六七八九十百]+)\s*[卷篇]/.test(line) ||
            /卷\s*([0-9一二三四五六七八九十百]+)/.test(line) ||
            /Volume\s*\d+/i.test(line)
          );

          if (isVolHeader) {
            if (currentVol) volumes.push(currentVol);
            volNum = volumes.length + 1;
            currentVol = { volumeNumber: volNum, volumeTitle: line.replace(/^[#\-*\s]+/, ''), summary: '', chapters: [] };
            currentChap = null;
            continue;
          }

          const isChapHeader = line.length < 120 && (
            /第\s*([0-9一二三四五六七八九十百]+)\s*章/.test(line) ||
            /Chapter\s*\d+/i.test(line)
          );

          if (isChapHeader) {
            if (!currentVol) {
              currentVol = { volumeNumber: 1, volumeTitle: '第一卷', summary: '', chapters: [] };
            }
            chapNum = currentVol.chapters.length + 1;
            currentChap = { chapterNumber: chapNum, title: line.replace(/^[#\-*\s]+/, ''), summary: '' };
            currentVol.chapters.push(currentChap);
            continue;
          }
          if (currentChap) {
            currentChap.summary += (currentChap.summary ? ' ' : '') + line;
          } else if (currentVol) {
            currentVol.summary += (currentVol.summary ? ' ' : '') + line;
          } else {
            currentVol = { volumeNumber: 1, volumeTitle: '第一卷 续接篇', summary: line, chapters: [] };
          }
        }
        if (currentVol) volumes.push(currentVol);
        if (volumes.length === 0) {
          volumes.push({
            volumeNumber: 1,
            volumeTitle: '第一卷 续接篇',
            summary: text.slice(0, 300),
            chapters: [{ chapterNumber: 1, title: '第1章 续接章节', summary: text.slice(0, 300) }]
          });
        }
        volumes.forEach((v, vIdx) => {
          if (!v.chapters || v.chapters.length === 0) {
            v.chapters = [{ chapterNumber: vIdx + 1, title: `第${vIdx + 1}章 章节`, summary: v.summary || '无' }];
          }
        });
        parsedData = { volumes, newVolumes: volumes };
      }
    }

    if (parsedData) {
      if (parsedData.volumes && !parsedData.newVolumes) {
        parsedData.newVolumes = parsedData.volumes;
      }
      if (parsedData.newVolumes && !parsedData.volumes) {
        parsedData.volumes = parsedData.newVolumes;
      }
    }

    return {
      success: true,
      data: parsedData || {},
      text,
      reply: text,
      content: text,
      outline: text,
      chapters: text,
      volumes: parsedData?.volumes || parsedData?.newVolumes || [],
      newVolumes: parsedData?.newVolumes || parsedData?.volumes || [],
      ...parsedData,
    };
  } else {
    return { success: false, error: testRes.error || 'AI 请求失败' };
  }
}

// Hugging Face Specific API Clients
export async function apiHfWhoami(apiKey: string): Promise<{ success: boolean; user?: { name: string; fullname?: string; email?: string; type?: string }; error?: string }> {
  if (!apiKey.trim()) {
    return { success: false, error: '请先填写 Hugging Face Token' };
  }

  // 1. Try server endpoint
  try {
    const res = await fetch('/api/ai/hf/whoami', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch {}

  // 2. Direct browser fallback
  try {
    const response = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    });
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        user: {
          name: data.name || data.username || 'User',
          fullname: data.fullname || data.name,
          email: data.email,
          type: data.type
        }
      };
    }
    return { success: false, error: `Hugging Face 鉴权状态: ${response.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || '连接 Hugging Face 失败' };
  }
}

export interface HfModelItem {
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
  private?: boolean;
  author?: string;
}

export async function apiHfModels(params: {
  apiKey?: string;
  author?: string;
  search?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
}): Promise<{ success: boolean; models: HfModelItem[]; error?: string }> {
  // 1. Try server endpoint
  try {
    const res = await fetch('/api/ai/hf/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.models)) {
        return data;
      }
    }
  } catch {}

  // 2. Direct browser fallback
  try {
    const query = new URLSearchParams();
    if (params.author) query.append('author', params.author.trim());
    if (params.search) query.append('search', params.search.trim());
    if (params.filter) query.append('filter', params.filter.trim());
    query.append('sort', params.sort || 'downloads');
    query.append('direction', params.direction || '-1');
    query.append('limit', String(params.limit || 50));

    const headers: Record<string, string> = {};
    if (params.apiKey && params.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${params.apiKey.trim()}`;
    }

    const response = await fetch(`https://huggingface.co/api/models?${query.toString()}`, { headers });
    if (response.ok) {
      const list = await response.json();
      if (Array.isArray(list)) {
        const models: HfModelItem[] = list.map((m: any) => ({
          id: m.id || m.modelId || m._id,
          downloads: m.downloads || 0,
          likes: m.likes || 0,
          pipeline_tag: m.pipeline_tag || '',
          tags: m.tags || [],
          private: Boolean(m.private),
          author: m.author || (m.id ? m.id.split('/')[0] : '')
        }));
        return { success: true, models };
      }
    }
    return { success: false, models: [], error: `获取模型响应异常 (${response.status})` };
  } catch (err: any) {
    return { success: false, models: [], error: err.message || '网络连接超时' };
  }
}

export async function apiHfInference(params: {
  apiKey?: string;
  model: string;
  task: string;
  inputs: any;
  parameters?: any;
}): Promise<{ success: boolean; result?: any; text?: string; duration?: number; error?: string }> {
  // 1. Try server endpoint
  try {
    const res = await fetch('/api/ai/hf/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    if (res.ok && data && data.success) {
      return data;
    }
    if (data && data.error) {
      return { success: false, error: data.error };
    }
  } catch {}

  // 2. Direct browser fallback
  try {
    const token = (params.apiKey || '').trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (params.task === 'chat_completion' || params.task === 'text-generation-chat') {
      const chatUrl = 'https://router.huggingface.co/v1/chat/completions';
      const messages = Array.isArray(params.inputs) ? params.inputs : [
        { role: 'user', content: typeof params.inputs === 'string' ? params.inputs : JSON.stringify(params.inputs) }
      ];
      const resp = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model,
          messages,
          max_tokens: params.parameters?.max_tokens || 200,
          temperature: params.parameters?.temperature || 0.7
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        return { success: true, result: data, text: data?.choices?.[0]?.message?.content || '' };
      }
      return { success: false, error: data?.error?.message || data?.error || `推理失败 (${resp.status})` };
    }

    const targetUrl = `https://router.huggingface.co/hf-inference/models/${params.model}`;
    const payload: any = { inputs: params.inputs };
    if (params.parameters) payload.parameters = params.parameters;

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (resp.ok) {
      return { success: true, result: data };
    }
    return { success: false, error: data?.error || data?.message || `推理接口错误 (${resp.status})` };
  } catch (err: any) {
    return { success: false, error: err.message || '请求 Hugging Face 推理失败' };
  }
}


