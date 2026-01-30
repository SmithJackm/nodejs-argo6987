const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 (适配 Railway) ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '/tmp';   // Railway 环境建议使用 /tmp
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

// --- 核心逻辑 1: 生成 2026 版 XHTTP 三协议配置文件 ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, protocol: 'vless', 
        settings: { 
          clients: [{ id: UUID }], 
          decryption: 'none', 
          fallbacks: [
            { path: "/vless-argo", dest: 3002 }, 
            { path: "/vmess-argo", dest: 3003 },
            { path: "/trojan-argo", dest: 3004 }
          ] 
        }, 
        streamSettings: { network: 'tcp' } 
      },
      // VLESS 监听
      { 
        port: 3002, listen: "127.0.0.1", protocol: "vless", 
        settings: { clients: [{ id: UUID }], decryption: "none" }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/vless-argo", mode: "packet-up", extra: { alpn: ["h2", "http/1.1"] } } 
        } 
      },
      // VMess 监听
      { 
        port: 3003, listen: "127.0.0.1", protocol: "vmess", 
        settings: { clients: [{ id: UUID }] }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/vmess-argo", mode: "packet-up" } 
        } 
      },
      // Trojan 监听
      { 
        port: 3004, listen: "127.0.0.1", protocol: "trojan", 
        settings: { clients: [{ password: UUID }] }, 
        streamSettings: { 
          network: "xhttp", 
          xhttpSettings: { path: "/trojan-argo", mode: "packet-up" } 
        } 
      }
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 核心逻辑 2: 生成三协议订阅链接 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  // 1. VLESS Link
  const vless = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Fvless-argo#${nodeName}_VLESS_2026`;
  
  // 2. VMess Link
  const vmessJson = { v: '2', ps: `${nodeName}_VMess_2026`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'none', host: argoDomain, path: '/vmess-argo', tls: 'tls', sni: argoDomain, mode: 'packet-up'};
  const vmess = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;
  
  // 3. Trojan Link
  const trojan = `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet-up&host=${argoDomain}&path=%2Ftrojan-argo#${nodeName}_Trojan_2026`;

  const subTxt = `${vless}\n\n${vmess}\n\n${trojan}`;
  const encodedSub = Buffer.from(subTxt).toString('base64');
  
  fs.writeFileSync(subPath, encodedSub);
  console.log(`[订阅生成] 三协议节点已就绪`);

  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(encodedSub);
  });
}

// --- 核心逻辑 3: 下载与顺序启动 ---
async function startserver() {
  const arch = (os.arch() === 'arm64' || os.arch() === 'aarch64') ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;

  try
