const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 (请在 Railway 变量界面设置，或保留默认值) ---
const PORT = process.env.PORT || 8080;
const FILE_PATH = '/tmp'; // Railway 建议使用 /tmp 获取写权限
const ARGO_PORT = 26987;
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';
// 请确保填入正确的 Token 以固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9';

const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const configPath = path.join(FILE_PATH, 'config.json');

if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// --- 1. 生成 2026 版三协议 XHTTP 配置文件 ---
// 该配置将所有流量切换到最新的 XHTTP (packet-up) 模式以解决连接重置问题
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, protocol: 'vless', 
        settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ path: "/vless", dest: 3002 }, { path: "/vmess", dest: 3003 }, { path: "/trojan", dest: 3004 }] }, 
        streamSettings: { network: 'tcp' } 
      },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "xhttp", xhttpSettings: { path: "/vless", mode: "packet-up" } } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID }] }, streamSettings: { network: "xhttp", xhttpSettings: { path: "/vmess", mode: "packet-up" } } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "xhttp", xhttpSettings: { path: "/trojan", mode: "packet-up" } } }
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 2. 生成订阅 (包含 VLESS, VMess, Trojan 三个节点) ---
function generateSub() {
  const host = ARGO_DOMAIN;
  const vless = `vless://${UUID}@cdns.doon.eu.org:443?encryption=none&security=tls&sni=${host}&type=xhttp&mode=packet-up&host=${host}&path=%2Fvless#Railway_VLESS_2026`;
  const vmessJson = { v: '2', ps: 'Railway_VMess_2026', add: 'cdns.doon.eu.org', port: '443', id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'none', host: host, path: '/vmess', tls: 'tls', sni: host, mode: 'packet-up'};
  const vmess = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;
  const trojan = `trojan://${UUID}@cdns.doon.eu.org:443?security=tls&sni=${host}&type=xhttp&mode=packet-up&host=${host}&path=%2Ftrojan#Railway_Trojan_2026`;

  return Buffer.from([vless, vmess, trojan].join('\n')).toString('base64');
}

// --- 3. 部署逻辑：下载并运行核心 ---
async function bootstrap() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    console.log(`[System] Downloading components for ${arch}...`);
    
    // 下载 Xray 核心和 Argo 隧道
    const download = async (url, dest) => {
      const res = await axios({ method: 'get', url, responseType: 'stream' });
      res.data.pipe(fs.createWriteStream(dest));
      await new Promise(r => res.data.on('end', r));
      fs.chmodSync(dest, 0o777);
    };

    await download(`${baseUrl}/web`, webPath);
    await download(`${baseUrl}/bot`, botPath);

    // 延迟启动确保权限生效
    setTimeout(() => {
      exec(`${webPath} -c ${configPath} > /dev/null 2>&1 &`);
      const argoCmd = ARGO_AUTH.length > 50 ? `tunnel run --token ${ARGO_AUTH}` : `tunnel --url http://localhost:${ARGO_PORT} --no-autoupdate`;
      exec(`${botPath} ${argoCmd} > /dev/null 2>&1 &`);
      console.log("XHTTP core processes started.");
    }, 3000);

  } catch (err) { console.error("Bootstrap Error:", err); }
}

// --- 4. Web 服务入口 (解决 Railway 健康检查问题) ---
app.get("/", (req, res) => res.status(200).send("2026 XHTTP Service Active"));
app.get("/sub", (req, res) => res.send(generateSub()));

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
  bootstrap(); // 在 Express 监听成功后再下载并运行代理进程
});
