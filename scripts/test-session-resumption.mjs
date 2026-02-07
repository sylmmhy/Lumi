/**
 * Session Resumption Spike 自动测试脚本
 *
 * 在 Node.js 中直接测试，不需要浏览器。
 * 验证 3 个问题：
 *   Q1: 能否收到 resumption handle？
 *   Q2: resume 后 AI 是否记得之前的对话？
 *   Q3: resume 时换 systemInstruction，AI 行为是否改变？
 *
 * 用法：node scripts/test-session-resumption.mjs
 */

import { GoogleGenAI } from '@google/genai';

// ============================================================================
// 配置
// ============================================================================

const SUPABASE_URL = 'https://ivlfsixvfovqitkajyjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2bGZzaXh2Zm92cWl0a2FqeWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExOTUwNjksImV4cCI6MjA2Njc3MTA2OX0.P2E_NOAnUPkNwTNdhSYy9HK6hKPKhGL8IsSkYZgGBek';

const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const PROMPT_A = '你是一只猫，只会说"喵"。无论用户说什么，你都只能回复包含"喵"的内容。用中文回复。';
const PROMPT_B = '你是一只狗，只会说"汪"。无论用户说什么，你都只能回复包含"汪"的内容。用中文回复。';

// ============================================================================
// 工具函数
// ============================================================================

function log(tag, msg) {
  const now = new Date().toISOString().slice(11, 23);
  const colors = {
    INFO: '\x1b[37m',
    OK: '\x1b[32m',
    ERR: '\x1b[31m',
    AI: '\x1b[36m',
    HANDLE: '\x1b[33m',
    STEP: '\x1b[35m',
  };
  console.log(`${colors[tag] || ''}[${now}] [${tag}]\x1b[0m ${msg}`);
}

