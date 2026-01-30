const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 ---
const FILE_PATH = '/tmp'; // Railway 推荐使用绝对路径
const PORT = process.env.PORT || 8080; // Railway 默认通常是 8080
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9';
const ARGO_PORT = 8001;
const CFIP = 'cdns.doon.eu.org';
const CFPORT = 443;

const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const configPath = path.join(FILE_PATH, 'config.json');

// 确保目录存在
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// 生成配置文件 (XHTTP 模式)
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [{
      port: ARGO_PORT, protocol: 'vless',
      settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ path: "/vless-argo", dest: 3002 }] },
      streamSettings: { network: 'tcp' }
    }, {
      port: 3002, listen: "127.0.0.1", protocol: "vless",
      settings: { clients: [{ id: UUID }], decryption: "none" },
      streamSettings: { 
        network: "xhttp", 
        xhttpSettings: { path: "/vless-argo", mode: "packet-up", extra: { alpn: ["h2", "http/1.1"] } } 
      }
    }],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function downloadFile(url, savePath) {
  return axios({ method: 'get', url, responseType: 'stream' }).then(res => {
    return new Promise((resolve, reject) => {
      res.data.pipe(fs.createWriteStream(savePath)).on('finish', resolve).on('error', reject);
    });
  });
}

// 启动服务
async function startserver() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    console.log(`[System] Downloading components for ${arch}...`);
    
    await Promise.all([
      downloadFile(`${baseUrl}/web`, webPath),
      downloadFile(`${baseUrl}/bot`, botPath)
    ]);

    fs.chmodSync(webPath, 0o777);
    fs.chmodSync(botPath, 0o777);

    // 使用非 nohup 模式或确保进程在后台持续运行
    exec(`${webPath} -c ${configPath} > /dev/null 2>&1 &`);
    
    const argoCmd = `tunnel --no-autoupdate run --token ${ARGO_AUTH}`;
    exec(`${botPath} ${argoCmd} > /dev/null 2>&1 &`);

    console.log("XHTTP Core & Argo Tunnel started.");
  } catch (err) {
    console.error("Critical Error:", err);
  }
}

app.get("/", (req, res) => res.send("2026 XHTTP Service Running"));

// 启动 Express 并保持进程
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startserver();
});
