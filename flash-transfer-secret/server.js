const express = require('express');
const multer = require('multer');
const { customAlphabet, nanoid } = require('nanoid');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const https = require('https');
const basicAuth = require('express-basic-auth');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = 443;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'files_db.json');
const LOG_FILE = path.join(__dirname, 'upload_access.log');
const EXPIRY_TIME = 24 * 60 * 60 * 1000;

// --- 安全配置区 ---
const ALGORITHM = 'aes-256-cbc'; 
const SECRET_KEY = crypto.scryptSync('my-very-secret-key', 'salt-string', 32);
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'your-password-must-change-it'; 
const API_KEY = 'sk-flash-' + nanoid(16); // 启动时生成，可在日志页查看

const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 4);

// 高级日志写入函数
async function writeLog(ip, action, details) {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const rawLog = `[${timestamp}] IP: ${ip} | ACTION: ${action} | ${details}\n`;
    
    // 控制台彩色实时显示
    const colors = { "API_UP": "\x1b[36m", "WEB_UP": "\x1b[32m", "DOWNLOAD": "\x1b[34m", "DELETE": "\x1b[31m", "AUTO_CLEAN": "\x1b[33m" };
    console.log(`\x1b[90m[${timestamp}]\x1b[0m ${colors[action] || ""}${action.padEnd(10)}\x1b[0m | ${ip.padEnd(15)} | ${details}`);
    
    await fs.appendFile(LOG_FILE, rawLog);
}

// --- 初始化 ---
fs.ensureDirSync(UPLOADS_DIR);
if (!fs.existsSync(DB_FILE)) fs.writeJsonSync(DB_FILE, {});

let httpsOptions;
try {
    httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };
} catch (e) {
    console.error("❌ 证书加载失败，请检查 key.pem 和 cert.pem");
    process.exit(1);
}

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 2048 * 1024 * 1024 } });
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 权限校验 ---
const apiAuth = (req, res, next) => {
    if (req.headers['x-api-key'] === API_KEY) return next();
    res.status(401).json({ status: "error", message: "API Key 校验失败" });
};
const adminAuth = basicAuth({ users: { [ADMIN_USER]: ADMIN_PASS }, challenge: true });

// --- 核心上传逻辑 ---
async function processFileUpload(req, channel) {
    const fileId = nanoid(8);
    const accessCode = generateCode();
    const fileNameOnDisk = nanoid(12) + '.enc';
    const deleteToken = nanoid(12);
    const targetPath = path.join(UPLOADS_DIR, fileNameOnDisk);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
    const writeStream = fs.createWriteStream(targetPath);
    writeStream.write(iv);
    await pipeline(fs.createReadStream(req.file.path), cipher, writeStream);
    await fs.remove(req.file.path);

    const safeName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const db = await fs.readJson(DB_FILE);
    const sizeVal = req.file.size > 1024*1024*1024 ? (req.file.size/1024/1024/1024).toFixed(2)+' GB' : (req.file.size/1024/1024).toFixed(2)+' MB';
    
    db[fileId] = { id: fileId, originalName: safeName, filename: fileNameOnDisk, expiry: Date.now() + EXPIRY_TIME, accessCode, deleteToken, size: sizeVal };
    await fs.writeJson(DB_FILE, db);

    // 记录详细日志
    await writeLog(req.ip, channel, `真实名: ${safeName} | 加密名: ${fileNameOnDisk} | 大小: ${sizeVal}`);
    
    return { fileId, accessCode, safeName, deleteToken, fileNameOnDisk, sizeVal };
}

// 1. API 上传
app.post('/api/upload', apiAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '无文件' });
        const r = await processFileUpload(req, "API_UP");
        res.json({ status: "success", data: { download_url: `https://${req.get('host')}/view/${r.fileId}`, access_code: r.accessCode, file_name: r.safeName } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. 网页上传
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '文件为空' });
        const r = await processFileUpload(req, "WEB_UP");
        res.json({ downloadUrl: `https://${req.get('host')}/view/${r.fileId}`, accessCode: r.accessCode, deleteUrl: `https://${req.get('host')}/delete/${r.fileId}/${r.deleteToken}` });
    } catch (err) { res.status(500).json({ error: '上传失败' }); }
});

// 3. 下载校验
app.post('/verify/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const file = db[req.params.id];
        if (file && file.accessCode === (req.body.code || '').trim().toUpperCase()) {
            const filePath = path.join(UPLOADS_DIR, file.filename);
            const iv = Buffer.alloc(16);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, iv, 0, 16, 0);
            fs.closeSync(fd);
            
            // 记录下载日志
            await writeLog(req.ip, "DOWNLOAD", `真实名: ${file.originalName} | 加密名: ${file.filename} | 大小: ${file.size}`);
            
            const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
            await pipeline(fs.createReadStream(filePath, { start: 16 }), decipher, res);
        } else {
            res.send('<script>alert("提取码错误");history.back();</script>');
        }
    } catch (e) { res.status(500).send('下载异常'); }
});

