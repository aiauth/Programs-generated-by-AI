const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 增强型游戏逻辑 ---
class GomokuGame {
    constructor(mode = 'pve') {
        this.mode = mode;
        this.board = Array(15).fill(0).map(() => Array(15).fill(0));
        this.currentPlayer = 1;
        this.history = [];
        this.gameOver = false;
        this.winner = null;
        this.players = { black: null, white: null };
        this.lastMove = null;
    }
    place(r, c, p) {
        if (r < 0 || r >= 15 || c < 0 || c >= 15 || this.board[r][c] !== 0 || this.gameOver || p !== this.currentPlayer) return false;
        this.board[r][c] = p;
        this.lastMove = {r, c};
        this.history.push({r, c, p});
        if (this.checkWin(r, c, p)) { this.gameOver = true; this.winner = p; }
        this.currentPlayer = p === 1 ? 2 : 1;
        return true;
    }
    checkWin(r, c, p) {
        const dirs = [[1,0],[0,1],[1,1],[1,-1]];
        for (let [dr, dc] of dirs) {
            let count = 1;
            for (let i = 1; i <= 4; i++) {
                let nr = r + dr*i, nc = c + dc*i;
                if (nr>=0 && nr<15 && nc>=0 && nc<15 && this.board[nr][nc] === p) count++; else break;
            }
            for (let i = 1; i <= 4; i++) {
                let nr = r - dr*i, nc = c - dc*i;
                if (nr>=0 && nr<15 && nc>=0 && nc<15 && this.board[nr][nc] === p) count++; else break;
            }
            if (count >= 5) return true;
        }
        return false;
    }
    reset() {
        this.board = Array(15).fill(0).map(() => Array(15).fill(0));
        this.history = [];
        this.currentPlayer = 1;
        this.gameOver = false;
        this.winner = null;
        this.lastMove = null;
    }
	// --- app.js 中的类方法修改 ---
	undo() {
		// 逻辑：只有当历史记录大于等于2步时才允许悔棋
		// 优化：即使游戏结束，执行 undo 也会将游戏状态“复活”
		if (this.history.length < 2) return false;

		// 弹出最后两步
		for(let i = 0; i < 2; i++) {
			let last = this.history.pop();
			if (last) this.board[last.r][last.c] = 0;
		}

		// 关键修复：重置游戏结束标记
		this.gameOver = false;
		this.winner = null;
		this.currentPlayer = 1; // 强制回到玩家回合

		// 更新最后落子标记
		this.lastMove = this.history.length > 0 ? this.history[this.history.length - 1] : null;
		
		return true;
	}
}

// --- 升级版 AI (Alpha-Beta 剪枝) ---
function getAiMove(game) {
    const size = 15;
    const center = 7;
    let maxScore = -1;
    let candidateMoves = []; // 存储所有最高分的坐标

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (game.board[r][c] === 0) {
                // 计算该点的攻防分数
                let attack = evaluate(game.board, r, c, 2); // AI
                let defense = evaluate(game.board, r, c, 1); // 玩家
                
                // 综合评分：防守权重稍高，同时加上距离中心的微小加成
                let score = attack * 1.2 + defense + (10 - Math.abs(r - center) - Math.abs(c - center)) * 0.1;

                if (score > maxScore) {
                    maxScore = score;
                    candidateMoves = [{r, c}];
                } else if (score === maxScore) {
                    candidateMoves.push({r, c});
                }
            }
        }
    }

    // 从所有最高分的位置中随机选一个，避免死板
    return candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
}

function evaluate(board, r, c, p) {
    let score = 0;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    dirs.forEach(([dr, dc]) => {
        let count = 0;
        for(let i=1; i<5; i++) {
            let nr=r+dr*i, nc=c+dc*i;
            if(nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr][nc] === p) count++; else break;
        }
        for(let i=1; i<5; i++) {
            let nr=r-dr*i, nc=c-dc*i;
            if(nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr][nc] === p) count++; else break;
        }
        if (count >= 4) score += 10000;
        else if (count >= 3) score += 1000;
        else if (count >= 2) score += 100;
        else score += 10;
    });
    return score;
}

