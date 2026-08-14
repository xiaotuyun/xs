// Cloudflare Worker 后端代码 - 用于连接 Cloudflare D1 数据库 (绑定名称设为 DB)
export default {
  async fetch(request, env) {
    // 允许 GitHub Pages 跨域请求 (CORS)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // 1. 登录验证 API
      if (url.pathname.endsWith('/api/auth/login') && request.method === 'POST') {
        const { account, password } = await request.json();
        
        if (!account || !password) {
          return new Response(JSON.stringify({ success: false, error: '账号和密码不能为空！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const cleanAcc = String(account || '').trim();
        const cleanPass = String(password || '').trim();

        // 从 D1 数据库中查询对应账号的凭证 (支持多账号)
        const { results } = await env.DB.prepare('SELECT id, account, password FROM auth_credentials').all();
        const allUsers = results || [];

        const matchedUser = allUsers.find(u => 
          String(u.account || '').trim().toLowerCase() === cleanAcc.toLowerCase() && 
          String(u.password || '').trim() === cleanPass
        );

        if (matchedUser) {
          // 仅负责账号密码的验证放行。
          // 至于是否给予管理员最高权限，将由客户端调用 /api/auth/is-admin 时通过 XS_W2_USERDATAS_KEY 决定。
          // 如果这里拦截了，用户连“体验用户”都做不了。
          return new Response(JSON.stringify({ success: true, message: '登录成功' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: '账号或密码不正确！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // 2. 修改账号密码 API
      if (url.pathname.endsWith('/api/auth/change-password') && request.method === 'POST') {
        const { oldPassword, newAccount, newPassword, currentAccount } = await request.json();

        // 优先根据旧密码和当前账号查找对应的用户记录
        let userToUpdate = null;
        if (currentAccount) {
          const { results } = await env.DB.prepare(
            'SELECT id, account, password FROM auth_credentials WHERE account = ? AND password = ?'
          ).bind(currentAccount, oldPassword).all();
          if (results && results.length > 0) {
            userToUpdate = results[0];
          }
        }

        if (!userToUpdate) {
          const { results } = await env.DB.prepare(
            'SELECT id, account, password FROM auth_credentials WHERE password = ?'
          ).bind(oldPassword).all();
          if (results && results.length > 0) {
            userToUpdate = results[0];
          }
        }

        if (!userToUpdate) {
          return new Response(JSON.stringify({ success: false, error: '原密码验证不正确！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新 D1 数据库中对应 id 的账号和密码
        await env.DB.prepare(
          'UPDATE auth_credentials SET account = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(newAccount, newPassword, userToUpdate.id).run();

        return new Response(JSON.stringify({ success: true, message: '账号和密码修改成功！全球同步已生效。' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 9. AI Hugging Face WhoAmI
      if (url.pathname.endsWith('/api/ai/hf/whoami') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const apiKey = (body.apiKey || env.HF_TOKEN || env.HUGGINGFACE_TOKEN || '').trim();
          if (!apiKey) {
            return new Response(JSON.stringify({ success: false, error: "请先填写并保存 Hugging Face Token (hf_...)" }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const response = await fetch("https://huggingface.co/api/whoami-v2", {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "User-Agent": "NovelCraftStudio/1.0"
            }
          });
          if (!response.ok) {
            const errText = await response.text();
            let errJson = {};
            try { errJson = JSON.parse(errText); } catch {}
            return new Response(JSON.stringify({
              success: false,
              error: errJson.error || errJson.message || `Hugging Face 鉴权失败 (${response.status})，请检查 Token 权限。`
            }), {
              status: response.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const data = await response.json();
          return new Response(JSON.stringify({
            success: true,
            user: {
              name: data.name || data.username || "User",
              fullname: data.fullname || data.name,
              email: data.email,
              type: data.type,
              orgs: data.orgs || []
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message || "请求 Hugging Face WhoAmI 接口失败" }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // 10. AI Hugging Face Models list
      if (url.pathname.endsWith('/api/ai/hf/models') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const apiKey = (body.apiKey || env.HF_TOKEN || env.HUGGINGFACE_TOKEN || '').trim();
          const { author, search, filter, sort, direction, limit } = body;

          const params = new URLSearchParams();
          if (author && typeof author === 'string' && author.trim()) params.append("author", author.trim());
          if (search && typeof search === 'string' && search.trim()) params.append("search", search.trim());
          if (filter && typeof filter === 'string' && filter.trim()) params.append("filter", filter.trim());
          params.append("sort", sort || "downloads");
          params.append("direction", direction || "-1");
          params.append("limit", String(limit || 50));

          const headers = {
            "User-Agent": "NovelCraftStudio/1.0"
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }

          const response = await fetch(`https://huggingface.co/api/models?${params.toString()}`, {
            headers
          });

          if (!response.ok) {
            const errText = await response.text();
            let errJson = {};
            try { errJson = JSON.parse(errText); } catch {}
            return new Response(JSON.stringify({
              success: false,
              error: errJson.error || errJson.message || `获取 Hugging Face 模型列表失败 (${response.status})`
            }), {
              status: response.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const list = await response.json();
          if (!Array.isArray(list)) {
            return new Response(JSON.stringify({ success: true, models: [] }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const models = list.map((m) => ({
            id: m.id || m.modelId || m._id,
            downloads: m.downloads || 0,
            likes: m.likes || 0,
            pipeline_tag: m.pipeline_tag || '',
            tags: m.tags || [],
            private: Boolean(m.private),
            author: m.author || (m.id ? m.id.split('/')[0] : '')
          }));

          return new Response(JSON.stringify({ success: true, models }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message || "请求 Hugging Face 模型列表异常" }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // 11. AI Hugging Face Inference
      if (url.pathname.endsWith('/api/ai/hf/inference') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const apiKey = (body.apiKey || env.HF_TOKEN || env.HUGGINGFACE_TOKEN || '').trim();
          const { model, task, inputs, parameters } = body;

          if (!model) {
            return new Response(JSON.stringify({ success: false, error: "未指定推理模型 ID" }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const startTime = Date.now();
          const headers = {
            "Content-Type": "application/json",
            "User-Agent": "NovelCraftStudio/1.0"
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }

          // 1. Chat Completion / Text Generation via standard router
          if (task === "chat_completion" || task === "text-generation-chat") {
            const chatUrl = "https://router.huggingface.co/v1/chat/completions";
            const messages = Array.isArray(inputs) ? inputs : [
              { role: "user", content: typeof inputs === "string" ? inputs : JSON.stringify(inputs) }
            ];

            let chatRes = await fetch(chatUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model,
                messages,
                max_tokens: parameters?.max_tokens || 300,
                temperature: parameters?.temperature || 0.7
              })
            });

            let resText = await chatRes.text();
            let data = {};
            try { data = JSON.parse(resText); } catch {}

            if (!chatRes.ok) {
              // Fallback to router /hf-inference direct endpoint
              const directUrl = `https://router.huggingface.co/hf-inference/models/${model}`;
              const fbRes = await fetch(directUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  inputs: typeof inputs === "string" ? inputs : messages[0]?.content,
                  parameters: { max_new_tokens: 150 }
                })
              });
              if (fbRes.ok) {
                const fbData = await fbRes.json();
                const duration = Date.now() - startTime;
                return new Response(JSON.stringify({ success: true, result: fbData, model, task, duration }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
              return new Response(JSON.stringify({
                success: false,
                error: data.error?.message || data.error || data.message || `推理请求失败 (${chatRes.status})。`
              }), {
                status: chatRes.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const duration = Date.now() - startTime;
            const textContent = data.choices?.[0]?.message?.content || "";
            return new Response(JSON.stringify({
              success: true,
              result: data,
              text: textContent,
              model,
              task,
              duration
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // 2. Direct pipeline tasks via router or api-inference
          const targetUrl = `https://router.huggingface.co/hf-inference/models/${model}`;
          const payload = { inputs };
          if (parameters) {
            payload.parameters = parameters;
          }

          const response = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });

          const resText = await response.text();
          let data = {};
          try { data = JSON.parse(resText); } catch { data = resText; }

          if (!response.ok) {
            // Legacy fallback
            const legacyUrl = `https://api-inference.huggingface.co/models/${model}`;
            const legRes = await fetch(legacyUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(payload)
            });
            if (legRes.ok) {
              const legData = await legRes.json();
              const duration = Date.now() - startTime;
              return new Response(JSON.stringify({ success: true, result: legData, model, task, duration }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const errMsg = typeof data === "object" ? (data.error || data.message || JSON.stringify(data)) : data;
            return new Response(JSON.stringify({
              success: false,
              error: errMsg || `Hugging Face 推理接口响应错误 (${response.status})`
            }), {
              status: response.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const duration = Date.now() - startTime;
          return new Response(JSON.stringify({
            success: true,
            result: data,
            model,
            task,
            duration
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message || "执行 Hugging Face 推理任务异常" }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // 12. AI Fetch Models List
      if (url.pathname.endsWith('/api/ai/fetch-models') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const apiKey = (body.apiKey || env.GEMINI_API_KEY || '').trim();
          const customListUrl = (body.customListUrl || env.CUSTOM_LIST_URL || '').trim();
          const customBaseUrl = (body.customBaseUrl || env.CUSTOM_BASE_URL || '').trim();

          if (!apiKey) {
            return new Response(JSON.stringify({ success: false, error: "未提供 API Key" }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          let fetchedModels = [];

          // Mode 1: Custom List URL or Custom Base URL
          if (customListUrl || customBaseUrl) {
            try {
              let targetUrl = customListUrl;
              if (!targetUrl && customBaseUrl) {
                let baseUrl = customBaseUrl.replace(/\/+$/, '');
                baseUrl = baseUrl.replace(/\/(chat\/)?completions$/, '');
                if (!baseUrl.endsWith('/models')) {
                  targetUrl = `${baseUrl}/models`;
                } else {
                  targetUrl = baseUrl;
                }
              }
              const response = await fetch(targetUrl, {
                headers: {
                  "Authorization": `Bearer ${apiKey}`,
                  "Content-Type": "application/json"
                }
              });
              if (response.ok) {
                const data = await response.json().catch(() => null);
                if (data) {
                  const rawList = data.data || data.models || data;
                  if (Array.isArray(rawList)) {
                    fetchedModels = rawList.map((m) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
                  }
                }
              }
            } catch (e) {}
          } else {
            // Mode 2: Direct Gemini API
            try {
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
              if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data.models)) {
                  fetchedModels = data.models
                    .map((m) => m.name ? m.name.replace(/^models\//, '') : '')
                    .filter(Boolean);
                }
              }
            } catch (e) {}
          }

          if (fetchedModels.length === 0) {
            return new Response(JSON.stringify({
              success: false,
              models: [],
              error: "未通过当前 API Key 连接查找到任何可用模型。请确认 API Key 或网络配置。"
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ success: true, models: fetchedModels }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, models: [], error: error.message || "获取模型列表失败" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // 13. AI Test Model
      if (url.pathname.endsWith('/api/ai/test-model') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const apiKey = (body.apiKey || env.GEMINI_API_KEY || '').trim();
          const model = body.model;
          const prompt = body.prompt || "你好";
          const customBaseUrl = (body.customBaseUrl || env.CUSTOM_BASE_URL || '').trim();
          const useChatCompletions = body.useChatCompletions !== false;

          if (!apiKey) {
            return new Response(JSON.stringify({ success: false, error: "未提供 API Key" }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          if (!model) {
            return new Response(JSON.stringify({ success: false, error: "未选择要测试的模型，请先选择一个模型！" }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Use Chat Completions format or direct Gemini
          let textResult = "";
          const isGeminiKey = apiKey.startsWith('AIza') || apiKey.startsWith('AQ');
          const shouldUseOpenAI = (customBaseUrl && useChatCompletions && !isGeminiKey) || (customBaseUrl && !model.toLowerCase().includes('gemini') && !isGeminiKey);

          if (shouldUseOpenAI) {
            let urlStr = customBaseUrl || 'https://api.openai.com/v1';
            urlStr = urlStr.replace(/\/+$/, '');
            if (!urlStr.endsWith('/chat/completions')) {
              urlStr = `${urlStr}/chat/completions`;
            }
            const response = await fetch(urlStr, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }]
              })
            });
            if (response.ok) {
              const data = await response.json();
              textResult = data.choices?.[0]?.message?.content || "";
            } else {
              const err = await response.text();
              throw new Error(`OpenAI 协议接口调用失败 (${response.status}): ${err}`);
            }
          } else {
            // Direct Gemini beta API
            let targetModel = model;
            if (!targetModel.startsWith('models/') && !targetModel.startsWith('gemini-')) {
              targetModel = `gemini-1.5-flash`; // Fallback default
            }
            const modelClean = targetModel.replace(/^models\//, '');
            const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelClean}:generateContent?key=${apiKey}`;

            const response = await fetch(targetUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            });
            if (response.ok) {
              const data = await response.json();
              textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
              const err = await response.text();
              throw new Error(`Gemini 接口调用失败 (${response.status}): ${err}`);
            }
          }

          return new Response(JSON.stringify({ success: true, response: textResult || "测试成功，但返回内容为空。" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message || "测试该模型失败" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message || '数据库查询失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
