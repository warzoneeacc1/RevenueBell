/**
 * 配置区域
 * 1. PRODUCT_NAME: 产品名称
 * 2. BARK_KEY: 你的 Bark 推送 Key
 * 3. BARK_ICON: 通知的图标 (可选)
 */
const PRODUCT_NAME = "iRich";
const BARK_KEY = "xxxxxxxxxxxxxxx"; // ⚠️ 替换为你的 Key，或者在 Cloudflare 环境变量设置 BARK_KEY
const BARK_ICON = "" // 可选：自定义图标 URL

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==================== 1. 处理 GET 请求 (返回 HTML 页面) ====================
    if (request.method === "GET") {
      return new Response(renderHtml(url.href), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ==================== 2. 处理 POST 请求 (处理苹果通知) ====================
    if (request.method === "POST") {
      try {
        const data = await request.json();
        
        // 核心处理逻辑
        const result = await handleAppleNotification(data, env);
        
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });

      } catch (e) {
        console.error(`Error: ${e}`);
        // 返回 200 避免 Apple 重试，但在 Body 里记录错误
        return new Response(JSON.stringify({ status: "error", message: String(e) }), { status: 200 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
};

// ==================== 业务逻辑函数 ====================

async function handleAppleNotification(data, env) {
  if (!data || !data.signedPayload) {
    return { status: "ignored", message: "Missing signedPayload" };
  }

  // 1. 解码第一层
  const payload = decodeJWS(data.signedPayload);
  if (!payload) return { status: "error", message: "JWS Decode Failed" };

  const notificationType = payload.notificationType;
  const subtype = payload.subtype;
  const envName = payload.data?.environment || "Production";

  console.log(`Received: ${notificationType} | ${subtype}`);

  // 2. 获取显示文案
  const eventName = getRevenueEventName(notificationType, subtype);
  if (!eventName) {
    // 如果不是收入事件，默默忽略
    return { status: "ignored", message: `Non-revenue event: ${notificationType}` };
  }

  // 3. 解码第二层 (获取产品ID)
  let productId = "未知产品";
  try {
    if (payload.data && payload.data.signedTransactionInfo) {
      const transactionInfo = decodeJWS(payload.data.signedTransactionInfo);
      if (transactionInfo && transactionInfo.productId) {
        productId = transactionInfo.productId;
      }
    }
  } catch (e) {
    console.error("Inner JWS error", e);
  }

  // 4. 发送 Bark
  const key = env.BARK_KEY || BARK_KEY;
  const title = (envName === "Sandbox" ? "🧪 [测试] " : "🎉 ") + `${PRODUCT_NAME} 新收入！`;
  const body = `类型：${eventName}\n产品：${productId}`;

  await sendBarkNotification(key, title, body);

  return { status: "success", message: "Notification sent to Bark" };
}

// ==================== 辅助工具函数 ====================

function decodeJWS(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 3) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += new Array(5 - pad).join('=');
    return JSON.parse(atob(base64));
  } catch (e) {
    return null;
  }
}

function getRevenueEventName(type, subtype) {
  const key = `${type}|${subtype || ''}`;
  const keyTypeOnly = `${type}|`;

  const revenueEvents = {
    "SUBSCRIBED|INITIAL_BUY": "新订阅 (首次)",
    "SUBSCRIBED|RESUBSCRIBE": "重新订阅",
    "DID_RENEW|": "续订成功",
    "DID_RENEW|BILLING_RECOVERY": "续订恢复",
    "ONE_TIME_CHARGE|": "一次性购买",
    "OFFER_REDEEMED|INITIAL_BUY": "优惠首购",
    "OFFER_REDEEMED|RESUBSCRIBE": "优惠重订",
    "OFFER_REDEEMED|UPGRADE": "优惠升级"
  };

  if (revenueEvents[key]) return revenueEvents[key];
  if (revenueEvents[keyTypeOnly]) return revenueEvents[keyTypeOnly];
  return null; // 返回 null 代表不通知
}

async function sendBarkNotification(key, title, body) {
  if (!key) return;
  try {
    await fetch(`https://api.day.app/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        body: body,
        sound: "calypso",
        icon: BARK_ICON,
        group: "Revenue"
      })
    });
  } catch (e) {
    console.error("Bark Send Error", e);
  }
}

// ==================== HTML 页面模板 ====================

function renderHtml(currentUrl) {
  // 这里是你要测试的 Mock 数据
  const MOCK_PAYLOAD = {
    "signedPayload": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJub3RpZmljYXRpb25UeXBlIjoiU1VCU0NSSUJFRCIsInN1YnR5cGUiOiJJTklUSUFMX0JVWSIsIm5vdGlmaWNhdGlvblVVSUQiOiIxMjM0NTY3OC0xMjM0LTEyMzQtMTIzNC0xMjM0NTY3ODkwMTIiLCJkYXRhIjp7InNpZ25lZFRyYW5zYWN0aW9uSW5mbyI6ImV5SmhiR2NpT2lKRlV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUp3Y205a2RXTjBTV1FpT2lKamIyMHVibVY0ZEd4bFlYQnNZV0p6TG1sU2FXTm9MbkJ5WlcxcGRXMGlMQ0owY21GdWMyRmpkR2x2Ymtsa0lqb2lNakF3TURBd01ERXlNelExTmpjNE9TSXNJbTl5YVdkcGJtRnNWSEpoYm5OaFkzUnBiMjVKWkNJNklqSXdNREF3TURBeE1qTTBOVFkzT0RraUxDSndkWEpqYUdGelpVUmhkR1VpT2pFM01EQXdNREF3TURBd01EQXNJbTl5YVdkcGJtRnNVSFZ5WTJoaGMyVkVZWFJsSWpveE56QXdNREF3TURBd01EQXdmUS5mYWtlX3NpZ25hdHVyZV9pbm5lciJ9LCJ2ZXJzaW9uIjoiMi4wIiwic2lnbmVkRGF0ZSI6MTcwMDAwMDAwMDAwMH0.fake_signature_outer"
  };

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apple Notification Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f5f5f7; color: #1d1d1f; padding: 20px; }
    .card { background: white; padding: 40px; border-radius: 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 500px; width: 100%; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { color: #86868b; margin-bottom: 20px; }
    .status { display: inline-block; background: #e3f5e6; color: #168030; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .url-box { background: #f5f5f7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 2px dashed #d2d2d7; }
    .url-box h3 { font-size: 14px; color: #1d1d1f; margin: 0 0 10px 0; font-weight: 600; }
    .url-box p { font-size: 11px; color: #86868b; margin-bottom: 10px; }
    .url-display { display: flex; flex-direction: row; align-items: center; gap: 10px; }
    .url-input { width: calc(80% - 5px); background: white; border: 1px solid #d2d2d7; border-radius: 6px; padding: 10px 12px; font-size: 12px; color: #1d1d1f; font-family: 'Monaco', 'Menlo', monospace; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.5; }
    .copy-btn { width: 20%; background: #0071e3; color: white; border: none; padding: 10px 8px; font-size: 13px; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
    .copy-btn:hover { background: #0077ed; }
    .copy-btn:active { transform: scale(0.95); }
    .copy-btn.copied { background: #168030; }
    button { background: #0071e3; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 980px; cursor: pointer; transition: all 0.2s; width: 100%; }
    button:hover { background: #0077ed; transform: scale(1.02); }
    button:active { transform: scale(0.98); }
    button:disabled { background: #ccc; cursor: wait; }
    .log { margin-top: 20px; font-size: 12px; color: #666; text-align: left; background: #f5f5f7; padding: 10px; border-radius: 8px; display: none; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status">● 服务运行中 (Active)</div>
    <h1>Apple 通知转发器</h1>
    <p>后端已就绪，可以接收 App Store Server Notifications V2。</p>

    <div class="url-box">
      <h3>📋 配置 URL</h3>
      <p>请将下方 URL 复制到 App Store Connect 的服务器通知配置中</p>
      <div class="url-display">
        <div class="url-input" id="notificationUrl">${currentUrl}</div>
        <button class="copy-btn" onclick="copyUrl()">复制</button>
      </div>
    </div>

    <button id="testBtn" onclick="sendTest()">发送测试通知</button>
    <div id="logArea" class="log"></div>
  </div>

  <script>
    function copyUrl() {
      const urlText = document.getElementById('notificationUrl').innerText;
      const btn = event.target;

      navigator.clipboard.writeText(urlText).then(() => {
        const originalText = btn.innerText;
        btn.innerText = '已复制 ✓';
        btn.classList.add('copied');

        setTimeout(() => {
          btn.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择并复制');
      });
    }

    async function sendTest() {
      const btn = document.getElementById('testBtn');
      const log = document.getElementById('logArea');
      
      btn.disabled = true;
      btn.innerText = "发送中...";
      log.style.display = 'none';

      const payload = ${JSON.stringify(MOCK_PAYLOAD)};

      try {
        // 发送 POST 请求给当前页面 URL
        const response = await fetch("${currentUrl}", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (response.ok) {
          btn.innerText = "发送成功 ✅";
          log.innerHTML = "<strong>后端返回:</strong><br/>" + JSON.stringify(result, null, 2);
          log.style.display = 'block';
          // 3秒后恢复按钮
          setTimeout(() => { btn.disabled = false; btn.innerText = "再次发送测试通知"; }, 3000);
        } else {
          throw new Error(result.message || "Unknown Error");
        }
      } catch (e) {
        btn.innerText = "发送失败 ❌";
        log.innerHTML = "<strong>错误:</strong> " + e.message;
        log.style.display = 'block';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
  `;
}
