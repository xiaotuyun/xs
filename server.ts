import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import JSZip from 'jszip';
import { spawn, ChildProcess } from "child_process";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PROXY_URL = "http://localhost:5000";

app.use(express.json({ limit: "5mb" }));

let pythonProcess: ChildProcess | null = null;

async function checkProxyHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PROXY_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startPythonProxy() {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    try {
      pythonProcess = spawn("python", ["gemini_proxy.py"], {
        env: { ...process.env },
        stdio: "ignore",
      });
      
      pythonProcess.on("error", () => {
        console.log("[Proxy] Python executable not found in container, using built-in Node.js API client.");
        pythonProcess = null;
        finish();
      });
      
      pythonProcess.on("exit", () => {
        pythonProcess = null;
        finish();
      });
      
      const checkInterval = setInterval(async () => {
        if (!pythonProcess) {
          clearInterval(checkInterval);
          finish();
          return;
        }
        const isReady = await checkProxyHealth();
        if (isReady) {
          clearInterval(checkInterval);
          console.log("[Proxy] Python proxy is ready");
          finish();
        }
      }, 300);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        finish();
      }, 1500);
    } catch {
      pythonProcess = null;
      finish();
    }
  });
}

async function callProxy(endpoint: string, data: any) {
  const isHealthy = await checkProxyHealth();
  if (!isHealthy) {
    console.log("[Proxy] Python proxy not ready, starting...");
    await startPythonProxy();
  }
  
  const response = await fetch(`${PROXY_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return await response.json();
}

async function fetchModelsList(apiKey?: string, customListUrl?: string, customBaseUrl?: string): Promise<string[]> {
  const keysToTry: string[] = [];
  if (apiKey && apiKey.trim()) keysToTry.push(apiKey.trim());
  if (process.env.CUSTOM_API_KEY && process.env.CUSTOM_API_KEY.trim() && !keysToTry.includes(process.env.CUSTOM_API_KEY.trim())) {
    keysToTry.push(process.env.CUSTOM_API_KEY.trim());
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() && !keysToTry.includes(process.env.GEMINI_API_KEY.trim())) {
    keysToTry.push(process.env.GEMINI_API_KEY.trim());
  }

  const activeListUrl = (customListUrl || process.env.CUSTOM_LIST_URL || "").trim();
  const activeBaseUrl = (customBaseUrl || process.env.CUSTOM_BASE_URL || "").trim();

  for (let i = 0; i < keysToTry.length; i++) {
    const activeKey = keysToTry[i];

    // Mode 1: Custom List URL or Custom Base URL
    if (activeListUrl || activeBaseUrl) {
      try {
        let targetUrl = activeListUrl;
        if (!targetUrl && activeBaseUrl) {
          let baseUrl = activeBaseUrl.replace(/\/+$/, '');
          baseUrl = baseUrl.replace(/\/(chat\/)?completions$/, '');
          if (!baseUrl.endsWith('/models')) {
            targetUrl = `${baseUrl}/models`;
          } else {
            targetUrl = baseUrl;
          }
        }
        console.log(`[FetchModels] Attempting custom URL: ${targetUrl} (key candidate ${i + 1}/${keysToTry.length})`);
        const response = await fetch(targetUrl, {
          headers: {
            "Authorization": `Bearer ${activeKey}`,
            "Content-Type": "application/json"
          }
        });
        if (response.ok) {
          const text = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch (err) {
            console.warn(`[FetchModels] Custom URL returned non-JSON response starting with: ${text.slice(0, 80)}`);
          }
          if (data) {
            const rawList = data.data || data.models || data;
            if (Array.isArray(rawList)) {
              const models = rawList.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
              if (models.length > 0) {
                console.log(`[FetchModels] Fetched ${models.length} models from custom URL`);
                return models;
              }
            }
          }
        } else {
          console.warn(`[FetchModels] Custom URL response status: ${response.status}`);
        }
      } catch (e) {
        console.warn("[FetchModels] Custom URL fetch error:", e);
      }
      // If custom URL was specified, don't fallback to standard Gemini REST API
      if (i === keysToTry.length - 1) return [];
      continue;
    }

    // Mode 2: Python Proxy (if running)
    try {
      const isHealthy = await checkProxyHealth();
      if (isHealthy) {
        const result = await callProxy("/api/models/list", { api_key: activeKey });
        if (result && result.success && Array.isArray(result.models) && result.models.length > 0) {
          console.log(`[FetchModels] Fetched ${result.models.length} models from Python proxy`);
          return result.models;
        }
      }
    } catch (error) {
      console.warn("[FetchModels] Python Proxy fetch failed:", error);
    }

    // Mode 3: Direct Google Gemini REST API (Node.js fetch)
    try {
      console.log(`[FetchModels] Attempting direct Google Gemini REST API (key candidate ${i + 1}/${keysToTry.length})...`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.models)) {
          const models = data.models
            .map((m: any) => m.name ? m.name.replace(/^models\//, '') : '')
            .filter(Boolean);
          if (models.length > 0) {
            console.log(`[FetchModels] Fetched ${models.length} models directly from Gemini API`);
            return models;
          }
        }
      } else {
        console.warn(`[FetchModels] Direct Gemini API status: ${response.status}`);
      }
    } catch (error) {
      console.warn("[FetchModels] Direct Gemini API fetch error:", error);
    }
  }

  return [];
}

function extractTextFromResponse(data: any): string | null {
  if (!data) return null;

  // 1. Check choices array (OpenAI format)
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const firstChoice = data.choices[0];
    
    // message content
    const msgContent = firstChoice?.message?.content;
    if (typeof msgContent === 'string' && msgContent.trim()) {
      return msgContent;
    }
    if (Array.isArray(msgContent)) {
      const joined = msgContent.map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        return '';
      }).join('').trim();
      if (joined) return joined;
    }
    if (msgContent && typeof msgContent === 'object') {
      if (typeof msgContent.text === 'string' && msgContent.text.trim()) return msgContent.text;
    }

    // delta content (streaming format)
    const deltaContent = firstChoice?.delta?.content;
    if (typeof deltaContent === 'string' && deltaContent.trim()) return deltaContent;
    if (Array.isArray(deltaContent)) {
      const joined = deltaContent.map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        return '';
      }).join('').trim();
      if (joined) return joined;
    }
    if (deltaContent && typeof deltaContent === 'object') {
      if (typeof deltaContent.text === 'string' && deltaContent.text.trim()) return deltaContent.text;
    }

    // text field on choice (legacy completions API)
    if (typeof firstChoice?.text === 'string' && firstChoice.text.trim()) {
      return firstChoice.text;
    }
  }

  // 2. Check candidates array (Gemini REST format)
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    const parts = data.candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((p: any) => p?.text || '').join('').trim();
      if (text) return text;
    }
  }

  // 3. Fallback direct top-level fields
  if (typeof data.response === 'string' && data.response.trim()) return data.response;
  if (typeof data.text === 'string' && data.text.trim()) return data.text;
  if (typeof data.content === 'string' && data.content.trim()) return data.content;

  return null;
}

function getEffectiveAiConfig(body: any = {}) {
  const apiKey = (body.apiKey || process.env.CUSTOM_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const customBaseUrl = (body.customBaseUrl || process.env.CUSTOM_BASE_URL || "").trim();
  const customListUrl = (body.customListUrl || process.env.CUSTOM_LIST_URL || "").trim();
  const model = (body.model || process.env.DEFAULT_MODEL || process.env.MODEL || "").trim();
  const useChatCompletions = body.useChatCompletions !== undefined 
    ? body.useChatCompletions 
    : (process.env.USE_CHAT_COMPLETIONS !== "false");

  return { apiKey, customBaseUrl, customListUrl, model, useChatCompletions };
}

function countPureWords(text: string | null | undefined): number {
  if (!text) return 0;
  const matches = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
}

function trimTextToWordRange(text: string, minW: number, maxW: number): string {
  if (!text) return text;
  const targetMin = Math.max(0, minW);
  const targetMax = Math.max(targetMin, maxW);
  const totalPure = countPureWords(text);

  // 如果总字数未超过设定上限，直接返回
  if (totalPure <= targetMax) {
    return text;
  }

  // 超过上限时，按段落和句子精细截断，确保上限绝对不超过 targetMax
  const rawParas = text.split(/\r?\n+/);
  let accumulatedParas: string[] = [];
  let currentPure = 0;

  for (let i = 0; i < rawParas.length; i++) {
    const para = rawParas[i].trim();
    if (!para) continue;
    const paraPure = countPureWords(para);

    // 能完整装下本段落且不超上限
    if (currentPure + paraPure <= targetMax) {
      accumulatedParas.push(para);
      currentPure += paraPure;
      // 如果当前字数已达标保底 (>= targetMin)，且下一段加上去会超上限，在段落末尾自然优雅完闭！
      if (currentPure >= targetMin) {
        const nextPara = rawParas[i + 1]?.trim();
        if (nextPara && (currentPure + countPureWords(nextPara) > targetMax)) {
          break;
        }
      }
    } else {
      // 加上整个段落会超出上限 targetMax。
      // 如果当前积累字数已经达到保底要求 (>= targetMin)，直接在上一段末尾优雅收尾，不多加半句！
      if (currentPure >= targetMin) {
        break;
      }

      // 否则说明当前字数还没到 targetMin，需要在本段内按句分割补充，直到到达 targetMin 或上限 targetMax
      const sentences = para.split(/(?<=[。！？!?\n])/);
      let sentenceChunk = "";
      for (const sentence of sentences) {
        if (!sentence) continue;
        const sentencePure = countPureWords(sentence);
        if (currentPure + sentencePure <= targetMax) {
          sentenceChunk += sentence;
          currentPure += sentencePure;
          if (currentPure >= targetMin) {
            break;
          }
        } else {
          break;
        }
      }
      if (sentenceChunk.trim()) {
        accumulatedParas.push(sentenceChunk.trim());
      }
      break;
    }
  }

  let result = accumulatedParas.join("\n\n").trim();
  if (!result) {
    result = text.slice(0, targetMax);
  }

  if (result && !/[。！？!?.…”’]$/.test(result)) {
    result += "。";
  }

  return result;
}

async function generateContent(
  apiKey: string,
  model: string,
  contents: string,
  temperature: number = 0.7,
  customBaseUrl?: string,
  useChatCompletions: boolean | string = true,
  maxTokens: number = 8192
): Promise<string> {
  const keysToTry: string[] = [];
  if (apiKey && apiKey.trim()) keysToTry.push(apiKey.trim());
  if (process.env.CUSTOM_API_KEY && process.env.CUSTOM_API_KEY.trim() && !keysToTry.includes(process.env.CUSTOM_API_KEY.trim())) {
    keysToTry.push(process.env.CUSTOM_API_KEY.trim());
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() && !keysToTry.includes(process.env.GEMINI_API_KEY.trim())) {
    keysToTry.push(process.env.GEMINI_API_KEY.trim());
  }

  if (keysToTry.length === 0) {
    throw new Error("未配置 API Key，请点击右上角【设置】输入有效的 API Key，或在环境变量中配置 GEMINI_API_KEY / CUSTOM_API_KEY。");
  }

  const activeBaseUrl = (customBaseUrl || process.env.CUSTOM_BASE_URL || "").trim();
  let lastError: any = null;

  for (let keyIdx = 0; keyIdx < keysToTry.length; keyIdx++) {
    const activeKey = keysToTry[keyIdx];

    // Mode 1: Custom Base URL (OpenAI-compatible / Custom Proxy)
    if (activeBaseUrl) {
      let baseUrl = activeBaseUrl.replace(/\/+$/, '');
      let targetUrl = baseUrl;

      const isChatComp = typeof useChatCompletions === 'string' 
        ? useChatCompletions !== 'false' 
        : useChatCompletions !== false;

      // Ensure OpenAI-compatible endpoints like /chat/completions
      if (!targetUrl.endsWith('/chat/completions') && !targetUrl.endsWith('/completions')) {
        if (targetUrl.endsWith('/v1') || isChatComp) {
          targetUrl = `${targetUrl}/chat/completions`;
        }
      }

      const attemptFetch = async (targetModel: string): Promise<string> => {
        console.log(`[Generate] Requesting custom base URL: ${targetUrl}, model: ${targetModel} (key candidate ${keyIdx + 1}/${keysToTry.length})`);
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            "Authorization": `Bearer ${activeKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: contents }],
            temperature: temperature,
            max_tokens: maxTokens,
            max_completion_tokens: maxTokens
          })
        });

        const resText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(resText);
        } catch (e) {
          if (!response.ok) {
            throw new Error(`自定义 API 接口返回非 JSON/HTML 响应 (${response.status})。请检查 API Base URL 是否填写正确。`);
          } else {
            throw new Error(`自定义 API 接口响应 200 OK，但返回的内容为 HTML/非 JSON 格式。请确认 Base URL 路径。`);
          }
        }

        if (response.ok) {
          const text = extractTextFromResponse(data);
          if (text) return text;
          throw new Error("自定义 API 接口成功响应，但未从返回的数据包中提取到有效的文本内容。");
        } else {
          const errMsg = data.error?.message || data.message || data.detail || `HTTP 响应状态码 ${response.status}`;
          
          if (response.status === 413) {
            throw new Error("生成内容过长，超过了当前模型的上下文限制，请尝试减少大纲内容或调整设定后再试。");
          }
          if (response.status === 429) {
            throw new Error("RATE_LIMIT");
          }

          let helpNote = '';
          if (response.status === 503 || errMsg.includes('heavy load') || errMsg.includes('无可用渠道') || errMsg.includes('503')) {
            helpNote = ' [建议：您使用的 API 代理服务商此模型当前无可用渠道或过载，请选择其他模型或稍后重试]';
          } else if (response.status === 400 || errMsg.includes('deprecated') || errMsg.includes('400')) {
            helpNote = ' [建议：此模型已被服务商弃用或不支持，请选择其他最新模型]';
          }
          const errObj = new Error(`自定义 API 接口返回错误 (${response.status}): ${errMsg}${helpNote}`);
          (errObj as any).status = response.status;
          (errObj as any).errMsg = errMsg;
          throw errObj;
        }
      };

      try {
        return await attemptFetch(model);
      } catch (primaryErr: any) {
        if (primaryErr.message === "RATE_LIMIT") {
          console.log("[Generate] Rate limit (429) hit. Retrying in 5 seconds...");
          await new Promise(r => setTimeout(r, 5000));
          return await attemptFetch(model);
        }

        console.error("[Generate] Primary model error:", primaryErr?.message);
        lastError = primaryErr;
        
        const status = primaryErr?.status;
        const rawMsg = (primaryErr?.errMsg || primaryErr?.message || '').toLowerCase();
        const isChannelError = status === 503 || status === 400 || status === 404 || 
                               rawMsg.includes('heavy load') || rawMsg.includes('无可用渠道') || 
                               rawMsg.includes('deprecated') || rawMsg.includes('not found');

        if (isChannelError) {
          const fallbackCandidates = ['gpt-4o-mini', 'gemini-2.5-flash', 'gpt-4o', 'gemini-1.5-flash', 'claude-3-5-sonnet', 'gpt-3.5-turbo'];
          for (const fallbackModel of fallbackCandidates) {
            if (fallbackModel.toLowerCase() === model.toLowerCase()) continue;
            try {
              console.log(`[Generate] Primary model '${model}' failed with 503/400 channel error. Attempting auto-fallback model '${fallbackModel}'...`);
              const fallbackText = await attemptFetch(fallbackModel);
              console.log(`[Generate] Auto-fallback model '${fallbackModel}' succeeded!`);
              return fallbackText;
            } catch (fallbackErr: any) {
              console.warn(`[Generate] Auto-fallback model '${fallbackModel}' failed: ${fallbackErr?.message}`);
            }
          }
        }

        const isKeyErr = status === 401 || rawMsg.includes('invalid api key') || rawMsg.includes('api key not valid') || rawMsg.includes('unauthorized') || rawMsg.includes('invalid_api_key');
        if (isKeyErr && keyIdx < keysToTry.length - 1) {
          console.warn(`[Generate] Key candidate ${keyIdx + 1} failed with key error. Trying fallback key candidate ${keyIdx + 2}...`);
          continue;
        }
        throw primaryErr;
      }
    }

    // Mode 2: Python Proxy (if running)
    try {
      const isHealthy = await checkProxyHealth();
      if (isHealthy) {
        const result = await callProxy("/api/generate", {
          api_key: activeKey,
          model: model,
          contents: contents,
          temperature: temperature,
        });
        if (result && result.success && typeof result.text === 'string') {
          return result.text;
        }
        if (result && result.error) {
          throw new Error(result.error);
        }
      }
    } catch (error: any) {
      console.warn("[Generate] Python Proxy failed:", error?.message);
      if (error?.message && !error.message.includes("fetch failed") && !error.message.includes("ECONNREFUSED")) {
        lastError = error;
      }
    }

    // Mode 3: Direct Google Gemini REST API
    if (model.toLowerCase().startsWith('gemini')) {
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          console.log(`[Generate] Using direct Google Gemini REST API with model ${model} (key candidate ${keyIdx + 1}/${keysToTry.length})`);
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: contents }] }],
              generationConfig: { temperature, maxOutputTokens: maxTokens }
            })
          });

          if (response.ok) {
            const data = await response.json();
            const text = extractTextFromResponse(data);
            if (text) return text;
            throw new Error("Google Gemini API 返回成功，但无文本部分。");
          } else if (response.status === 429) {
            console.log("[Generate] Rate limit (429) hit on Direct Gemini API. Retrying in 5 seconds...");
            await new Promise(r => setTimeout(r, 5000));
            continue;
          } else {
            const errJson = await response.json().catch(() => ({}));
            const errMsg = errJson.error?.message || `Google API 返回错误 (${response.status})`;
            const isKeyErr = response.status === 400 && (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('key'));
            
            if (isKeyErr && keyIdx < keysToTry.length - 1) {
              console.warn(`[Generate] Direct Gemini API key candidate ${keyIdx + 1} invalid (${errMsg}). Trying next key candidate...`);
              lastError = new Error(errMsg);
              break; // Break the attempt loop to move to the next key
            }
            throw new Error(errMsg);
          }
        }
      } catch (error: any) {
        console.error("[Generate] Direct Gemini API failed:", error?.message);
        lastError = error;
        const rawMsg = (error?.message || '').toLowerCase();
        const isKeyErr = rawMsg.includes('api key not valid') || rawMsg.includes('invalid api key') || rawMsg.includes('api_key_invalid');
        if (isKeyErr && keyIdx < keysToTry.length - 1) {
          console.warn(`[Generate] Trying next candidate key after error: ${error?.message}`);
          continue;
        }
        // Do not throw here, allow the loop to continue to next key or exhaust modes
      }
    } else {
      console.log(`[Generate] Skipping direct Google Gemini REST API for non-Gemini model: ${model}`);
    }
  }

  throw lastError || new Error("调用 AI 模型失败，请检查 API Key 配置。");
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 安全登录认证模块 (账号密码存储在服务端环境变量或服务端持久化文件，彻底避免代码中硬编码)
const AUTH_FILE_PATH = path.join(process.cwd(), '.auth_credentials.json');

