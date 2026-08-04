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
}): Promise<{ success: boolean; models: string[]; error?: string }> {
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
      return { success: false, models: [], error: errJson?.error?.message || `Gemini API 响应状态异常 (${response.status})` };
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
      return { success: false, error: errJson?.error?.message || errJson?.message || text || `API 错误 (${response.status})` };
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
    return { success: false, error: errJson?.error?.message || text || `Gemini API 响应异常 (${response.status})` };
  } catch (err: any) {
    return { success: false, error: err.message || '网络连接超时或请求失败' };
  }
}
