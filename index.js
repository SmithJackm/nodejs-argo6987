const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 变量配置 (保留你的原始变量名) ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '/tmp';   // Railway 建议使用 /tmp 目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47'; 
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        
const NEZHA_KEY = process.env.NEZHA_KEY || '';              
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';          
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9';              
const ARGO_PORT = process.env.ARGO_PORT || 8001;            
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';        
const CFPORT = process.env.CFPORT || 443;                   
const NAME = process.env.NAME || 'kossi';                        

const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const nzPath = path.join(FILE_PATH, 'nz_agent');
const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');

if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// --- 1. 生成 XHTTP 配置文件 ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, protocol: 'vless', 
        settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ path: "/vless-argo", dest: 3002 }] }, 
        streamSettings: { network: 'tcp' } 
      },
      { 
        port: 3002, listen: "127.0.0.1", protocol: "vless", 
        settings: { clients: [{ id: UUID }], decryption: "none" }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/vless-argo", mode: "packet-up", extra: { alpn: ["h2", "http/1.1"] } } 
        } 
      }
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 2. 生成订阅内容 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Fvless-argo#${nodeName}_2026`;
  const encodedSub = Buffer.from(vlessLink).toString('base64');
  fs.writeFileSync(subPath, encodedSub);
  
  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(encodedSub);
  });
}

// --- 3. 下载与启动 ---
async function startserver() {
  const arch = (os.arch() === 'arm64' || os.arch() === 'aarch64') ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    console.log(`[系统] 正在为 ${arch} 架构下载组件...`);
    await downloadFile(`${baseUrl}/web`, webPath);
    await downloadFile(`${baseUrl}/bot`, botPath);
    if (NEZHA_SERVER && NEZHA_KEY) await downloadFile(`${baseUrl}/v1`, nzPath);
    
    [webPath, botPath, nzPath].forEach(p => { if(fs.existsSync(p)) fs.chmodSync(p, 0o777); });

    // 启动顺序：Xray -> Argo
    exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
    
    setTimeout(() => {
      const argoArgs = `tunnel --no-autoupdate run --token ${ARGO_AUTH}`;
      exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
      console.log("[Argo] 隧道已启动");
    }, 3000);

    setTimeout(() => generateLinks(ARGO_DOMAIN), 10000);

  } catch (err) { console.error("部署异常:", err); }
}

function downloadFile(url, savePath) {
  return axios({ method: 'get', url, responseType: 'stream' }).then(res => {
    return new Promise((resolve, reject) => {
      res.data.pipe(fs.createWriteStream(savePath)).on('finish', resolve).on('error', reject);
    });
  });
}

async function getMetaInfo() {
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    return `${res.data.country_code}_Railway`;
  } catch (e) { return 'Global_Node'; }
}

app.get("/", (req, res) => res.send("2026 XHTTP Service is Active"));
startserver();
app.listen(PORT);
