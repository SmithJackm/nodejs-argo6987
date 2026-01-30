const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 ---
// 请在 Railway 的项目设置 (Variables) 中填入这些值，或保留默认值
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '/tmp';   // Railway 建议使用 /tmp 目录进行临时写入
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000; // Railway 动态分配的端口
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47'; 
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        
const NEZHA_KEY = process.env.NEZHA_KEY || '';              
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io'; // 您的固定域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9'; // 您的 Argo Token
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

// 确保运行目录存在
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// --- 核心逻辑 1: 生成 2026 版 XHTTP 配置文件 ---
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
          fallbacks: [{ path: "/vless-argo", dest: 3002 }] 
        }, 
        streamSettings: { network: 'tcp' } 
      },
      { 
        port: 3002, 
        listen: "127.0.0.1", 
        protocol: "vless", 
        settings: { clients: [{ id: UUID }], decryption: "none" }, 
        streamSettings: { 
          network: "xhttp", // 2026 核心推行的新传输协议，解决 WS 弃用警告
          xhttpSettings: { 
            path: "/vless-argo", 
            mode: "packet-up", // 适配高并发长连接
            extra: { alpn: ["h2", "http/1.1"] } 
          } 
        } 
      }
    ],
    outbounds: [
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" }
    ]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 核心逻辑 2: 生成适配最新客户端的订阅链接 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  // 生成符合 2026 标准的 XHTTP 订阅链接
  const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Fvless-argo#${nodeName}_2026`;
  
  const encodedSub = Buffer.from(vlessLink).toString('base64');
  fs.writeFileSync(subPath, encodedSub);
  
  console.log(`[订阅生成成功] 域名: ${argoDomain}`);

  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(encodedSub);
  });
}

// --- 核心逻辑 3: 下载、授权与顺序启动 ---
async function startserver() {
  const arch = (os.arch() === 'arm64' || os.arch() === 'aarch64') ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try {
    await generateConfig();
    
    console.log(`[系统] 正在下载组件 (${arch})...`);
    const tasks = [
      downloadFile(`${baseUrl}/web`, webPath),
      downloadFile(`${baseUrl}/bot`, botPath)
    ];
    if (NEZHA_SERVER && NEZHA_KEY) tasks.push(downloadFile(`${baseUrl}/v1`, nzPath));
    
    await Promise.all(tasks);

    // 提升文件执行权限
    [webPath, botPath, nzPath].forEach(p => {
      if (fs.existsSync(p)) {
        fs.chmodSync(p, 0o777); 
      }
    });

    // 1. 启动哪吒监控 (V1 模式)
    if (NEZHA_SERVER && NEZHA_KEY) {
      exec(`nohup ${nzPath} -s ${NEZHA_SERVER} -p ${NEZHA_KEY} --tls --disable-auto-update >/dev/null 2>&1 &`);
      console.log("[哪吒] Agent 已尝试启动");
    }

    // 2. 启动 Xray 核心
    exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
    console.log("[Xray] 核心已启动，模式: XHTTP");

    // 3. 延迟启动 Argo 隧道，确保后端就绪
    setTimeout(() => {
      const argoArgs = ARGO_AUTH.length > 50 
        ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}` 
        : `tunnel --no-autoupdate --logfile ${FILE_PATH}/boot.log --url http://localhost:${ARGO_PORT}`;
      exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
      console.log("[Argo] 隧道启动进程已执行");
    }, 3000);

    // 4. 自动保活访问
    if (AUTO_ACCESS && PROJECT_URL) {
      axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }).catch(() => {});
    }

    // 获取隧道域名并生成链接
    setTimeout(() => {
      if (ARGO_DOMAIN && ARGO_AUTH.length > 50) {
        generateLinks(ARGO_DOMAIN);
      } else {
        try {
          const log = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf8');
          const match = log.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
          if (match) generateLinks(match[1]);
        } catch (e) {
          console.log("[警告] 无法从日志获取 Argo 临时域名");
        }
      }
    }, 10000);

  } catch (err) { console.error("[致命错误] 启动失败:", err); }
}

// --- 工具函数 ---
async function getMetaInfo() {
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    return `${res.data.country_code}_${res.data.org.split(' ')[0]}`;
  } catch (e) { return 'Railway'; }
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

// 根路由与探针
app.get("/", (req, res) => res.send("2026 XHTTP Service is Active"));

startserver();
app.listen(PORT, () => console.log(`[Web] 订阅服务已启动，端口: ${PORT}`));
