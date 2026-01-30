const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 变量配置 (与你截图中的一致) ---
const PORT = process.env.PORT || 8080;
const FILE_PATH = '/tmp'; // 必须使用绝对路径
const ARGO_PORT = 8001;
const UUID = process.env.UUID || '87491c56-73a4-4995-8d6f-c067d24dee47';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'oko.kkm.qzz.io';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTI3MzM2ZmM3MDlmYWQ4OWI4ZmQ1OTE0MTI1YWFmMmYiLCJ0IjoiYjI3MzllY2UtZTUzMy00ZTQ1LWEyODItMGNhMDUyYjZmNDNkIiwicyI6IlpEZzRNRGczWm1JdFl6UmtNaTAwTTJSa0xUbGlNak10T0Rkak1HRmtaalkzT0dabCJ9';

const webPath = path.join(FILE_PATH, 'web_2026');
const botPath = path.join(FILE_PATH, 'argo_bot');
const configPath = path.join(FILE_PATH, 'config.json');

if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// 1. 核心：立即启动 Web 服务，防止 Railway 重启容器
app.get("/", (req, res) => res.send("2026 XHTTP Service Active"));
app.get("/sub", (req, res) => {
    const vless = `vless://${UUID}@cdns.doon.eu.org:443?encryption=none&security=tls&sni=${ARGO_DOMAIN}&type=xhttp&mode=packet-up&host=${ARGO_DOMAIN}&path=%2Fvless#Railway_VLESS`;
    res.send(Buffer.from(vless).toString('base64'));
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
    bootstrap(); // Web 服务跑起来后再去下载运行核心
});

// 2. 配置文件生成
async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [{
            port: ARGO_PORT, protocol: 'vless',
            settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ path: "/vless", dest: 3002 }] },
            streamSettings: { network: 'tcp' }
        }, {
            port: 3002, listen: "127.0.0.1", protocol: "vless",
            settings: { clients: [{ id: UUID }], decryption: "none" },
            streamSettings: { network: "xhttp", xhttpSettings: { path: "/vless", mode: "packet-up" } }
        }],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// 3. 异步部署逻辑
async function bootstrap() {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
    const baseUrl = `https://${arch}.ssss.nyc.mn`;

    try {
        await generateConfig();
        // 顺序下载文件
        console.log(`Downloading for ${arch}...`);
        const files = [
            { url: `${baseUrl}/web`, path: webPath },
            { url: `${baseUrl}/bot`, path: botPath }
        ];

        for (const file of files) {
            const res = await axios({ method: 'get', url: file.url, responseType: 'stream' });
            const writer = fs.createWriteStream(file.path);
            res.data.pipe(writer);
            await new Promise((resolve) => writer.on('finish', resolve));
            fs.chmodSync(file.path, 0o777);
        }

        // 启动核心进程
        exec(`${webPath} -c ${configPath} > /dev/null 2>&1 &`);
        const argoCmd = `tunnel --no-autoupdate run --token ${ARGO_AUTH}`;
        exec(`${botPath} ${argoCmd} > /dev/null 2>&1 &`);
        console.log("2026 XHTTP Services deployed successfully.");
    } catch (err) { console.error("Bootstrap Error:", err); }
}