// 4. 销毁
app.get('/delete/:id/:token', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const file = db[req.params.id];
    if (file && file.deleteToken === req.params.token) {
        const details = `真实名: ${file.originalName} | 加密名: ${file.filename} | 大小: ${file.size}`;
        await fs.remove(path.join(UPLOADS_DIR, file.filename)).catch(()=>{});
        delete db[req.params.id];
        await fs.writeJson(DB_FILE, db);
        await writeLog(req.ip, "DELETE", details);
        return res.send(`<body style="font-family:sans-serif;text-align:center;padding:50px;background:#fff5f5;"><h2 style="color:#e53e3e;">✅ 销毁成功</h2><p>文件 <strong>${file.originalName}</strong> 已物理抹除。</p><br><a href="/" style="display:inline-block;background:#3182ce;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">返回首页</a></body>`);
    }
    res.send('凭证无效');
});

// 5. 增强日志页面
app.get('/admin/logs', adminAuth, async (req, res) => {
    const logs = await fs.readFile(LOG_FILE, 'utf8').catch(()=>"暂无日志");
    res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><title>管理后台</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-100 p-4 font-mono text-sm">
            <div class="max-w-6xl mx-auto">
                <div class="bg-indigo-900 text-white p-6 rounded-t-3xl shadow-xl">
                    <h1 class="text-xl font-bold">闪传专业版管理系统</h1>
                    <div class="mt-4 p-4 bg-indigo-800 rounded-xl border border-indigo-700">
                        <p class="text-[10px] text-indigo-300 uppercase font-black mb-1">大模型 API KEY (Header: X-API-Key)</p>
                        <code class="text-lg font-bold select-all text-yellow-400">${API_KEY}</code>
                    </div>
                </div>
                <div class="bg-white shadow-xl rounded-b-3xl overflow-hidden border border-slate-200">
                    <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-500 flex justify-between">
                        <span>系统实时日志 (最新记录在前)</span>
                        <button onclick="location.reload()" class="text-indigo-600 hover:scale-105 transition-transform">刷新日志</button>
                    </div>
                    <div class="p-6 overflow-auto max-h-[650px] space-y-1">
                        ${logs.split('\n').reverse().map(line => {
                            if(!line.trim()) return '';
                            let color = "text-slate-600";
                            if(line.includes("API_UP")) color = "text-cyan-600 font-bold";
                            if(line.includes("WEB_UP")) color = "text-emerald-600 font-bold";
                            if(line.includes("DOWNLOAD")) color = "text-blue-600";
                            if(line.includes("DELETE")) color = "text-red-500";
                            if(line.includes("AUTO_CLEAN")) color = "text-orange-500 italic";
                            return `<div class="py-2 border-b border-slate-50 hover:bg-slate-50 transition-colors ${color}">${line}</div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        </body></html>
    `);
});

// 提取码输入页 (UI 保持)
app.get('/view/:id', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const file = db[req.params.id];
    if (!file) return res.status(404).send('链接已过期');
    res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-950 flex items-center justify-center min-h-screen text-slate-200">
            <div class="bg-slate-900 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm border border-slate-800 text-center">
                <div class="text-4xl mb-4">🔐</div>
                <h2 class="text-xl font-bold text-white mb-2">安全提取</h2>
                <p class="text-slate-400 text-xs mb-6">文件名：${file.originalName}<br>大小：${file.size}</p>
                <form action="/verify/${req.params.id}" method="POST">
                    <input name="code" placeholder="输入4位提取码" maxlength="4" autofocus required class="w-full bg-black border border-slate-700 p-4 rounded-2xl text-center text-2xl font-mono mb-4 outline-none focus:border-indigo-500 text-indigo-400 uppercase">
                    <button class="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700">解密并下载</button>
                </form>
            </div>
        </body></html>
    `);
});

// 定时任务 (自动清理也记录详细日志)
setInterval(async () => {
    const db = await fs.readJson(DB_FILE);
    const now = Date.now();
    let changed = false;
    for (const id in db) {
        if (now > db[id].expiry) {
            const f = db[id];
            await fs.remove(path.join(UPLOADS_DIR, f.filename)).catch(()=>{});
            await writeLog("SYSTEM", "AUTO_CLEAN", `真实名: ${f.originalName} | 加密名: ${f.filename} | 大小: ${f.size}`);
            delete db[id];
            changed = true;
        }
    }
    if (changed) await fs.writeJson(DB_FILE, db);
}, 600000);

https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.clear();
    console.log(`\n🚀 闪传专业版已启动 | 管理后台: https://localhost:${PORT}/admin/logs\n`);
});