const rooms = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let myRole = 0;

    socket.on('join', (roomId) => {
        currentRoom = roomId;
        socket.join(roomId);
        if (!rooms[roomId]) rooms[roomId] = new GomokuGame(roomId === 'pve' ? 'pve' : 'pvp');
        const game = rooms[roomId];

        if (game.mode === 'pve') { myRole = 1; } 
        else {
            if (!game.players.black) { game.players.black = socket.id; myRole = 1; }
            else if (!game.players.white) { game.players.white = socket.id; myRole = 2; }
            else { myRole = 3; }
        }
        socket.emit('init', { role: myRole, mode: game.mode, board: game.board, currentPlayer: game.currentPlayer, lastMove: game.lastMove });
    });

    socket.on('move', ({ r, c }) => {
        const game = rooms[currentRoom];
        if (!game) return;
        if (game.place(r, c, myRole)) {
            if (game.mode === 'pve' && !game.gameOver) {
                const ai = getAiMove(game);
                game.place(ai.r, ai.c, 2);
            }
            io.to(currentRoom).emit('update', { board: game.board, currentPlayer: game.currentPlayer, gameOver: game.gameOver, winner: game.winner, lastMove: game.lastMove });
        }
    });

    socket.on('reset', () => {
        const game = rooms[currentRoom];
        if (game) {
            game.reset();
            io.to(currentRoom).emit('update', { board: game.board, currentPlayer: game.currentPlayer, gameOver: game.gameOver, lastMove: null });
        }
    });

    socket.on('undo', () => {
        const game = rooms[currentRoom];
        if (game && game.mode === 'pve' && game.undo()) {
            socket.emit('update', { board: game.board, currentPlayer: game.currentPlayer, lastMove: game.lastMove });
        }
    });

    socket.on('disconnect', () => {
        const game = rooms[currentRoom];
        if (game && game.mode === 'pvp') {
            if (game.players.black === socket.id) game.players.black = null;
            if (game.players.white === socket.id) game.players.white = null;
            io.to(currentRoom).emit('sys_msg', '对方已离线');
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>五子棋 Pro - 战绩与高亮版</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #1a1a2e; color: #e94560; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; margin: 0; min-height: 100vh; }
        .menu { margin-top: 80px; text-align: center; background: #16213e; padding: 40px; border-radius: 15px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        #game-area { display: none; flex-direction: column; align-items: center; padding: 20px; }
        .stats-bar { display: flex; gap: 30px; margin-bottom: 15px; background: #0f3460; padding: 10px 25px; border-radius: 20px; color: #fff; font-size: 0.9rem; }
        #board { display: grid; grid-template-columns: repeat(15, 32px); background: #e9c46a; padding: 12px; border: 8px solid #264653; border-radius: 8px; position: relative; }
        .cell { width: 32px; height: 32px; border: 0.5px solid rgba(0,0,0,0.1); display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; }
        .piece { width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 3px 6px rgba(0,0,0,0.4); z-index: 2; }
        .black { background: radial-gradient(circle at 30% 30%, #444, #000); }
        .white { background: radial-gradient(circle at 30% 30%, #fff, #bdc3c7); }
        /* 最后落子标记 */
        .last-move-marker { width: 8px; height: 8px; background: #ff4d4d; border-radius: 50%; position: absolute; z-index: 3; }
        .controls { margin-top: 20px; display: flex; gap: 15px; }
        button { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; background: #e94560; color: white; font-weight: bold; transition: 0.3s; }
        button:hover { background: #0f3460; transform: scale(1.05); }
        #status { font-size: 1.2rem; margin: 15px; font-weight: bold; color: #48cae4; }
    </style>
</head>
<body>
    <div id="home" class="menu">
        <h1>五子棋高手对弈</h1>
        <button onclick="startPVE()">🤖 挑战 AI</button>
        <button onclick="startPVP()" style="margin-left:10px">🌐 联机对战</button>
    </div>

    <div id="game-area">
        <div class="stats-bar" id="pve-stats" style="display:none">
            <span>👤 玩家胜: <b id="win-human">0</b></span>
            <span>🤖 AI 胜: <b id="win-ai">0</b></span>
        </div>
        <div id="status">准备就绪</div>
        <div id="board"></div>
        <div class="controls">
            <button id="undo-btn" onclick="undo()" style="display:none; background:#9b59b6">悔棋</button>
            <button onclick="confirmReset()">重新开始</button>
            <button style="background:#2c3e50" onclick="copyUrl()" id="copy-btn">复制分享链接</button>
            <button style="background:#c0392b" onclick="confirmExit()">退出</button>
        </div>
    </div>

    <script>
        let socket;
        let myRole = 0;
        let gameMode = '';

        function initSocket(roomId) {
            socket = io({ query: { roomId } });
            socket.on('connect', () => socket.emit('join', roomId));
            
            socket.on('init', (data) => {
                myRole = data.role;
                gameMode = data.mode;
                document.getElementById('home').style.display = 'none';
                document.getElementById('game-area').style.display = 'flex';
                if(gameMode === 'pve') {
                    document.getElementById('pve-stats').style.display = 'flex';
                    document.getElementById('undo-btn').style.display = 'block';
                    document.getElementById('copy-btn').style.display = 'none';
                    updateStatsDisplay();
                }
                render(data);
            });

            socket.on('update', (data) => {
                if(data.gameOver && gameMode === 'pve') {
                    saveStats(data.winner);
                }
                render(data);
            });
            
            socket.on('sys_msg', (msg) => alert(msg));
        }

        function startPVE() { initSocket('pve'); }
        function startPVP() { 
            const id = Math.random().toString(36).substring(7);
            window.location.hash = id;
            initSocket(id);
        }

        if(window.location.hash) initSocket(window.location.hash.substring(1));

        function render(data) {
            const boardDiv = document.getElementById('board');
            boardDiv.innerHTML = '';
            data.board.forEach((row, r) => {
                row.forEach((cell, c) => {
                    const div = document.createElement('div');
                    div.className = 'cell';
                    div.onclick = () => { if(!data.gameOver) socket.emit('move', {r, c}); };
                    
                    if(cell !== 0) {
                        const p = document.createElement('div');
                        p.className = 'piece ' + (cell === 1 ? 'black' : 'white');
                        div.appendChild(p);
                        
                        // 高亮最后落子
                        if(data.lastMove && data.lastMove.r === r && data.lastMove.c === c) {
                            const marker = document.createElement('div');
                            marker.className = 'last-move-marker';
                            div.appendChild(marker);
                        }
                    }
                    boardDiv.appendChild(div);
                });
            });

            const status = document.getElementById('status');
            if(data.gameOver) {
                status.innerText = "🏆 游戏结束: " + (data.winner === 1 ? "黑棋胜" : "白棋胜");
            } else {
                status.innerText = (data.currentPlayer === 1 ? "● 黑棋" : "○ 白棋") + "的回合";
            }
        }

        // --- 统计逻辑 ---
        function saveStats(winner) {
            let winHuman = parseInt(localStorage.getItem('gomoku_win_human') || 0);
            let winAi = parseInt(localStorage.getItem('gomoku_win_ai') || 0);
            if(winner === 1) winHuman++;
            if(winner === 2) winAi++;
            localStorage.setItem('gomoku_win_human', winHuman);
            localStorage.setItem('gomoku_win_ai', winAi);
            updateStatsDisplay();
        }

        function updateStatsDisplay() {
            document.getElementById('win-human').innerText = localStorage.getItem('gomoku_win_human') || 0;
            document.getElementById('win-ai').innerText = localStorage.getItem('gomoku_win_ai') || 0;
        }

        function copyUrl() {
            navigator.clipboard.writeText(window.location.href).then(() => alert("链接已复制！"));
        }

        function confirmReset() { if(confirm("重置当前对局？")) socket.emit('reset'); }
        function confirmExit() { if(confirm("确定退出？")) location.href = '/'; }
        // --- 前端 script 逻辑 ---
		function undo() {
			// 即使游戏结束，点击悔棋也会尝试复活对局
			socket.emit('undo');
		}

		// 渲染函数中确保状态同步
		socket.on('update', (data) => {
			render(data);
			// 如果数据中 gameOver 为 false，前端自然可以继续点击 cell
		});
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`服务启动: http://localhost:${PORT}`));