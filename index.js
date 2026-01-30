const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 (保留你的原始变量名) ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || './tmp';   
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

// 内部执行文件路径
const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const nzPath = path.join(FILE_PATH, 'nz_agent');
const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');

if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// --- 核心逻辑 1: 生成 2026 版 XHTTP 配置文件 ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, protocol: 'vless', 
        settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }] }, 
        streamSettings: { network: 'tcp' } 
      },
      { 
        port: 3002, listen: "127.0.0.1", protocol: "vless", 
        settings: { clients: [{ id: UUID }], decryption: "none" }, 
        streamSettings: { 
          network: "xhttp", // 2026 核心推行的新传输协议
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

// --- 核心逻辑 2: 生成适配最新客户端的订阅链接 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Fvless-argo#${nodeName}_2026`;
  const vmessJson = { v: '2', ps: `${nodeName}_2026`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'none', host: argoDomain, path: '/vmess-argo', tls: 'tls', sni: argoDomain, alpn: 'h2', fp: 'firefox'};
  const vmessLink = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;

  const subTxt = `${vlessLink}\n\n${vmessLink}`;
  const encodedSub = Buffer.from(subTxt).toString('base64');
  
  fs.writeFileSync(subPath, encodedSub);
  console.log(`订阅生成成功: \n${encodedSub}`);

  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(encodedSub);
  });
}

// --- 核心逻辑 3: 下载、授权与运行 ---
async function startserver() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    
    // 自动下载组件
    console.log(`正在为 ${arch} 架构下载组件...`);
    const tasks = [
      downloadFile(`${baseUrl}/web`, webPath),
      downloadFile(`${baseUrl}/bot`, botPath)
    ];
    if (NEZHA_SERVER && NEZHA_KEY) tasks.push(downloadFile(`${baseUrl}/v1`, nzPath));
    
    await Promise.all(tasks);
    [webPath, botPath, nzPath].forEach(p => { if(fs.existsSync(p)) fs.chmodSync(p, 0o775); });

    // 1. 启动哪吒监控
    if (NEZHA_SERVER && NEZHA_KEY) {
      exec(`nohup ${nzPath} -s ${NEZHA_SERVER} -p ${NEZHA_KEY} --tls --disable-auto-update >/dev/null 2>&1 &`);
      console.log("哪吒监控已启动");
    }

    // 2. 启动 Xray (XHTTP 模式)
    exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
    console.log("Xray 核心已启动");

    // 3. 启动 Argo 隧道
    const argoArgs = ARGO_AUTH.length > 50 
      ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}` 
      : `tunnel --no-autoupdate --logfile ${FILE_PATH}/boot.log --url http://localhost:${ARGO_PORT}`;
    exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
    console.log("Argo 隧道启动中...");

    // 4. 自动保活任务
    if (AUTO_ACCESS && PROJECT_URL) {
      axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }).catch(() => {});
    }

    // 轮询获取 Argo 域名并生成订阅
    setTimeout(() => {
      if (ARGO_DOMAIN) {
        generateLinks(ARGO_DOMAIN);
      } else {
        const log = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf8');
        const match = log.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
        if (match) generateLinks(match[1]);
      }
    }, 10000);

  } catch (err) { console.error("部署失败:", err); }
}

// 辅助工具函数
async function getMetaInfo() {
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    return `${res.data.country_code}_${res.data.org.split(' ')[0]}`;
  } catch (e) { return 'Global_Node'; }
}

function downloadFile(url, savePath) {
  return axios({ method: 'get', url, responseType: 'stream' }).then(res => {
    return new Promise((resolve, reject) => {
      res.data.pipe(fs.createWriteStream(savePath)).on('finish', resolve).on('error', reject);
    });
  });
}

app.get("/", (req, res) => res.send("2026 XHTTP Service is Active"));
startserver();
app.listen(PORT);