function getAuthCredentials() {
  try {
    if (fs.existsSync(AUTH_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(AUTH_FILE_PATH, 'utf-8'));
      if (data.account && data.password) {
        return { account: data.account, password: data.password };
      }
    }
  } catch (e) {
    console.warn('[Auth] Read credentials file failed, fallback to env');
  }
  return {
    account: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || '12345'
  };
}

function saveAuthCredentials(account: string, password: string) {
  try {
    fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify({ account, password }), 'utf-8');
  } catch (e) {
    console.error('[Auth] Save credentials file failed:', e);
  }
}

app.post("/api/auth/login", (req, res) => {
  const { account, password } = req.body || {};
  const current = getAuthCredentials();

  if (account === current.account && password === current.password) {
    return res.json({ success: true, message: "登录成功" });
  } else {
    return res.status(401).json({ success: false, error: "账号或密码不正确，请重新输入" });
  }
});

app.post("/api/auth/change-password", (req, res) => {
  const { oldPassword, newAccount, newPassword } = req.body || {};
  const current = getAuthCredentials();

  if (oldPassword !== current.password) {
    return res.status(400).json({ success: false, error: "原密码验证不正确！" });
  }

  if (!newAccount || !newAccount.trim() || !newPassword || !newPassword.trim()) {
    return res.status(400).json({ success: false, error: "新账号和新密码不能为空！" });
  }

  saveAuthCredentials(newAccount.trim(), newPassword.trim());
  return res.json({ success: true, message: "账号和密码重置成功！请使用新凭证登录。" });
});