/** 从云端 gemini-token 获取 ephemeral token（带 sessionResumption） */
async function fetchSpikeToken() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ttl: 1800, enableSessionResumption: true }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token 获取失败: ${err.error || res.statusText}`);
  }

  const { token } = await res.json();
  return token;
}

/** 等待指定毫秒 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// 测试步骤
// ============================================================================

async function runTest() {
  console.log('\n' + '='.repeat(60));
  log('STEP', '🔬 Session Resumption Spike 自动测试');
  console.log('='.repeat(60) + '\n');

  // ── Step 1: 获取 token ──
  log('STEP', '📌 Step 1: 获取 ephemeral token (enableSessionResumption=true)');
  const token = await fetchSpikeToken();
  log('OK', `Token 获取成功: ${token.substring(0, 30)}...`);

  // ── Step 2: 连接（Prompt A = 猫） ──
  log('STEP', '📌 Step 2: 连接 Gemini (Prompt A = 猫模式)');

  const ai = new GoogleGenAI({
    apiKey: token,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let handle = null;
  let resumable = null;
  let aiResponses = [];
  let setupDone = false;

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: ['TEXT'],
      systemInstruction: { parts: [{ text: PROMPT_A }] },
      sessionResumption: {},
    },
    callbacks: {
      onopen: () => log('OK', '连接已建立'),
      onmessage: (msg) => {
        // 打印所有消息的顶级 key，帮助调试
        const keys = Object.keys(msg);
        log('INFO', `[MSG keys] ${keys.join(', ')}`);

        // 处理 sessionResumptionUpdate（尝试多种可能的字段名）
        const resumptionUpdate = msg.sessionResumptionUpdate
          || msg.session_resumption_update
          || msg.sessionResumption;
        if (resumptionUpdate) {
          const newHandle = resumptionUpdate.newHandle || resumptionUpdate.new_handle;
          const isResumable = resumptionUpdate.resumable;
          if (newHandle) {
            handle = newHandle;
            log('HANDLE', `Handle 收到: ${handle.substring(0, 50)}...`);
          }
          if (isResumable !== undefined) {
            resumable = isResumable;
            log('HANDLE', `Resumable: ${isResumable}`);
          }
          log('HANDLE', `完整 update: ${JSON.stringify(resumptionUpdate).substring(0, 200)}`);
        }
        // 处理 setupComplete
        if (msg.setupComplete) {
          setupDone = true;
          log('OK', 'Setup 完成');
          log('INFO', `setupComplete 内容: ${JSON.stringify(msg.setupComplete)}`);
        }
        // 处理 AI 文本回复
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.text) {
              aiResponses.push(part.text);
              log('AI', `回复: ${part.text}`);
            }
          }
        }
        if (msg.serverContent?.turnComplete) {
          log('INFO', '--- AI 回复完毕 ---');
        }
      },
      onerror: (e) => log('ERR', `错误: ${e.message || e}`),
      onclose: () => log('INFO', '连接已关闭'),
    },
  });

  // 等待 setup 完成
  for (let i = 0; i < 50 && !setupDone; i++) await sleep(200);
  if (!setupDone) { log('ERR', 'Setup 超时'); return; }

  // ── Step 3: 发送消息 ──
  log('STEP', '📌 Step 3: 发送 "你好"');
  aiResponses = [];

  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: '你好' }] }],
    turnComplete: true,
  });

  // 等待 AI 回复（最多 15 秒）
  for (let i = 0; i < 75 && aiResponses.length === 0; i++) await sleep(200);
  await sleep(2000); // 多等一下确保回复完整

  const response1 = aiResponses.join('');
  log('INFO', `完整回复: "${response1}"`);

  // ── Step 4: 断开 ──
  log('STEP', '📌 Step 4: 断开连接');
  session.close();
  await sleep(1000);

  // ── Q1 验证 ──
  console.log('\n' + '-'.repeat(60));
  if (handle) {
    log('OK', `✅ Q1 通过: 收到 handle (${handle.substring(0, 40)}...)`);
  } else {
    log('ERR', '❌ Q1 失败: 没有收到 handle');
    console.log('-'.repeat(60) + '\n');
    return;
  }
  console.log('-'.repeat(60) + '\n');

  // ── Step 5: Resume（Prompt B = 狗） ──
  log('STEP', '📌 Step 5: 获取新 token 并 Resume (Prompt B = 狗模式)');
  const token2 = await fetchSpikeToken();
  log('OK', `新 Token 获取成功`);

  const ai2 = new GoogleGenAI({
    apiKey: token2,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  aiResponses = [];
  setupDone = false;
  let resumeHandle = null;

  const session2 = await ai2.live.connect({
    model: MODEL,
    config: {
      responseModalities: ['TEXT'],
      systemInstruction: { parts: [{ text: PROMPT_B }] },
      sessionResumption: { handle },
    },
    callbacks: {
      onopen: () => log('OK', 'Resume 连接已建立'),
      onmessage: (msg) => {
        if (msg.sessionResumptionUpdate) {
          if (msg.sessionResumptionUpdate.newHandle) {
            resumeHandle = msg.sessionResumptionUpdate.newHandle;
            log('HANDLE', `Resume 新 Handle: ${resumeHandle.substring(0, 50)}...`);
          }
          if (msg.sessionResumptionUpdate.resumable !== undefined) {
            log('HANDLE', `Resume Resumable: ${msg.sessionResumptionUpdate.resumable}`);
          }
        }
        if (msg.setupComplete) {
          setupDone = true;
          log('OK', 'Resume Setup 完成');
        }
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.text) {
              aiResponses.push(part.text);
              log('AI', `回复: ${part.text}`);
            }
          }
        }
        if (msg.serverContent?.turnComplete) {
          log('INFO', '--- AI 回复完毕 ---');
        }
      },
      onerror: (e) => log('ERR', `Resume 错误: ${e.message || e}`),
      onclose: () => log('INFO', 'Resume 连接已关闭'),
    },
  });

  // 等待 setup
  for (let i = 0; i < 50 && !setupDone; i++) await sleep(200);
  if (!setupDone) { log('ERR', 'Resume Setup 超时'); return; }

  // ── Step 6: 发送测试消息 ──
  log('STEP', '📌 Step 6: 发送 "我刚才说了什么？"');
  aiResponses = [];

  session2.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: '我刚才说了什么？' }] }],
    turnComplete: true,
  });

  // 等待回复
  for (let i = 0; i < 75 && aiResponses.length === 0; i++) await sleep(200);
  await sleep(3000);

  const response2 = aiResponses.join('');
  log('INFO', `完整回复: "${response2}"`);

  session2.close();
  await sleep(500);

  // ============================================================================
  // 结果汇总
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  log('STEP', '📊 测试结果汇总');
  console.log('='.repeat(60));

  // Q1
  const q1Pass = !!handle;
  console.log(`\n  ${q1Pass ? '✅' : '❌'} Q1: 能否收到 resumption handle？`);
  console.log(`     → ${q1Pass ? '是，收到了 handle' : '否，未收到'}`);

  // Q2: AI 是否记得之前的对话
  const remembers = response2.includes('你好') || response2.includes('喵') || response2.includes('刚才');
  console.log(`\n  ${remembers ? '✅' : '⚠️'} Q2: resume 后 AI 是否记得之前的对话？`);
  console.log(`     → AI 回复: "${response2}"`);
  console.log(`     → ${remembers ? '是，AI 似乎记得上下文' : '需要人工判断：看 AI 回复是否提到了之前的内容'}`);

  // Q3: AI 行为是否改变（猫→狗）
  const hasWang = response2.includes('汪');
  const hasMiao = response2.includes('喵');
  const behaviorChanged = hasWang && !hasMiao;
  console.log(`\n  ${behaviorChanged ? '✅' : hasMiao && hasWang ? '⚠️' : '❌'} Q3: resume 时换 systemInstruction，AI 行为是否改变？`);
  console.log(`     → 包含"汪": ${hasWang ? '是' : '否'}`);
  console.log(`     → 包含"喵": ${hasMiao ? '是' : '否'}`);
  if (behaviorChanged) {
    console.log(`     → ✅ AI 从猫变成了狗，systemInstruction 切换生效`);
  } else if (hasMiao && !hasWang) {
    console.log(`     → ❌ AI 仍然是猫，systemInstruction 切换未生效`);
  } else {
    console.log(`     → ⚠️ 需要人工判断`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// 执行
// ============================================================================
runTest().catch(err => {
  log('ERR', `测试失败: ${err.message}`);
  console.error(err);
  process.exit(1);
});
