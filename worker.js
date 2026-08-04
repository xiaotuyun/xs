// Cloudflare Worker 后端代码 - 用于连接 Cloudflare D1 数据库 (绑定名称设为 DB)
export default {
  async fetch(request, env) {
    // 允许 GitHub Pages 跨域请求 (CORS)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // 1. 登录验证 API
      if (url.pathname.endsWith('/api/auth/login') && request.method === 'POST') {
        const { account, password } = await request.json();
        
        // 从 D1 数据库中查询凭证 (完全依赖数据库)
        const { results } = await env.DB.prepare(
          'SELECT account, password FROM auth_credentials WHERE id = 1'
        ).all();

        if (!results || results.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'D1 数据库未检测到账号配置，请先在 Studio 中新增 auth_credentials 记录！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const currentAuth = results[0];

        if (account === currentAuth.account && password === currentAuth.password) {
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
        const { oldPassword, newAccount, newPassword } = await request.json();

        // 从 D1 数据库中验证原密码
        const { results } = await env.DB.prepare(
          'SELECT password FROM auth_credentials WHERE id = 1'
        ).all();

        if (!results || results.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'D1 数据库未检测到原账号记录！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const currentPassword = results[0].password;

        if (oldPassword !== currentPassword) {
          return new Response(JSON.stringify({ success: false, error: '原密码验证不正确！' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新 D1 数据库中的账号和密码
        await env.DB.prepare(
          'UPDATE auth_credentials SET account = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
        ).bind(newAccount, newPassword).run();

        return new Response(JSON.stringify({ success: true, message: '账号和密码修改成功！全球同步已生效。' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