app.get("/api/ai/env-config", (req, res) => {
  const envKey = (process.env.CUSTOM_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  res.json({
    success: true,
    hasEnvApiKey: Boolean(envKey),
    apiKeyMasked: envKey ? (envKey.slice(0, 4) + "****" + envKey.slice(-4)) : "",
    customBaseUrl: process.env.CUSTOM_BASE_URL || "",
    customListUrl: process.env.CUSTOM_LIST_URL || "",
    defaultModel: process.env.DEFAULT_MODEL || process.env.MODEL || "",
    useChatCompletions: process.env.USE_CHAT_COMPLETIONS !== "false"
  });
});

app.post("/api/ai/test-key", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未提供 API Key，且服务端环境变量未配置 API Key" });
    }

    const models = await fetchModelsList(config.apiKey, undefined, config.customBaseUrl);
    if (models.length > 0) {
      return res.json({
        success: true,
        models: models,
      });
    }

    // If model list is empty, attempt test generation with multiple common candidate models
    const candidateModels = config.customBaseUrl 
      ? ["gpt-4o-mini", "gpt-3.5-turbo", "gemini-2.5-flash", "gemini-1.5-flash"] 
      : ["gemini-2.5-flash", "gemini-1.5-flash"];
    
    let lastErrorMsg = "";

    for (const testModel of candidateModels) {
      try {
        const testText = await generateContent(config.apiKey, testModel, "Hello", 0.1, config.customBaseUrl, config.useChatCompletions);
        if (testText) {
          return res.json({
            success: true,
            models: [],
          });
        }
      } catch (err: any) {
        lastErrorMsg = err?.message || "";
      }
    }

    throw new Error(lastErrorMsg || "API Key 验证失败，未找到可用模型");
  } catch (error: any) {
    console.error("Test key error:", error);
    return res.status(400).json({ success: false, error: error.message || "API Key 验证失败" });
  }
});

