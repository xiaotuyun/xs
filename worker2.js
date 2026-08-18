// 兼容定义默认部署与绑定地址
const DEFAULT_WORKER_URL = 'https://xs.jiedianguitu.workers.dev';

export default {
  async fetch(request, env) {
    // 允许跨域 CORS 标头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 获取绑定的 D1 数据库对象 (增加多重环境名兼容: DB / xs_userdatas / db)
    const dbAdmin = env.DB || env.xs_userdatas || env.db; 
    const db = env.xs_userdatas || env.DB || env.db; 

    if (!db) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'D1 数据库资源未绑定！请在 Cloudflare Worker 中绑定 D1 数据库 (名称如 DB 或 xs_userdatas)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 辅助方法：检查账号是否为超级管理员 (查询 xs 数据库)
    const checkIsAdmin = async (account, providedKey = '') => {
      if (!dbAdmin) return false;
      try {
        const { results } = await dbAdmin.prepare('SELECT 1 FROM auth_credentials WHERE account = ?').bind(account).all();
        if (results.length > 0) {
          // 在确认是管理员账号的基础上增加鉴权
          const expectedKey = String(env.XS_W2_USERDATAS_KEY || '').trim();
          if (expectedKey) {
            return String(providedKey || '').trim() === expectedKey;
          } else {
            return true; // 如果环境变量没有设置钥匙，则默认保持原逻辑
          }
        }
        return false;
      } catch (e) {
        console.error('Admin check error:', e);
        return false;
      }
    };

    try {
      // 已移除默认的全局自动表初始化，不仅可以大幅度提升每次请求的响应速度，更可以防止他人拷贝部署后免密运行。
      // 仅可通过手动调用 /api/init-db 接口来进行首次表结构初始化。

      // 如果请求的不是 API 路由，则作为静态网页/资源代理，直接反向代理到 GitHub Pages 的前端页面
      if (!url.pathname.includes('/api/')) {
        let targetPath = url.pathname;
        if (targetPath === '/' || targetPath === '') {
          targetPath = '/xs/index.html';
        } else if (!targetPath.startsWith('/xs/')) {
          targetPath = '/xs' + targetPath;
        }

        const targetUrl = `https://xiaotuyun.github.io${targetPath}${url.search}`;
        try {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': request.headers.get('User-Agent') || 'Cloudflare Worker Proxy',
            }
          });

          const newHeaders = new Headers(response.headers);
          // 附加允许跨域头，确保前端能正常加载
          for (const [key, val] of Object.entries(corsHeaders)) {
            newHeaders.set(key, val);
          }

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        } catch (e) {
          return new Response(`Proxy Error: ${e.message}`, { status: 502, headers: corsHeaders });
        }
      }

      // 仅用于系统内部的 API 健康检查 /api/health
      if (url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({ status: 'ok', default_worker_url: DEFAULT_WORKER_URL }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 手动触发表结构初始化 (已在代码中彻底禁用和移除了 SQL 建表细节，防止泄露)
      if (url.pathname.endsWith('/api/init-db')) {
        return new Response(
          JSON.stringify({ success: false, message: '为了安全性与防止盗用，自动与手动建表功能已被完全移除。请联系数据库所有者手动导入 SQL 脚本！' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 0. 读取/保存 D1 数据库中存储的 SMTP 发件配置 API (/api/config/smtp)
      if (url.pathname.endsWith('/api/config/smtp')) {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const smtpUser = String(body.user || body.smtpUser || '').trim();
          const smtpPass = String(body.pass || body.smtpPass || '').trim();
          if (smtpUser) {
            await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('smtp_user', ?)").bind(smtpUser).run();
          }
          if (smtpPass) {
            await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('smtp_pass', ?)").bind(smtpPass).run();
          }
          return new Response(
            JSON.stringify({ success: true, message: 'SMTP 发件人配置已成功保存至 Cloudflare D1 数据库 xs_userdatas！' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // GET 读取
          const { results } = await db.prepare("SELECT key, value FROM system_config WHERE key IN ('smtp_user', 'smtp_pass')").all();
          let smtpUser = '';
          let smtpPass = '';
          if (results) {
            for (const row of results) {
              if (row.key === 'smtp_user') smtpUser = row.value;
              if (row.key === 'smtp_pass') smtpPass = row.value;
            }
          }
          return new Response(
            JSON.stringify({ success: true, user: smtpUser, pass: smtpPass, hasConfig: Boolean(smtpUser && smtpPass) }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 1.5 管理后台：检查用户是否为管理员 /api/auth/is-admin (GET)
      if (url.pathname.endsWith('/api/auth/is-admin') || url.pathname.endsWith('/api/auth/check-admin')) {
        const account = url.searchParams.get('account');
        const adminKey = url.searchParams.get('admin_key') || (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
        if (!account) {
          return new Response(JSON.stringify({ isAdmin: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const adminStatus = await checkIsAdmin(account, adminKey);
        return new Response(JSON.stringify({ isAdmin: adminStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 1. 发送邮箱验证码 API (/api/auth/send-code)
      if (url.pathname.endsWith('/api/auth/send-code') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || '').trim().toLowerCase();

        if (!email || !email.includes('@')) {
          return new Response(
            JSON.stringify({ success: false, error: '请输入有效的邮箱地址' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 禁用所有临时/垃圾邮箱
        const disposableDomains = [
          'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
          'yopmail.com', 'dispostable.com', 'trashmail.com', 'getairmail.com', 'maildrop.cc',
          'sharklasers.com', 'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spamgourmet.com',
          '10minutemail.net', 'tempmail.net', 'tempail.com', 'emailondeck.com', 'disposablemail.com',
          'fakemailgenerator.com', 'mohmal.com', 'crazymailing.com', 'throwawaymail.com', 'burnermail.io',
          'getnada.com', 'mytemp.email', 'inboxkitten.com', 'tempmailo.com', 'tmailor.com'
        ];
        const disposableKeywords = [
          'tempmail', 'disposable', 'fakemail', 'trashmail', '10min', 'guerrilla', 'yopmail',
          'throwaway', 'burnermail', 'getnada', 'inboxkitten', 'tmailor', 'mailinator', 'temp-mail',
          'mohmal', 'crazymailing', 'emailondeck', 'tempail'
        ];
        const emailDomain = email.split('@')[1] || '';
        const isTempEmail = disposableDomains.includes(emailDomain) || disposableKeywords.some(kw => emailDomain.includes(kw));
        if (isTempEmail) {
          return new Response(
            JSON.stringify({ success: false, error: '系统已禁用部分临时邮箱，请使用常用真实邮箱（如 QQ邮箱、163邮箱、Gmail 等）！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 生成 6 位随机验证码 (优先使用请求传入的指定验证码，确保与 SMTP 发件内容一致)
        const code = String(body.code || '').trim() || Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

        // 写入 D1 数据库 (dbUser)
        await db.prepare(
          'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)'
        ).bind(email, code, expiresAt).run();

        // 尝试通过 Mailchannels API 发送真实邮件至 QQ/电子邮箱
        let emailSent = false;
        try {
          const mcResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{ to: [{ email }] }],
              from: {
                email: 'auth@system.internal',
                name: 'AI 智笔小说工坊',
              },
              subject: '【AI智笔小说工坊】您的登录/注册验证码',
              content: [
                {
                  type: 'text/html',
                  value: `<div style="font-family: Arial, sans-serif; padding: 24px; max-width: 480px; background: #ffffff; border: 1px solid #f3f4f6; border-radius: 16px;">
                    <h2 style="color: #d97706; margin: 0; font-size: 20px;">AI 智笔小说工坊</h2>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 4px;">智能网文创作与协同平台</p>
                    <p style="font-size: 14px; color: #374151; margin-top: 16px;">您好！您的 6 位注册/登录验证码为：</p>
                    <div style="text-align: center; margin: 20px 0;">
                      <span style="font-size: 30px; font-weight: bold; color: #b45309; letter-spacing: 6px; padding: 10px 24px; background: #fef3c7; border: 1px dashed #f59e0b; border-radius: 12px; display: inline-block;">${code}</span>
                    </div>
                    <p style="font-size: 12px; color: #9ca3af;">验证码有效期为 5 分钟。若非本人操作，请忽略。</p>
                  </div>`,
                },
              ],
            }),
          });
          if (mcResponse.ok) {
            emailSent = true;
          }
        } catch (e) {
          console.error('Mailchannels send error:', e);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: emailSent
              ? `验证码已通过 Cloudflare 成功投递至 ${email}，请检查收件箱或垃圾箱！`
              : `验证码已写入 D1 数据库 (${code})，但邮件发送失败。请检查 QQ 邮箱垃圾箱或配置 SMTP/Mailchannels 域名解析。`,
            emailSent: emailSent,
            code: emailSent ? undefined : code, // 邮件投递未成功时提供应急验证码以便正常注册
            expiresInSeconds: 300,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. 邮箱注册 API (/api/auth/register)
      if (url.pathname.endsWith('/api/auth/register') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || body.account || '').trim().toLowerCase();
        const password = String(body.password || '').trim();
        const code = String(body.code || '').trim();

        if (!email || !email.includes('@')) {
          return new Response(
            JSON.stringify({ success: false, error: '请输入有效的邮箱地址' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!password || password.length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: '密码长度不能少于 6 位' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 校验验证码（如果有提供）
        if (code) {
          const { results: codeRecords } = await db.prepare(
            'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? ORDER BY id DESC LIMIT 1'
          ).bind(email, code, Date.now()).all();

          if (!codeRecords || codeRecords.length === 0) {
            return new Response(
              JSON.stringify({ success: false, error: '邮箱验证码不正确或已过期，请重新获取' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // 检查用户是否已注册
        const { results: existingUsers } = await db.prepare(
          'SELECT id FROM users WHERE email = ? OR account = ?'
        ).bind(email, email).all();

        if (existingUsers && existingUsers.length > 0) {
          return new Response(
            JSON.stringify({ success: false, error: '该邮箱已注册，请直接登录或找回密码！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 插入用户数据到 users 表
        await db.prepare(
          'INSERT INTO users (email, account, password) VALUES (?, ?, ?)'
        ).bind(email, email, password).run();

        // 同时初始化体验账户使用时间记录
        try {
          await db.prepare(
            'INSERT OR IGNORE INTO user_timing (email, used_seconds, max_seconds) VALUES (?, 0, 3600)'
          ).bind(email).run();
        } catch (e) {
          console.error('user_timing init on register failed:', e);
        }

        return new Response(
          JSON.stringify({ success: true, message: '注册成功！请使用注册的邮箱和密码进行登录。' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. 登录 API (/api/auth/login) - 支持邮箱密码登录 & 邮箱验证码快捷登录
      if (url.pathname.endsWith('/api/auth/login') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const account = String(body.account || body.email || '').trim().toLowerCase();
        const password = String(body.password || '').trim();
        const code = String(body.code || '').trim();
        const loginType = body.loginType || (code ? 'code' : 'password');
        const adminKey = body.admin_key || (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();

        if (!account) {
          return new Response(
            JSON.stringify({ success: false, error: '请输入邮箱地址！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 统一检测：通过 checkIsAdmin 判定是否为管理员
        const isAdmin = await checkIsAdmin(account, adminKey);
        
        // 逻辑：只要不是管理员，就是体验用户，执行体验计时相关逻辑
        if (!isAdmin) {
          try {
            const { results: timingCheck } = await db.prepare(
              'SELECT used_seconds, max_seconds FROM user_timing WHERE email = ?'
            ).bind(account).all();
            if (timingCheck && timingCheck.length > 0) {
              const row = timingCheck[0];
              if (Number(row.used_seconds) >= Number(row.max_seconds)) {
                return new Response(
                  JSON.stringify({
                    success: false,
                    error: `该体验账户 (${account}) 已达到使用时间上限（已使用 ${row.used_seconds} 秒 / 最大限制 ${row.max_seconds} 秒，剩余 0 秒）。如果需要增加时长，请联系管理员！`
                  }),
                  { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            }
          } catch (e) {
            console.error('Login timing check error:', e);
          }
        }

        // 方式 A：邮箱验证码登录
        if (loginType === 'code' && code) {
          const { results: codeRecords } = await db.prepare(
            'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? ORDER BY id DESC LIMIT 1'
          ).bind(account, code, Date.now()).all();

          if (!codeRecords || codeRecords.length === 0) {
            return new Response(
              JSON.stringify({ success: false, error: '验证码错误或已过期，请重新获取' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 1. 写入/更新【邮箱接码用户表】(email_code_users)
          try {
            const { results: existingCodeUsers } = await db.prepare(
              'SELECT * FROM email_code_users WHERE email = ?'
            ).bind(account).all();

            if (!existingCodeUsers || existingCodeUsers.length === 0) {
              await db.prepare(
                'INSERT INTO email_code_users (email, used_code, login_count) VALUES (?, ?, 1)'
              ).bind(account, code).run();
            } else {
              await db.prepare(
                'UPDATE email_code_users SET used_code = ?, login_count = login_count + 1, login_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?'
              ).bind(code, account).run();
            }
          } catch (e) {
            console.error('email_code_users write error:', e);
          }

          // 3. 如果主 users 用户表中不存在，自动同步创建基础账号
          const { results: userRes } = await db.prepare(
            'SELECT * FROM users WHERE email = ? OR account = ?'
          ).bind(account, account).all();

          if (!userRes || userRes.length === 0) {
            const randomPass = Math.random().toString(36).slice(-8);
            await db.prepare(
              'INSERT INTO users (email, account, password) VALUES (?, ?, ?)'
            ).bind(account, account, randomPass).run();
          }

          // 同时初始化或更新体验账号使用时间
          try {
            await db.prepare(
              'INSERT OR IGNORE INTO user_timing (email, used_seconds, max_seconds) VALUES (?, 0, 3600)'
            ).bind(account).run();
          } catch (e) {
            console.error('user_timing init on code login failed:', e);
          }

          return new Response(
            JSON.stringify({ success: true, message: '验证码登录成功', user: { email: account } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 方式 B：密码登录（仅匹配 users 表）
        if (!password) {
          return new Response(
            JSON.stringify({ success: false, error: '密码不能为空！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { results: usersMatch } = await db.prepare(
          'SELECT * FROM users WHERE (email = ? OR account = ?) AND password = ?'
        ).bind(account, account, password).all();

        if (usersMatch && usersMatch.length > 0) {
          const finalEmail = usersMatch[0].email || account;
          
          // 同时初始化或更新体验账号使用时间
          try {
            await db.prepare(
              'INSERT OR IGNORE INTO user_timing (email, used_seconds, max_seconds) VALUES (?, 0, 3600)'
            ).bind(finalEmail).run();
          } catch (e) {
            console.error('user_timing init on pass login failed:', e);
          }

          return new Response(
            JSON.stringify({ success: true, message: '登录成功', user: { email: finalEmail } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: '邮箱或密码不正确，请注册后再试！' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. 修改密码 API (/api/auth/change-password) - 支持原密码修改 & 邮箱验证码重置密码
      if (url.pathname.endsWith('/api/auth/change-password') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const oldPassword = String(body.oldPassword || '').trim();
        const code = String(body.code || '').trim();
        const resetType = body.resetType || (code ? 'code' : 'password');
        const targetEmail = String(body.email || body.currentAccount || body.newAccount || '').trim().toLowerCase();
        const newAccount = String(body.newAccount || body.email || targetEmail).trim().toLowerCase();
        const newPassword = String(body.newPassword || '').trim();

        if (!newPassword || newPassword.length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: '新密码不能少于 6 位字符！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 方式 A：通过邮箱验证码重置密码 (忘记原密码)
        if (resetType === 'code' || code) {
          if (!targetEmail || !targetEmail.includes('@')) {
            return new Response(
              JSON.stringify({ success: false, error: '请输入有效的邮箱地址以接收验证码' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (!code) {
            return new Response(
              JSON.stringify({ success: false, error: '请输入邮箱验证码！' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 校验验证码
          const { results: codeRecords } = await db.prepare(
            'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? ORDER BY id DESC LIMIT 1'
          ).bind(targetEmail, code, Date.now()).all();

          if (!codeRecords || codeRecords.length === 0) {
            return new Response(
              JSON.stringify({ success: false, error: '邮箱验证码不正确或已过期，请重新获取' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 搜寻匹配 users 表
          const { results: matchedUsers } = await db.prepare(
            'SELECT * FROM users WHERE email = ? OR account = ?'
          ).bind(targetEmail, targetEmail).all();

          if (!matchedUsers || matchedUsers.length === 0) {
            // 如果用户记录不存在，自动创建
            await db.prepare(
              'INSERT INTO users (email, account, password) VALUES (?, ?, ?)'
            ).bind(newAccount || targetEmail, newAccount || targetEmail, newPassword).run();
          } else {
            const targetUser = matchedUsers[0];
            const finalEmail = newAccount || targetUser.email || targetEmail;
            await db.prepare(
              'UPDATE users SET email = ?, account = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(finalEmail, finalEmail, newPassword, targetUser.id).run();
          }

          return new Response(
            JSON.stringify({ success: true, message: '密码通过邮箱验证码成功更新！已全域上线生效。' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 方式 B：通过原密码修改 (已知原密码)
        if (!oldPassword) {
          return new Response(
            JSON.stringify({ success: false, error: '原密码不能为空！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const currentAccount = String(body.currentAccount || '').trim();
        const { results: matchedUsers } = await db.prepare(
          'SELECT * FROM users WHERE (email = ? OR account = ? OR ? = "") AND password = ?'
        ).bind(currentAccount, currentAccount, currentAccount, oldPassword).all();

        if (!matchedUsers || matchedUsers.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: '原密码验证不正确！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const targetUser = matchedUsers[0];
        const finalEmail = newAccount || targetUser.email;
        await db.prepare(
          'UPDATE users SET email = ?, account = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(finalEmail, finalEmail, newPassword, targetUser.id).run();

        return new Response(
          JSON.stringify({ success: true, message: '账号与密码成功更新！已全域上线生效。' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 5. 体验账号心跳计时 API (/api/auth/sync-time) - 记录、增加、并返回最新使用时长和限制
      if (url.pathname.endsWith('/api/auth/sync-time') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || '').trim().toLowerCase();
        const increment = Number(body.increment || 5); // 默认每次增加 5 秒

        if (!email) {
          return new Response(
            JSON.stringify({ success: false, error: '账号不能为空！' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 插入初始值（确保在计时表中存在记录）
        await db.prepare(
          'INSERT OR IGNORE INTO user_timing (email, used_seconds, max_seconds) VALUES (?, 0, 3600)'
        ).bind(email).run();

        // 递增使用秒数
        await db.prepare(
          'UPDATE user_timing SET used_seconds = used_seconds + ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?'
        ).bind(increment, email).run();

        // 获取最新状态
        const { results } = await db.prepare(
          'SELECT used_seconds, max_seconds FROM user_timing WHERE email = ?'
        ).bind(email).all();

        if (results && results.length > 0) {
          const row = results[0];
          const used = Number(row.used_seconds);
          const max = Number(row.max_seconds);
          const expired = used >= max;

          return new Response(
            JSON.stringify({
              success: true,
              expired,
              used_seconds: used,
              max_seconds: max,
              remaining_seconds: Math.max(0, max - used),
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: '获取计时状态失败' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 6. 管理后台：获取所有用户及对应的计时使用信息 /api/admin/users (支持 GET & POST)
      if (url.pathname.endsWith('/api/admin/users')) {
        // 已移除此处的自动初始化，避免无意义的数据库资源开销并阻止恶意利用

        const expectedKey = String(env.XS_W2_USERDATAS_KEY || '').trim();
        if (expectedKey) {
          let providedKey = url.searchParams.get('admin_key');
          if (!providedKey && request.method === 'POST') {
            try {
              const clone = request.clone();
              const body = await clone.json().catch(() => ({}));
              providedKey = body.admin_key;
            } catch (e) {}
          }
          if (!providedKey) {
            providedKey = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
          }

          if (String(providedKey || '').trim() !== expectedKey) {
            return new Response(JSON.stringify({ success: false, error: '鉴权失败，需要提供正确的 XS_W2_USERDATAS_KEY 密钥' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        try {
          const userMap = new Map();

          // 1. 从 users 表查询
          try {
            const { results: r1 } = await db.prepare('SELECT email, account, created_at FROM users').all();
            if (r1) {
              for (const u of r1) {
                if (u.email) {
                  userMap.set(u.email.toLowerCase(), { email: u.email, account: u.account || u.email, created_at: u.created_at });
                }
              }
            }
          } catch (e) {}

          // 2. 从 email_code_users 表查询
          try {
            const { results: r2 } = await db.prepare('SELECT email, login_time as created_at FROM email_code_users').all();
            if (r2) {
              for (const u of r2) {
                if (u.email && !userMap.has(u.email.toLowerCase())) {
                  userMap.set(u.email.toLowerCase(), { email: u.email, account: u.email, created_at: u.created_at });
                }
              }
            }
          } catch (e) {}

          // 3. 从 auth_credentials 表查询 (管理员与初始账号)
          try {
            if (dbAdmin) {
              const { results: r3 } = await dbAdmin.prepare('SELECT account, updated_at as created_at FROM auth_credentials').all();
              if (r3) {
                for (const u of r3) {
                  if (u.account && !userMap.has(u.account.toLowerCase())) {
                    userMap.set(u.account.toLowerCase(), { email: u.account, account: u.account, created_at: u.created_at });
                  }
                }
              }
            }
          } catch (e) {}

          // 4. 从 user_timing 表查询
          try {
            const { results: r4 } = await db.prepare('SELECT email, updated_at as created_at FROM user_timing').all();
            if (r4) {
              for (const u of r4) {
                if (u.email && !userMap.has(u.email.toLowerCase())) {
                  userMap.set(u.email.toLowerCase(), { email: u.email, account: u.email, created_at: u.created_at });
                }
              }
            }
          } catch (e) {}

          // 5. 组装最终列表并附加上计时数据
          const userList = Array.from(userMap.values());
          for (const u of userList) {
            u.used_seconds = 0;
            u.max_seconds = 3600;
            try {
              const { results: tRes } = await db.prepare('SELECT used_seconds, max_seconds, updated_at FROM user_timing WHERE email = ?').bind(u.email).all();
              if (tRes && tRes.length > 0) {
                u.used_seconds = tRes[0].used_seconds !== undefined && tRes[0].used_seconds !== null ? Number(tRes[0].used_seconds) : 0;
                u.max_seconds = tRes[0].max_seconds !== undefined && tRes[0].max_seconds !== null ? Number(tRes[0].max_seconds) : 3600;
                u.updated_at = tRes[0].updated_at;
              }
            } catch (e) {}
          }

          return new Response(
            JSON.stringify({ success: true, users: userList }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: '获取用户列表失败: ' + e.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 7. 管理后台：给特定邮箱用户更新或加长使用秒数 /api/admin/update-time (POST)
      if (url.pathname.endsWith('/api/admin/update-time') && request.method === 'POST') {
        let body = {};
        try {
          body = await request.json().catch(() => ({}));
        } catch (e) {}

        const expectedKey = String(env.XS_W2_USERDATAS_KEY || '').trim();
        if (expectedKey) {
          let providedKey = url.searchParams.get('admin_key') ||
                             body.admin_key ||
                             (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
          
          if (String(providedKey || '').trim() !== expectedKey) {
            return new Response(JSON.stringify({ success: false, error: '鉴权失败，需要提供正确的 XS_W2_USERDATAS_KEY' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        try {
          const email = String(body.email || '').trim().toLowerCase();
          const maxSeconds = Number(body.max_seconds);

          if (!email) {
            return new Response(
              JSON.stringify({ success: false, error: '请输入有效的邮箱地址或账号' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (isNaN(maxSeconds) || maxSeconds < 0) {
            return new Response(
              JSON.stringify({ success: false, error: '时长秒数必须是大于等于 0 的有效整数' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 确保用户记录存在，并插入/更新时长限制
          await db.prepare(`
            INSERT INTO user_timing (email, used_seconds, max_seconds) 
            VALUES (?, 0, ?)
            ON CONFLICT(email) 
            DO UPDATE SET max_seconds = ?, updated_at = CURRENT_TIMESTAMP
          `).bind(email, maxSeconds, maxSeconds).run();

          return new Response(
            JSON.stringify({ success: true, message: `成功更新用户 (${email}) 的体验上限为 ${maxSeconds} 秒！` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: '更新时长限制失败: ' + e.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 8. 提交问题反馈 API (/api/feedback/submit)
      if (url.pathname.endsWith('/api/feedback/submit') && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const account = String(body.account || '').trim();
          const problem = String(body.problem || '').trim();

          if (!account) {
            return new Response(
              JSON.stringify({ success: false, error: '反馈账号不能为空' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (!problem) {
            return new Response(
              JSON.stringify({ success: false, error: '反馈内容不能为空' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (problem.length > 300) {
            return new Response(
              JSON.stringify({ success: false, error: '反馈内容不能超过 300 字' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          await db.prepare(
            'INSERT INTO problem_feedback (account, problem) VALUES (?, ?)'
          ).bind(account, problem).run();

          return new Response(
            JSON.stringify({ success: true, message: '反馈提交成功，感谢您的意见！' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: '提交反馈失败: ' + e.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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
      return new Response(
        JSON.stringify({ success: false, error: err.message || '数据库操作出现错误' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
