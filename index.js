const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量 (确保在 Railway Variables 中设置) ---
const PORT = process.env.PORT || 8080;
const FILE_PATH = '/tmp'; // 强制使用 /tmp
const ARGO_PORT = 8001;
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9'; 

const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const configPath = path.join(FILE_PATH, 'config.json');

// --- 1. 生成 2026 版三协议 XHTTP 配置文件 ---
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

// --- 2. 生成订阅 (三节点全量) ---
function generateSubContent() {
  const host = ARGO_DOMAIN;
  const vless = `vless://${UUID}@cdns.doon.eu.org:443?encryption=none&security=tls&sni=${host}&type=xhttp&mode=packet-up&host=${host}&path=%2Fvless#Railway_VLESS_2026`;
  const vmessJson = { v: '2', ps: 'Railway_VMess_2026', add: 'cdns.doon.eu.org', port: '443', id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'none', host: host, path: '/vmess', tls: 'tls', sni: host, mode: 'packet-up'};
  const vmess = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;
  const trojan = `trojan://${UUID}@cdns.doon.eu.org:443?security=tls&sni=${host}&type=xhttp&mode=packet-up&host=${host}&path=%2Ftrojan#Railway_Trojan_2026`;

  return Buffer.from([vless, vmess, trojan].join('\n')).toString('base64');
}

// --- 3. 部署逻辑 ---
async function bootstrap() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    
    // 串行下载防止 Railway CPU 瞬间过载
    const webRes = await axios({ method: 'get', url: `${baseUrl}/web`, responseType: 'stream' });
    webRes.data.pipe(fs.createWriteStream(webPath));
    const botRes = await axios({ method: 'get', url: `${baseUrl}/bot`, responseType: 'stream' });
    botRes.data.pipe(fs.createWriteStream(botPath));

    setTimeout(() => {
      if (fs.existsSync(webPath)) fs.chmodSync(webPath, 0o777);
      if (fs.existsSync(botPath)) fs.chmodSync(botPath, 0o777);
      
      // 启动 Xray
      exec(`${webPath} -c ${configPath} > /dev/null 2>&1 &`);
      // 启动 Argo
      const argoCmd = ARGO_AUTH.length > 50 ? `tunnel run --token ${ARGO_AUTH}` : `tunnel --url http://localhost:${ARGO_PORT} --no-autoupdate`;
      exec(`${botPath} ${argoCmd} > /dev/null 2>&1 &`);
      
      console.log("2026 XHTTP Services deployed successfully.");
    }, 5000); // 预留 5 秒下载时间
  } catch (err) { console.error("Bootstrap Error:", err); }
}

// --- 4. Web 服务入口 (Railway 健康检查核心) ---
app.get("/", (req, res) => res.status(200).send("2026 XHTTP Service Active"));
app.get("/sub", (req, res) => res.send(generateSubContent()));

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
  bootstrap(); // 监听成功后再执行部署
});