app.post("/api/ai/fetch-models", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未提供 API Key" });
    }

    const fetchedModels = await fetchModelsList(config.apiKey, config.customListUrl, config.customBaseUrl);

    if (fetchedModels.length === 0) {
      return res.json({
        success: false,
        models: [],
        error: "未通过当前 API Key 连接查找到任何可用模型。请确认 API Key 或网络代理配置。"
      });
    }

    return res.json({ success: true, models: fetchedModels });
  } catch (error: any) {
    console.error("Fetch models error:", error);
    return res.json({
      success: false,
      models: [],
      error: `获取模型列表失败: ${error.message || "网络连接错误"}`
    });
  }
});

app.post("/api/ai/test-model", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未提供 API Key" });
    }
    const testModel = config.model || req.body.model;
    if (!testModel) {
      return res.status(400).json({ success: false, error: "未选择要测试的模型，请先选择一个模型！" });
    }
    const testPrompt = req.body.prompt || "你好";

    const text = await generateContent(config.apiKey, testModel, testPrompt, 0.2, config.customBaseUrl, config.useChatCompletions);
    return res.json({ success: true, response: text || "测试成功，但返回内容为空。" });
  } catch (error: any) {
    console.error("Test model error:", error);
    return res.status(400).json({ success: false, error: error.message || "测试该模型失败" });
  }
});

app.post("/api/ai/generate-outline", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const { prompt, genre, targetLength, tone, titleStyle, volumeCount, chapterCount } = req.body;
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中定义。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }
    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;

    const parsedVolumeCount = parseInt(volumeCount, 10) || 3;
    const parsedChapterCount = parseInt(chapterCount, 10) || 5;

    const systemInstruction = `你是一位经验丰富、畅销网文白金作家和资深主编。
请根据用户的创意构思，为一部高质量的网络小说生成全面、详尽、宏大的全书大纲、世界观背景和主要角色设定。

【极其重要】：必须严格按照以下数量与编号结构生成：
- volumes (分卷): 必须生成刚好 【${parsedVolumeCount} 个分卷】，每一卷都要有分卷标题与剧情概要。
- chapters (章节): 每个分卷内必须生成刚好 【${parsedChapterCount} 个具体的章节】（包含详细的章节序号、标题和章节剧情概要）。
- **【全书章节全局递增连贯编号规范】**：全书所有分卷中的章节必须保持全局统一连贯递增编号（例如：第一卷包含第1~5章，第二卷必须接续为第6~10章，第三卷必须接续为第11~15章），严禁各个分卷单独重置为第1章或“第一章”！
- **【章节标题格式规范】**：所有章节标题统一格式为 \`第X章 标题\`（如：\`第1章 穿越异界\`、\`第6章 强敌来袭\`），严禁使用“第一章”等中文大写或单独重置！

小说流派: ${genre || "玄幻/奇幻"}
预估篇幅: ${targetLength || "中篇 (100万字)"}
文风基调: ${tone || "热血爽快、逻辑严密、节奏紧凑"}
命名风格偏好: ${titleStyle || "通俗白话风"}

【命名与标题风格规范】：
- 严格遵循用户指定的"命名风格偏好"。
- 如果是"通俗白话风 (接地气、直白叙述)"，分卷与章节标题请务必使用生动、直白、通俗易懂的大白话描述（例如：第1卷 初来乍到，发现自己是个废材；第1章 初次穿越，发现是废材；第2章 本想低调发育，却被退婚当场打脸），绝对不要使用晦涩古奥、死板套量或装腔作势的成语堆砌！
- 如果是"经典网文风 (大气、古典修真)"，则使用经典修真仙侠大气标题。
- 如果是"脑洞爽文风 (极致吸睛、快节奏)"，使用节奏飞快、直指爽点的吸睛标题。
- 如果是"轻松幽默风 (梗向、日常吐槽)"，使用幽默风趣带点梗的语言。

必须返回且仅返回严格的标准 JSON 格式数据（不要带有 markdown 外套或其它文字说明）。
JSON 数据格式必须精准符合以下 JSON 规范：
{
  "title": "根据创意推导的精美书名",
  "logline": "一句话故事核心看点与剧情梗概",
  "worldBuilding": {
    "background": "时代背景与世界格局",
    "powerSystem": "修炼/境界/力量体系设定",
    "factions": "主要势力分化与对立关系"
  },
  "characters": [
    {
      "name": "角色姓名",
      "role": "主角 / 反派 / 女主角 / 导师 / 核心配角",
      "description": "性格特点与外貌风采描述",
      "background": "身份背景与前情剧情简介"
    }
  ],
  "volumes": [
    {
      "volumeNumber": 1,
      "volumeTitle": "分卷标题",
      "summary": "本卷的核心剧情概要与高潮冲突",
      "chapters": [
        {
          "chapterNumber": 1,
          "title": "章节标题",
          "summary": "本章的剧情概要与看点"
        }
      ]
    }
  ]
}`;

    const userPrompt = `核心创意/灵感: ${prompt}`;

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    const text = await generateContent(activeKey, activeModel, contents, 0.7, customBaseUrl, useChatCompletions);
    
    let resultJson: any = {};
    try {
      let cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      resultJson = JSON.parse(cleanText);
    } catch (parseErr) {
      console.warn("JSON parse warning:", parseErr);
      resultJson = JSON.parse(text || "{}");
    }

    res.json({ success: true, data: resultJson });
  } catch (error: any) {
    console.error("Generate outline error:", error);
    res.status(400).json({ success: false, error: error.message || "大纲生成失败，请检查您的 API Key 是否有效、网络状况以及模型配额。" });
  }
});

