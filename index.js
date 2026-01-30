const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || './tmp';   
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        
const UUID = process.env.UUID || 'e6d855cd-c028-41cb-be7e-93f2d89d2b9e'; 
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        
const NEZHA_KEY = process.env.NEZHA_KEY || '';              
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';          
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9';              
const ARGO_PORT = process.env.ARGO_PORT || 8001;            
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';        
const CFPORT = process.env.CFPORT || 443;                   
const NAME = process.env.NAME || 'komss';                        

// 内部变量
const webName = 'xray_web'; 
const botName = 'argo_bot'; 
const webPath = path.join(FILE_PATH, webName);
const botPath = path.join(FILE_PATH, botName);
const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');

// 初始化目录
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// --- 核心逻辑 1: 生成 2026 版 Xray 配置文件 (XHTTP 模式) ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, 
        protocol: 'vless', 
        settings: { 
          clients: [{ id: UUID }], 
          decryption: 'none', 
          fallbacks: [{ path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }] 
        }, 
        streamSettings: { network: 'tcp' } 
      },
      // 适配 v25+ 的 xhttp 协议
      { 
        port: 3002, listen: "127.0.0.1", protocol: "vless", 
        settings: { clients: [{ id: UUID }], decryption: "none" }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/vless-argo", mode: "packet-up", extra: { alpn: ["h2", "http/1.1"] } } 
        } 
      },
      { 
        port: 3003, listen: "127.0.0.1", protocol: "vmess", 
        settings: { clients: [{ id: UUID }] }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/vmess-argo", mode: "packet-up" } 
        } 
      }
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 核心逻辑 2: 生成适配 2026 客户端的订阅内容 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  // 生成 vless xhttp 链接
  const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Fvless-argo#${nodeName}_2026`;

  // 生成 vmess xhttp 内容
  const vmessJson = { v: '2', ps: `${nodeName}_2026`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'none', host: argoDomain, path: '/vmess-argo', tls: 'tls', sni: argoDomain, alpn: 'h2', fp: 'firefox'};
  const vmessLink = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;

  const subTxt = `${vlessLink}\n\n${vmessLink}`;
  const encodedSub = Buffer.from(subTxt).toString('base64');
  
  fs.writeFileSync(subPath, encodedSub);
  console.log(`\n--- 2026 NEW SUB CONTENT ---\n${encodedSub}\n---------------------------\n`);

  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(encodedSub);
  });
}

// --- 通用辅助工具 ---
async function getMetaInfo() {
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    return `${res.data.country_code}_${res.data.org.split(' ')[0]}`;
  } catch (e) { return 'Global_Node'; }
}

function downloadFile(url, savePath) {
  return axios({ method: 'get', url, responseType: 'stream' }).then(res => {
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(savePath);
      res.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  });
}

// --- 启动流程 ---
async function startserver() {
  console.log("Starting 2026-Ready Server...");
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    
    // 下载依赖
    console.log(`Downloading dependencies for ${arch}...`);
    await Promise.all([
      downloadFile(`${baseUrl}/web`, webPath),
      downloadFile(`${baseUrl}/bot`, botPath)
    ]);

    fs.chmodSync(webPath, 0o775);
    fs.chmodSync(botPath, 0o775);

    // 启动 Xray
    exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
    console.log("Xray-core (XHTTP mode) started.");

    // 启动 Argo
    const argoArgs = ARGO_AUTH.length > 50 
      ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}` 
      : `tunnel --no-autoupdate --logfile ${FILE_PATH}/boot.log --url http://localhost:${ARGO_PORT}`;
    
    exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
    console.log("Argo Tunnel starting...");

    // 轮询等待 Argo 域名生成
    setTimeout(async () => {
      if (ARGO_DOMAIN) {
        await generateLinks(ARGO_DOMAIN);
      } else {
        const log = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf8');
        const match = log.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
        if (match) await generateLinks(match[1]);
      }
    }, 10000);

  } catch (err) { console.error("Start failed:", err); }
}

// 路由
app.get("/", (req, res) => res.send("System Active - XHTTP Ready"));

startserver();
app.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));