app.post("/api/ai/extend-outline", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const {
      title,
      genre,
      logline,
      worldBuilding,
      characters,
      existingVolumes,
      prompt,
      targetLength,
      tone,
      titleStyle,
      volumeCount,
      chapterCount
    } = req.body;

    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中指定。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }

    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;
    const parsedVolumeCount = parseInt(volumeCount, 10) || 2;
    const parsedChapterCount = parseInt(chapterCount, 10) || 5;

    let historyText = "";
    if (Array.isArray(existingVolumes) && existingVolumes.length > 0) {
      historyText = existingVolumes.map((vol: any) => {
        const chapList = (vol.chapters || []).map((ch: any) => `  - 第${ch.chapterNumber}章 ${ch.title}: ${ch.summary || '无概要'}`).join('\n');
        return `第${vol.volumeNumber}卷【${vol.volumeTitle}】\n卷概要: ${vol.summary || '无'}\n章节目录:\n${chapList}`;
      }).join('\n\n');
    } else {
      historyText = "目前暂无已创建的分卷。";
    }

    const lastVolNum = Array.isArray(existingVolumes) && existingVolumes.length > 0
      ? Math.max(...existingVolumes.map((v: any) => v.volumeNumber || 0))
      : 0;

    const totalExistingChapters = Array.isArray(existingVolumes)
      ? existingVolumes.reduce((acc: number, vol: any) => acc + (vol.chapters?.length || 0), 0)
      : 0;
    const nextChapStartNum = totalExistingChapters + 1;

    const systemInstruction = `你是一位经验丰富、畅销网文白金作家和资深主编。
你的任务是根据一部已有作品的前情提要与前卷剧情，为该小说**续接后续的分卷与章节剧情大纲**。

【前情信息】:
- 书名: 《${title || "未命名小说"}》
- 流派: ${genre || "玄幻/奇幻"}
- 一句话简介: ${logline || "无"}
- 续接篇幅预估: ${targetLength || "中篇 (100万字)"}
- 文风基调: ${tone || "热血爽快、逻辑严密、节奏紧凑"}
- 命名风格偏好: ${titleStyle || "通俗白话风"}

【已有前卷剧情与目录结构】:
${historyText}

【续接生成硬性要求】:
1. 必须在剧情逻辑、人物性格、世界观上**完美继承与续接**前面的所有章节与分卷发展，不得产生剧情脱节或人物设定前后矛盾。
2. 必须生成刚好 【${parsedVolumeCount} 个新的分卷】。
3. 卷号从【第 ${lastVolNum + 1} 卷】开始依次递增。
4. **【全书章节连贯编号规范】**：全书章节必须保持全局统一连贯的递增编号！当前全书前面已有 ${totalExistingChapters} 章，续接的新章节必须从【第 ${nextChapStartNum} 章】开始依次递增！
5. **【章节标题格式规范】**：章节标题必须统一格式为 \`第X章 标题\`（如：\`第${nextChapStartNum}章 遗迹终局\`），严禁重置为“第一章”或重新从第1章开始！
6. 每个新分卷内必须生成刚好 【${parsedChapterCount} 个具体的续接章节】。
7. 命名风格严格遵循：${titleStyle || "通俗白话风 (直白接地气)"}。
8. 返回严格的 JSON 格式数据。

JSON 数据格式必须为：
{
  "newVolumes": [
    {
      "volumeNumber": ${lastVolNum + 1},
      "volumeTitle": "分卷标题",
      "summary": "本卷剧情概要",
      "chapters": [
        {
          "chapterNumber": ${nextChapStartNum},
          "title": "第${nextChapStartNum}章 章节标题",
          "summary": "本章剧情概要"
        }
      ]
    }
  ]
}`;

    const userPrompt = `续接方向/核心创意与灵感: ${prompt || "顺应前文剧情自然推演下一步高潮与冲突"}`;

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    const text = await generateContent(activeKey, activeModel, contents, 0.7, customBaseUrl, useChatCompletions);

    let resultJson: any = {};
    try {
      const cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      resultJson = JSON.parse(cleanText);
    } catch (parseErr) {
      console.warn("JSON parse warning:", parseErr);
      resultJson = JSON.parse(text || "{}");
    }

    res.json({ success: true, data: resultJson });
  } catch (error: any) {
    console.error("Extend outline error:", error);
    res.status(400).json({ success: false, error: error.message || "大纲续接失败，请检查您的 API Key 是否有效、网络状况以及模型配额。" });
  }
});

app.post("/api/ai/recast-volume", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const {
      title,
      genre,
      logline,
      worldBuilding,
      characters,
      targetVolume,
      precedingVolumesContext,
      succeedingVolumesContext,
      recastPrompt,
      chapterCount,
      tone,
      titleStyle,
    } = req.body;

    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中指定。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }

    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;
    const parsedChapterCount = parseInt(chapterCount, 10) || (targetVolume?.chapters?.length || 5);
    const startChapNum = parseInt(req.body.startChapNum, 10) || 1;

    const systemInstruction = `你是一位畅销网络小说白金作家与资深大纲编剧。
你的任务是根据作品整体设定和用户指定的精修调整指令，对【第 ${targetVolume?.volumeNumber || 1} 卷】的大纲进行**重新雕琢、改写与重铸**。

【作品基本信息】:
- 书名: 《${title || "未命名小说"}》
- 流派: ${genre || "玄幻/奇幻"}
- 简介: ${logline || "无"}
- 文风基调: ${tone || "热血爽快、节奏明快"}
- 标题风格: ${titleStyle || "通俗白话风"}

【前卷剧情背景（承接参考）】:
${precedingVolumesContext || "无前卷或本卷为第一卷"}

【后卷剧情背景（后文脉络）】:
${succeedingVolumesContext || "无后卷"}

【待重铸的原本卷大纲】:
卷号: 第 ${targetVolume?.volumeNumber || 1} 卷
原本卷标题: ${targetVolume?.volumeTitle || "旧卷"}
原本卷概要: ${targetVolume?.summary || "无"}

【重铸修改硬性要求】:
1. 根据用户的重铸要求，全方位重新设计第 ${targetVolume?.volumeNumber || 1} 卷的【卷标题】、【卷剧情概要】以及卷内 【${parsedChapterCount} 个具体的章节】（标题与章节大纲）。
2. **【全书章节连贯编号规范】**：本卷章节在全书中属于【第 ${startChapNum} 章】至【第 ${startChapNum + parsedChapterCount - 1} 章】。
3. **【章节标题与编号格式】**：章节标题必须统一格式为 \`第X章 标题\`（如：\`第${startChapNum}章 标题\`），\`chapterNumber\` 字段必须从 ${startChapNum} 依次递增至 ${startChapNum + parsedChapterCount - 1}，严禁重置为“第一章”！
4. 必须保证与前卷剧情、后卷脉络逻辑连贯，承上启下，高潮迭起，充满看点。
5. 章节数量必须刚好为 【${parsedChapterCount} 个章节】。
6. 格式必须为严谨的 JSON 格式。

JSON 输出格式样例：
{
  "volumeTitle": "重铸后的新卷标题",
  "summary": "重铸后的精细卷剧情概要",
  "chapters": [
    {
      "chapterNumber": ${startChapNum},
      "title": "第${startChapNum}章 重铸后的章节标题",
      "summary": "重铸后的章节剧情大纲与精彩看点"
    }
  ]
}`;

    const userPrompt = `重铸方向 / 用户精修修改指令: ${recastPrompt || "重新梳理本卷大纲，增强冲突与剧情节奏，精细化各个章节大纲"}`;

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    const text = await generateContent(activeKey, activeModel, contents, 0.7, customBaseUrl, useChatCompletions);

    let resultJson: any = {};
    try {
      let cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      resultJson = JSON.parse(cleanText);
    } catch (parseErr) {
      console.warn("JSON parse warning:", parseErr);
      resultJson = JSON.parse(text || "{}");
    }

    res.json({ success: true, data: resultJson });
  } catch (error: any) {
    console.error("Recast volume error:", error);
    res.status(400).json({ success: false, error: error.message || "重铸分卷大纲失败，请重试。" });
  }
});

app.post("/api/ai/generate-chapter", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const { novelContext, chapterTitle, chapterSummary, tone, chapterMinWords, chapterMaxWords, previousChapterContext, currentVolumeTitle } = req.body;
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中指定。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }
    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;

    const parsedMin = parseInt(chapterMinWords, 10);
    const parsedMax = parseInt(chapterMaxWords, 10);
    const minW = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 2000;
    const maxW = !isNaN(parsedMax) && parsedMax > 0 ? parsedMax : 3000;

    let prevContextPrompt = "";
    if (previousChapterContext && previousChapterContext.prevContentSnippet) {
      prevContextPrompt = `\n【前一章节/上一分卷末尾承接参考】：
上一章信息: ${previousChapterContext.prevVolumeTitle ? `《${previousChapterContext.prevVolumeTitle}》` : ''}第${previousChapterContext.prevChapterNumber}章《${previousChapterContext.prevChapterTitle}》
上一章结尾正文片段:
---
${previousChapterContext.prevContentSnippet}
---
【剧情承接硬性要求】：本章为 ${currentVolumeTitle ? `分卷《${currentVolumeTitle}》` : '新章节'}，请务必紧扣并自然接续上一章/上一分卷结尾的剧情脉络、人物状态与未尽伏笔，实现无缝剧情过渡！\n`;
    }

    const wordRequirementPrompt = `【极其重要的字数硬性控制（目标：${minW} - ${maxW} 字）】：
本章纯字数必须严格控制在 **${minW} 至 ${maxW} 字之间**（最佳目标约 ${Math.round((minW + maxW)/2)} 字）。
1. 不得少于 ${minW} 字，但也绝对不能超出 ${maxW} 字！请根据目标字数合理掌控叙事节奏与场景细节。
2. 请在达到 ${minW}~${maxW} 字区间时自然收尾完成本章，切勿冗长拉长或严重超字数。`;

    const systemInstruction = `你是一位顶尖的畅销网络小说白金作家，擅长创作画面感强、细节丰富、节奏抓人、张力十足的章节。

小说基本信息:
书名: ${novelContext?.title || "未知小说"}
流派: ${novelContext?.genre || "奇幻"}
背景设定: ${novelContext?.worldBuilding?.background || ""}
力量体系: ${novelContext?.worldBuilding?.powerSystem || ""}
文风基调: ${tone || "细腻生动、注重对话和动作描写、拒绝水字数、高潮迭起"}
${prevContextPrompt}
${wordRequirementPrompt}

返回纯文本正文内容（无需 markdown 代码块包裹，直接输出小说正文）。`;

    const userPrompt = `待写章节: ${chapterTitle}
${currentVolumeTitle ? `所属分卷: ${currentVolumeTitle}\n` : ''}本章剧情大纲: ${chapterSummary}

请以高水准的网文文采，紧接前文剧情与伏笔，开始创作本章正文：`;

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    const tokenCap = Math.min(8192, Math.max(3500, Math.floor(maxW * 2.5)));
    let text = await generateContent(activeKey, activeModel, contents, 0.8, customBaseUrl, useChatCompletions, tokenCap);
    text = (text || "").replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();

    // Auto-continuation loop if initial word count is below required minimum
    let fullContent = text;
    let currentWords = countPureWords(fullContent);
    let loopCount = 0;
    const maxLoops = 3;

    while (currentWords < minW && loopCount < maxLoops) {
      loopCount++;
      console.log(`[Generate Chapter] Word count (${currentWords}) < target minWords (${minW}). Initiating auto-continuation pass ${loopCount}...`);
      
      const remainNeeded = minW - currentWords;
      const continuePrompt = `你正在撰写网络小说《${novelContext?.title || "小说"}》章节《${chapterTitle}》。
本章大纲：${chapterSummary}

【前文内容】（当前已完成纯字数：${currentWords}字，距离最低字数目标 ${minW}字 还差 ${remainNeeded}字）：
---
${fullContent.slice(-1800)}
---

【续写指令】：
当前章节字数尚未达到设定的最低字数要求（${minW}字）。请从前文末尾**无缝紧接创作**，继续深入推进情节！
1. 顺应前文情节推演，展开接下来的高潮细节、场景互动、人物心理、动作描写与多轮对话。
2. 严禁重复前文已写的语句。
3. 保持与前文完全一致的文风与基调。
4. 本次续写只需增加约 ${remainNeeded + 100} 字正文达标即可，切勿长篇大论超字数。
5. 直接输出续写正文，不要包含任何额外开场白或 markdown 标记：`;

      const piece = await generateContent(activeKey, activeModel, continuePrompt, 0.8, customBaseUrl, useChatCompletions, Math.max(1500, Math.floor((maxW - currentWords) * 2.2)));
      if (piece && piece.trim()) {
        const cleanPiece = piece.replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();
        fullContent += "\n\n" + cleanPiece;
        const newWordCount = countPureWords(fullContent);
        if (newWordCount <= currentWords) break;
        currentWords = newWordCount;
      } else {
        break;
      }
    }

    if (countPureWords(fullContent) > maxW) {
      fullContent = trimTextToWordRange(fullContent, minW, maxW);
    }
    res.json({ success: true, content: fullContent });
  } catch (error: any) {
    console.error("Generate chapter error:", error);
    res.status(400).json({ success: false, error: error.message || "AI 生成章节正文失败，请检查您的 API Key 是否有效以及模型是否畅通。" });
  }
});

app.post("/api/ai/continue-chapter", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const { currentText, chapterSummary, novelContext, chapterMinWords, chapterMaxWords, previousChapterContext, currentVolumeTitle } = req.body;
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中指定。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }
    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;

    const parsedMin = parseInt(chapterMinWords, 10);
    const parsedMax = parseInt(chapterMaxWords, 10);
    const minW = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 2000;
    const maxW = !isNaN(parsedMax) && parsedMax > 0 ? parsedMax : 3000;
    const existingWords = countPureWords(currentText);

    if (existingWords >= maxW) {
      return res.status(400).json({
        success: false,
        error: `当前章节字数（${existingWords}字）已达到设定的建议上限（${maxW}字）。如需增加更多字数，请先调高【建议上限字数】。`
      });
    }

    const maxAllowedNew = maxW - existingWords;
    const targetContinueWords = existingWords < minW 
      ? Math.min(maxAllowedNew, Math.max(1000, minW - existingWords))
      : Math.min(maxAllowedNew, 1200);

    const trimmedText = (currentText || "").trim();
    const systemInstruction = `你是一位顶尖网文作家，正在续写当前章节。
小说书名: 《${novelContext?.title || "未知小说"}》
${currentVolumeTitle ? `所属分卷: 《${currentVolumeTitle}》\n` : ''}本章大纲: ${chapterSummary || "无"}

【绝对遵守的格式与剧情规范】：
1. 必须只输出小说正文内容！严禁输出任何“好的”、“由于缺少前文...”等废话。
2. 保持前文的语气、文风和人物性格，从前文末尾**无缝自然接续创作**。
3. 本次续写纯字数请写约 **${targetContinueWords} 字**（上限绝对不超过 ${maxAllowedNew} 字）。
4. 直接输出小说正文，不要包含 markdown 代码块。`;

    let userPrompt = "";
    if (trimmedText) {
      userPrompt = `目前已写的内容末尾片段（请从此处无缝接续写下去）：
---
${trimmedText.slice(-1800)}
---
请紧接着上文继续创作正文：`;
    } else if (previousChapterContext && previousChapterContext.prevContentSnippet) {
      userPrompt = `当前章节正文尚为空白，但前一章（${previousChapterContext.prevVolumeTitle ? `《${previousChapterContext.prevVolumeTitle}》` : ''}第${previousChapterContext.prevChapterNumber}章《${previousChapterContext.prevChapterTitle}》）已完成。
前一章末尾正文片段：
---
${previousChapterContext.prevContentSnippet}
---
本章剧情大纲：${chapterSummary || "暂无大纲"}

【跨卷/跨章接续指令】：请严密接续上一章/上一分卷结尾的剧情发展与伏笔，从头开始创作本章（${currentVolumeTitle ? `《${currentVolumeTitle}》` : ''}）的正文：`;
    } else {
      userPrompt = `当前章节尚未填写前文，请直接根据本章大纲《${chapterSummary || "本章大纲"}》从头开始创作本章的正文内容：`;
    }

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    const tokenCap = Math.min(8192, Math.max(2500, Math.floor(maxAllowedNew * 2.5)));
    let text = await generateContent(activeKey, activeModel, contents, 0.8, customBaseUrl, useChatCompletions, tokenCap);
    text = (text || "").replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();

    let combined = trimmedText ? trimmedText + "\n\n" + text : text;
    if (countPureWords(combined) > maxW) {
      combined = trimTextToWordRange(combined, minW, maxW);
    }

    let newAppended = text;
    if (trimmedText && combined.startsWith(trimmedText)) {
      newAppended = combined.slice(trimmedText.length).trim();
    } else if (trimmedText) {
      newAppended = combined;
    }

    res.json({ success: true, content: newAppended || "" });
  } catch (error: any) {
    console.error("Continue chapter error:", error);
    res.status(400).json({ success: false, error: error.message || "AI 续写章节失败，请检查您的 API Key 是否有效以及模型是否畅通。" });
  }
});

app.post("/api/ai/polish-chapter", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const { currentText, instruction, chapterMinWords, chapterMaxWords, novelContext } = req.body;
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key，请先在右上角【设置】进行配置或在环境变量中指定。" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未选择模型，请先在右上角【设置】选择一个模型。" });
    }
    const activeKey = config.apiKey;
    const activeModel = config.model;
    const customBaseUrl = config.customBaseUrl;
    const useChatCompletions = config.useChatCompletions;

    const parsedMin = parseInt(chapterMinWords, 10);
    const parsedMax = parseInt(chapterMaxWords, 10);
    const minW = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 1000;
    const maxW = !isNaN(parsedMax) && parsedMax > 0 ? parsedMax : 1500;

    const systemInstruction = `你是一位资深网文主编和顶级文学修辞大师，擅长正文润色、文风升级与剧情细节雕琢。
小说信息:
书名: 《${novelContext?.title || "未知小说"}》
流派: ${novelContext?.genre || "奇幻"}
基调: ${novelContext?.tone || "热血爽快、逻辑严密、节奏紧凑"}

【润色与字数核心标准】：
1. 完整保留原文的核心剧情发展、主要对话与关键事件，不得遗漏关键转折或随意改动剧情主线。
2. 字数限制要求：润色优化后的完整章节正文，其纯字数（仅计算汉字、英文字母及数字，不含标点符号与空白符）必须**绝对大于或等于 ${minW} 字**（目标 ${minW} 到 ${maxW} 字）。
3. 若原文篇幅较短或未达 ${minW} 字标准：
   - 必须通过拓展多视角的环境描写、气氛熏陶、人物微表情、心理活动与感官细节来精细扩充。
   - 增加生动自然的人物多轮对话互动，展现冲突张力与动作细节。
   - 严禁机械重复或填充毫无意义的废话水字数，要通过全方位立体化的精细打磨充实篇幅。
4. 绝对禁止在字数未达到 ${minW} 字时提前草草结尾。

牢记：生成的纯字数少于 ${minW} 字是严重的失职！请务必细致入微地描写打磨，确保字数与质量全面达标。
请直接输出润色优化后的完整正文（无需 markdown 代码块包裹）。`;

    const userPrompt = `润色要求指令: ${instruction || "增强代入感与场面感，使描写更加细腻流畅，提升文采与动作对话张力"}
原文正文内容:
---
${currentText || ""}
---
请开始输出润色优化后的完整章节正文：`;

    const contents = `${systemInstruction}\n\n${userPrompt}`;
    let text = await generateContent(activeKey, activeModel, contents, 0.75, customBaseUrl, useChatCompletions, 8192);
    text = (text || "").replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();

    // Auto-continuation/expansion loop if polished text is below minW
    let fullContent = text;
    let currentWords = countPureWords(fullContent);
    let loopCount = 0;
    const maxLoops = 3;

    while (currentWords < minW && loopCount < maxLoops) {
      loopCount++;
      console.log(`[Polish Chapter] Word count (${currentWords}) < minWords (${minW}). Initiating expansion pass ${loopCount}...`);
      
      const remainNeeded = minW - currentWords;
      const expandPrompt = `你正在润色扩写网络小说《${novelContext?.title || "小说"}》章节正文。
用户要求的润色指令：${instruction || "细化描写与增强张力"}

【当前已润色的正文】（纯字数：${currentWords}字，距离设定最低字数 ${minW}字 还差 ${remainNeeded}字）：
---
${fullContent}
---

【扩写与打磨强指令】：
当前字数尚未达到设定的最低字数要求（${minW}字）。
请对上述正文进行【深入细节扩充与全方位细化】：
1. 深入扩展每一个主要场景的宏大氛围描写、光影细节与环境冲击。
2. 丰富人物心理活动、五感体验与言谈神情细节。
3. 增加更多有张力的人物交锋对话与微动作。
4. 保持剧情脉络不变，将正文拓展为一篇不少于 ${minW} 字的完整高质量长章节。
5. 请直接输出扩充润色后的完整正文：`;

      const expandedPiece = await generateContent(activeKey, activeModel, expandPrompt, 0.75, customBaseUrl, useChatCompletions, 8192);
      if (expandedPiece && expandedPiece.trim()) {
        const cleanPiece = expandedPiece.replace(/^```\w*\s*/i, '').replace(/\s*```$/, '').trim();
        const newWordCount = countPureWords(cleanPiece);
        if (newWordCount > currentWords) {
          fullContent = cleanPiece;
          currentWords = newWordCount;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    fullContent = trimTextToWordRange(fullContent, minW, maxW);
    res.json({ success: true, content: fullContent });
  } catch (error: any) {
    console.error("Polish chapter error:", error);
    res.status(400).json({ success: false, error: error.message || "AI 润色失败，请检查您的 API Key 是否有效以及模型是否畅通。" });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const config = getEffectiveAiConfig(req.body);
    const { messages, systemInstruction } = req.body;
    
    if (!config.apiKey) {
      return res.status(400).json({ success: false, error: "未配置 API Key" });
    }
    if (!config.model) {
      return res.status(400).json({ success: false, error: "未指定模型" });
    }
    
    const contents = (messages || []).map((m: any) => `${m.role}: ${m.text}`).join("\n");
    const fullContents = systemInstruction ? `${systemInstruction}\n\n${contents}` : contents;
    
    const text = await generateContent(config.apiKey, config.model, fullContents, 0.7, config.customBaseUrl, config.useChatCompletions);
    
    res.json({ success: true, text });
  } catch (error: any) {
    console.error("Agent chat error:", error);
    res.status(400).json({ success: false, error: error.message || "AI 对话失败，请检查模型或 API Key。" });
  }
});

const safeResolve = (userPath: string = "") => {
  const rootPath = process.cwd();
  if (!userPath || userPath.trim() === "" || userPath.trim() === "storage") {
    const storageDir = path.join(rootPath, "storage");
    if (!fs.existsSync(storageDir)) {
      try { fs.mkdirSync(storageDir, { recursive: true }); } catch (e) {}
    }
    return storageDir;
  }
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(rootPath, normalized);
  if (!resolved.startsWith(rootPath)) {
    return rootPath;
  }
  return resolved;
};

app.get("/api/storage/list", (req, res) => {
  try {
    const userPath = String(req.query.path || "");
    const resolvedPath = safeResolve(userPath);
    const relativePath = path.relative(process.cwd(), resolvedPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: "目录不存在" });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: "指定路径不是目录" });
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    
    const folders: { name: string; path: string }[] = [];
    const files: { name: string; path: string; size: number; mtime: string }[] = [];

    for (const entry of entries) {
      const name = entry.name;
      if (
        name.startsWith(".") ||
        name === "node_modules" ||
        name === "dist" ||
        name === "coverage" ||
        name === "build" ||
        name === ".git"
      ) {
        continue;
      }

      const entryRelativePath = path.join(relativePath, name);
      const entryAbsolutePath = path.resolve(resolvedPath, name);

      try {
        const entryStat = fs.statSync(entryAbsolutePath);
        if (entry.isDirectory()) {
          folders.push({
            name,
            path: entryRelativePath,
          });
        } else {
          files.push({
            name,
            path: entryRelativePath,
            size: entryStat.size,
            mtime: entryStat.mtime.toISOString(),
          });
        }
      } catch (err) {
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    res.json({
      success: true,
      currentPath: relativePath || ".",
      parentPath: relativePath ? path.dirname(relativePath) : null,
      folders,
      files,
    });
  } catch (error: any) {
    console.error("List storage error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/storage/create-dir", (req, res) => {
  try {
    const { parentPath, dirName } = req.body;
    if (!dirName || !dirName.trim()) {
      return res.status(400).json({ success: false, error: "文件夹名称不能为空" });
    }

    const sanitizedName = dirName.replace(/[\/\\:\*\?"<>\|]/g, "_").trim();
    const resolvedParent = safeResolve(parentPath || "");
    const newDirPath = path.join(resolvedParent, sanitizedName);

    if (!newDirPath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "禁止在工作区外创建文件夹" });
    }

    if (fs.existsSync(newDirPath)) {
      return res.status(400).json({ success: false, error: "同名文件夹已存在" });
    }

    fs.mkdirSync(newDirPath, { recursive: true });
    const relativePath = path.relative(process.cwd(), newDirPath);

    res.json({ success: true, path: relativePath });
  } catch (error: any) {
    console.error("Create dir error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/storage/sync-chapter", (req, res) => {
  try {
    const { storagePath, novelTitle, chapterTitle, content, novelData } = req.body;
    const effectiveStorage = (storagePath && storagePath.trim()) ? storagePath : "storage";
    if (!novelTitle || !novelTitle.trim()) {
      return res.status(400).json({ success: false, error: "小说名称不能为空" });
    }
    if (!chapterTitle || !chapterTitle.trim()) {
      return res.status(400).json({ success: false, error: "章节标题不能为空" });
    }

    const resolvedStorage = safeResolve(effectiveStorage);
    if (!fs.existsSync(resolvedStorage)) {
      fs.mkdirSync(resolvedStorage, { recursive: true });
    }

    const safeNovelFolder = novelTitle.replace(/[\/\\:\*\?"<>\|]/g, "_").trim();
    const novelDirPath = path.join(resolvedStorage, safeNovelFolder);

    if (!fs.existsSync(novelDirPath)) {
      fs.mkdirSync(novelDirPath, { recursive: true });
    }

    const safeChapterFile = chapterTitle.replace(/[\/\\:\*\?"<>\|]/g, "_").trim() + ".txt";
    const chapterFilePath = path.join(novelDirPath, safeChapterFile);

    if (!chapterFilePath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "路径安全越界" });
    }

    fs.writeFileSync(chapterFilePath, content || "", "utf8");

    if (novelData) {
      const jsonFilePath = path.join(novelDirPath, `${safeNovelFolder}.json`);
      fs.writeFileSync(jsonFilePath, JSON.stringify(novelData, null, 2), "utf8");
    }

    res.json({
      success: true,
      absolutePath: chapterFilePath,
      relativePath: path.relative(process.cwd(), chapterFilePath),
    });
  } catch (error: any) {
    console.error("Sync chapter error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/storage/read-file", (req, res) => {
  try {
    const userPath = String(req.query.path || "");
    if (!userPath) {
      return res.status(400).json({ success: false, error: "未指定文件路径" });
    }

    const resolvedPath = safeResolve(userPath);
    if (!resolvedPath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "无权访问该路径" });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: "文件不存在" });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: "指定路径不是文件" });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== ".txt" && ext !== ".md" && ext !== ".json") {
      return res.status(400).json({ success: false, error: "仅支持查看文本文件" });
    }

    const content = fs.readFileSync(resolvedPath, "utf8");
    res.json({
      success: true,
      fileName: path.basename(resolvedPath),
      content: content,
    });
  } catch (error: any) {
    console.error("Read file error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/storage/delete", (req, res) => {
  try {
    const { targetPath } = req.body;
    if (!targetPath) {
      return res.status(400).json({ success: false, error: "未指定路径" });
    }

    const resolvedPath = safeResolve(targetPath);
    if (!resolvedPath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "无权删除该路径" });
    }
    if (resolvedPath === process.cwd()) {
      return res.status(403).json({ success: false, error: "不能删除工作区根目录" });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: "目标不存在" });
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      fs.rmSync(resolvedPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolvedPath);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get(["/api/storage/download-novel", "/api/storage/download-folder"], async (req, res) => {
  try {
    const { path: folderPath, title } = req.query;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: "未指定目录路径" });
    }
    
    const resolvedPath = safeResolve(String(folderPath));
    if (!resolvedPath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "无权访问该路径" });
    }
    
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ success: false, error: "目录不存在" });
    }

    const downloadName = title 
      ? String(title) 
      : (path.basename(resolvedPath) || "小说存储总文件夹");

    const zip = new JSZip();

    const addDirectoryToZip = (zipObj: JSZip, dirPath: string, zipPath: string = '') => {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const itemZipPath = zipPath ? `${zipPath}/${item}` : item;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          addDirectoryToZip(zipObj, fullPath, itemZipPath);
        } else if (stat.isFile()) {
          zipObj.file(itemZipPath, fs.readFileSync(fullPath));
        }
      }
    };

    addDirectoryToZip(zip, resolvedPath);
    
    const content = await zip.generateAsync({ type: "nodebuffer" });
    
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}.zip"`);
    res.send(content);
  } catch (error: any) {
    console.error("Download directory error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/storage/download-file", async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
        return res.status(400).json({ success: false, error: "未指定文件路径" });
    }
    
    const resolvedPath = safeResolve(String(filePath));
    if (!resolvedPath.startsWith(process.cwd())) {
      return res.status(403).json({ success: false, error: "无权访问该路径" });
    }
    
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return res.status(404).json({ success: false, error: "文件不存在" });
    }

    res.download(resolvedPath);
  } catch (error: any) {
    console.error("Download file error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  console.log("[Proxy] Checking if Python proxy is running...");
  const isHealthy = await checkProxyHealth();
  
  if (!isHealthy) {
    console.log("[Proxy] Starting Python proxy...");
    await startPythonProxy();
  } else {
    console.log("[Proxy] Python proxy is already running");
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[Proxy] Using Python proxy at ${PROXY_URL}`);
  });
}

process.on("exit", () => {
  if (pythonProcess) {
    console.log("[Proxy] Terminating Python proxy...");
    pythonProcess.kill();
  }
});

process.on("SIGINT", () => {
  process.exit();
});

startServer();