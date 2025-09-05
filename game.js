// Sub Hunt - 潜水艦ゲーム - ゲームロジック

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ゲーム状態
let gameRunning = false;
let score = 0;
let bombsLeft = 20;
let level = 1;
let consecutiveHits = 0;
let lastBombRefillTime = 0;

// デモモード管理
let demoState = {
    isDemo: false,
    lastUserInput: Date.now(),
    demoStartTime: 0,
    demoActionTimer: 0
};

// キー入力管理
let keys = {};

// ゲームオブジェクト
let ship = { x: 400, y: 80, width: 40, height: 20, speed: 3 };
let bombs = [];
let submarines = [];
let whales = [];
let explosions = [];
let messages = [];

// 海面の位置
const seaLevel = 120;

// ゲーム設定
const bombSpeed = 1.5;
const maxBombs = 20;

// サウンドシステム
class SoundSystem {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.3;
        this.soundEnabled = true;
        this.initAudio();
    }
    
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.soundEnabled = false;
        }
    }
    
    createOscillator(frequency, type = 'sine') {
        if (!this.soundEnabled || !this.audioContext) return null;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;
        
        return { oscillator, gainNode };
    }
    
    playBombDrop() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(200, 'sine');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // ボムドロップ音：高音から低音に下がる
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    playExplosion() {
        if (!this.soundEnabled) return;
        
        // 爆発音：ホワイトノイズ風の音
        const bufferSize = 44100;
        const buffer = this.audioContext.createBuffer(1, bufferSize, 44100);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.6, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
        
        source.start(this.audioContext.currentTime);
        source.stop(this.audioContext.currentTime + 0.5);
    }
    
    playSubmarineHit() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(300, 'square');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // 潜水艦ヒット音：金属音風
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.05);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.5, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
    
    playWhaleSound() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(80, 'sine');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // クジラの鳴き声：低音の長いトーン
        oscillator.frequency.setValueAtTime(60, this.audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(120, this.audioContext.currentTime + 0.5);
        oscillator.frequency.linearRampToValueAtTime(80, this.audioContext.currentTime + 1.0);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.3, this.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.3, this.audioContext.currentTime + 0.8);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1.0);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 1.0);
    }
    
    playShipEngine() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(120, 'sawtooth');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // エンジン音：低いブーン音
        oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(130, this.audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(110, this.audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    playLevelUp() {
        if (!this.soundEnabled) return;
        
        const frequencies = [400, 500, 600, 800, 1000];
        
        frequencies.forEach((freq, index) => {
            const nodes = this.createOscillator(freq, 'sine');
            if (!nodes) return;
            
            const { oscillator, gainNode } = nodes;
            const startTime = this.audioContext.currentTime + index * 0.1;
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.15);
        });
    }
    
    playGameOver() {
        if (!this.soundEnabled) return;
        
        const frequencies = [400, 350, 300, 250, 200];
        
        frequencies.forEach((freq, index) => {
            const nodes = this.createOscillator(freq, 'square');
            if (!nodes) return;
            
            const { oscillator, gainNode } = nodes;
            const startTime = this.audioContext.currentTime + index * 0.2;
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.5, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.4);
        });
    }
    
    playPowerUp() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(600, 'sine');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        return this.soundEnabled;
    }
    
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
}

// サウンドシステムのインスタンスを作成
const soundSystem = new SoundSystem();

class Submarine {
    constructor() {
        this.x = Math.random() < 0.5 ? -50 : canvas.width + 50;
        this.y = seaLevel + 50 + Math.random() * 400;
        this.width = 30 + Math.random() * 40;
        this.height = this.width * 0.4;
        this.speed = (Math.random() * 1 + 0.3) * (this.x < 0 ? 1 : -1);
        this.points = Math.floor(100 / (this.width / 30));
        this.isLarge = this.width > 50;
    }
    
    update() {
        this.x += this.speed;
    }
    
    draw() {
        ctx.fillStyle = '#2F4F2F';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        // 潜望鏡
        ctx.fillRect(this.x + this.width/2, this.y - 5, 2, 5);
        // 推進器の泡
        if (Math.random() < 0.3) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            let bubbleX = this.speed > 0 ? this.x - 5 : this.x + this.width + 5;
            ctx.fillRect(bubbleX, this.y + this.height/2, 3, 3);
        }
    }
    
    isOffScreen() {
        return this.x < -100 || this.x > canvas.width + 100;
    }
}

class Whale {
    constructor() {
        this.x = Math.random() * (canvas.width - 80);
        this.y = seaLevel + 150 + Math.random() * 250;
        this.width = 80;
        this.height = 40;
        this.speedX = (Math.random() - 0.5) * 1;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.points = 500;
        this.tailOffset = 0;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.tailOffset += 0.1;
        
        // 画面端で反転
        if (this.x < 0 || this.x > canvas.width - this.width) {
            this.speedX *= -1;
        }
        if (this.y < seaLevel + 100 || this.y > canvas.height - this.height) {
            this.speedY *= -1;
        }
        
        // ランダムに方向転換
        if (Math.random() < 0.01) {
            this.speedX = (Math.random() - 0.5) * 1;
            this.speedY = (Math.random() - 0.5) * 0.5;
        }
    }
    
    draw() {
        // クジラの本体（楕円形）
        ctx.fillStyle = '#4169E1';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 尻尾
        ctx.fillStyle = '#4169E1';
        let tailX = this.speedX > 0 ? this.x - 15 : this.x + this.width + 5;
        let tailY = this.y + this.height/2;
        let tailWave = Math.sin(this.tailOffset) * 5;
        
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX - 10, tailY - 15 + tailWave);
        ctx.lineTo(tailX - 10, tailY + 15 + tailWave);
        ctx.closePath();
        ctx.fill();
        
        // 目
        ctx.fillStyle = 'white';
        let eyeX = this.speedX > 0 ? this.x + 15 : this.x + this.width - 25;
        ctx.beginPath();
        ctx.arc(eyeX, this.y + 12, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(eyeX, this.y + 12, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // 口
        ctx.strokeStyle = '#000080';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let mouthX = this.speedX > 0 ? this.x + 5 : this.x + this.width - 15;
        ctx.arc(mouthX, this.y + 25, 8, 0, Math.PI);
        ctx.stroke();
        
        // 水しぶき（たまに）
        if (Math.random() < 0.1) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            let spoutX = this.x + this.width/2;
            let spoutY = this.y - 5;
            ctx.fillRect(spoutX - 2, spoutY - 10, 4, 10);
            ctx.fillRect(spoutX - 4, spoutY - 15, 2, 5);
            ctx.fillRect(spoutX + 2, spoutY - 15, 2, 5);
        }
    }
}

// メッセージ表示システム
class Message {
    constructor(text, x, y) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.life = 60;
        this.alpha = 1;
    }
    
    update() {
        this.y -= 1;
        this.life--;
        this.alpha = this.life / 60;
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

function showMessage(text, x, y) {
    messages.push(new Message(text, x, y));
}

class Bomb {
    constructor(x, y, side) {
        this.x = x;
        this.y = y;
        this.radius = 3;
        this.side = side;
    }
    
    update() {
        this.y += bombSpeed;
    }
    
    draw() {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 爆弾の軌跡
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - 10);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
    }
    
    isOffScreen() {
        return this.y > canvas.height;
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 30;
        this.life = 30;
    }
    
    update() {
        this.radius += 2;
        this.life--;
    }
    
    draw() {
        let alpha = this.life / 30;
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

function spawnSubmarine() {
    if (submarines.length < 3 + level) {
        submarines.push(new Submarine());
    }
}

function spawnWhale() {
    if (whales.length < 1 && Math.random() < 0.01) {
        whales.push(new Whale());
    }
}

function checkCollisions() {
    bombs.forEach((bomb, bombIndex) => {
        // 潜水艦との衝突
        submarines.forEach((sub, subIndex) => {
            if (bomb.x > sub.x && bomb.x < sub.x + sub.width &&
                bomb.y > sub.y && bomb.y < sub.y + sub.height) {
                explosions.push(new Explosion(bomb.x, bomb.y));
                soundSystem.playExplosion();
                soundSystem.playSubmarineHit();
                score += sub.points;
                consecutiveHits++;
                
                // 大型潜水艦撃破で爆弾+2
                if (sub.isLarge) {
                    bombsLeft += 2;
                    showMessage("+2 爆弾！", bomb.x, bomb.y - 30);
                    soundSystem.playPowerUp();
                }
                
                // 連続ヒット5回で爆弾+3
                if (consecutiveHits >= 5) {
                    bombsLeft += 3;
                    consecutiveHits = 0;
                    showMessage("連続ヒット！+3 爆弾！", bomb.x, bomb.y - 50);
                    soundSystem.playPowerUp();
                }
                
                bombs.splice(bombIndex, 1);
                submarines.splice(subIndex, 1);
            }
        });
        
        // クジラとの衝突
        whales.forEach((whale, whaleIndex) => {
            let distance = Math.sqrt(
                Math.pow(bomb.x - (whale.x + whale.width/2), 2) +
                Math.pow(bomb.y - (whale.y + whale.height/2), 2)
            );
            if (distance < whale.width/2) {
                explosions.push(new Explosion(bomb.x, bomb.y));
                soundSystem.playExplosion();
                soundSystem.playWhaleSound();
                score += whale.points;
                consecutiveHits++;
                
                // クジラ撃破で爆弾+5
                bombsLeft += 5;
                showMessage("クジラ撃破！+5 爆弾！", bomb.x, bomb.y - 30);
                soundSystem.playPowerUp();
                
                bombs.splice(bombIndex, 1);
                whales.splice(whaleIndex, 1);
            }
        });
    });
    
    // 爆弾が外れた場合（海底に到達）
    bombs.forEach((bomb, bombIndex) => {
        if (bomb.y >= canvas.height - 10) {
            consecutiveHits = 0;
        }
    });
}

function updateGame() {
    if (!gameRunning) return;
    
    // 船の移動
    let shipMoved = false;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        ship.x = Math.max(ship.width/2, ship.x - ship.speed);
        shipMoved = true;
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        ship.x = Math.min(canvas.width - ship.width/2, ship.x + ship.speed);
        shipMoved = true;
    }
    
    // 船が移動している時は低頻度でエンジン音を再生
    if (shipMoved && Math.random() < 0.05) {
        soundSystem.playShipEngine();
    }
    
    // 潜水艦の更新
    submarines.forEach((sub, index) => {
        sub.update();
        if (sub.isOffScreen()) {
            submarines.splice(index, 1);
        }
    });
    
    // クジラの更新
    whales.forEach(whale => whale.update());
    
    // 爆弾の更新
    bombs.forEach((bomb, index) => {
        bomb.update();
        if (bomb.isOffScreen()) {
            bombs.splice(index, 1);
        }
    });
    
    // 爆発の更新
    explosions.forEach((explosion, index) => {
        explosion.update();
        if (explosion.isDead()) {
            explosions.splice(index, 1);
        }
    });
    
    // メッセージの更新
    messages.forEach((message, index) => {
        message.update();
        if (message.isDead()) {
            messages.splice(index, 1);
        }
    });
    
    // 衝突判定
    checkCollisions();
    
    // 新しい敵の生成
    if (Math.random() < 0.02) spawnSubmarine();
    spawnWhale();
    
    // レベルアップチェック
    let newLevel = Math.floor(score / 1000) + 1;
    if (newLevel > level) {
        let levelDiff = newLevel - level;
        level = newLevel;
        bombsLeft += levelDiff * 10;
        showMessage(`レベル ${level}！+${levelDiff * 10} 爆弾！`, canvas.width/2, canvas.height/2);
        soundSystem.playLevelUp();
    }
    
    // 時間経過による爆弾補充（30秒毎に1発）
    let currentTime = Date.now();
    if (currentTime - lastBombRefillTime > 30000) {
        bombsLeft += 1;
        lastBombRefillTime = currentTime;
        showMessage("+1 爆弾！", canvas.width/2, 50);
        soundSystem.playPowerUp();
    }
    
    // ゲームオーバー判定
    if (bombsLeft <= 0 && bombs.length === 0) {
        gameRunning = false;
        soundSystem.playGameOver();
        alert(`ゲーム終了！スコア: ${score} レベル: ${level}`);
    }
}

function drawGame() {
    // 背景をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 海面ライン
    ctx.strokeStyle = '#4682B4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, seaLevel);
    ctx.lineTo(canvas.width, seaLevel);
    ctx.stroke();
    
    // 船の描画
    if (demoState.isDemo) {
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#00ffff';
    } else {
        ctx.fillStyle = '#8B4513';
    }
    ctx.fillRect(ship.x - ship.width/2, ship.y, ship.width, ship.height);
    
    if (demoState.isDemo) {
        ctx.fillStyle = '#0099cc';
    } else {
        ctx.fillStyle = '#654321';
    }
    ctx.fillRect(ship.x - ship.width/4, ship.y - 10, ship.width/2, 10);
    
    if (demoState.isDemo) {
        ctx.shadowBlur = 0;
    }
    
    // ゲームオブジェクトの描画
    submarines.forEach(sub => sub.draw());
    whales.forEach(whale => whale.draw());
    bombs.forEach(bomb => bomb.draw());
    explosions.forEach(explosion => explosion.draw());
    messages.forEach(message => message.draw());
    
    // UI更新
    document.getElementById('score').textContent = score;
    document.getElementById('bombs').textContent = bombsLeft;
    document.getElementById('level').textContent = level;
    document.getElementById('consecutive').textContent = consecutiveHits;
}

// デモモード関連関数
function checkDemoMode() {
    if (demoState.isDemo || gameRunning) return;
    
    // 5秒間操作がなければデモモード開始
    if (Date.now() - demoState.lastUserInput > 5000) {
        startDemo();
    }
}

function startDemo() {
    demoState.isDemo = true;
    demoState.demoStartTime = Date.now();
    demoState.demoActionTimer = 0;
    
    // デモ表示を表示
    document.getElementById('demoText').style.display = 'block';
    
    // デモゲームを自動開始
    setTimeout(() => {
        if (demoState.isDemo) {
            startGame();
        }
    }, 1000);
}

function stopDemo() {
    demoState.isDemo = false;
    demoState.lastUserInput = Date.now();
    
    // デモ表示を非表示
    document.getElementById('demoText').style.display = 'none';
}

function updateDemoAI() {
    demoState.demoActionTimer++;
    
    if (gameRunning) {
        // AIによる船の移動制御
        const targetSubmarine = submarines.find(sub => sub.y > seaLevel);
        
        if (targetSubmarine) {
            // 最寄りの潜水艦を追跡
            const shipCenterX = ship.x + ship.width / 2;
            const subCenterX = targetSubmarine.x + targetSubmarine.width / 2;
            
            if (Math.abs(shipCenterX - subCenterX) > 20) {
                if (shipCenterX < subCenterX) {
                    keys['ArrowRight'] = true;
                    keys['ArrowLeft'] = false;
                } else {
                    keys['ArrowLeft'] = true;
                    keys['ArrowRight'] = false;
                }
            } else {
                keys['ArrowLeft'] = false;
                keys['ArrowRight'] = false;
            }
            
            // 適切な位置で爆弾投下
            if (Math.abs(shipCenterX - subCenterX) < 50 && bombsLeft > 0 && 
                demoState.demoActionTimer % 45 === 0) { // 約0.75秒間隔
                bombs.push(new Bomb(ship.x, ship.y + ship.height, 'left'));
                bombsLeft--;
                soundSystem.playBombDrop();
            }
        } else {
            // 潜水艦がない場合は左右に軽く移動
            if (demoState.demoActionTimer % 120 < 60) {
                keys['ArrowRight'] = true;
                keys['ArrowLeft'] = false;
            } else {
                keys['ArrowLeft'] = true;
                keys['ArrowRight'] = false;
            }
        }
        
        // ゲームオーバー時の処理
        if (!gameRunning && demoState.isDemo) {
            setTimeout(() => {
                if (demoState.isDemo) {
                    // スコアをリセットしてゲーム再開
                    score = 0;
                    bombsLeft = 20;
                    level = 1;
                    consecutiveHits = 0;
                    submarines.length = 0;
                    whales.length = 0;
                    bombs.length = 0;
                    explosions.length = 0;
                    messages.length = 0;
                    startGame();
                }
            }, 2000);
        }
    }
}

function gameLoop() {
    // デモモードチェック
    if (!demoState.isDemo && !gameRunning) {
        checkDemoMode();
    }
    
    // デモモード中のAI制御
    if (demoState.isDemo) {
        updateDemoAI();
    }
    
    updateGame();
    drawGame();
    requestAnimationFrame(gameLoop);
}

// キーボード操作
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    // ユーザー入力があったらデモモードを停止
    if (demoState.isDemo) {
        stopDemo();
    }
    
    demoState.lastUserInput = Date.now();
    
    // スペースキーまたはZキーで爆弾投下（左側）
    if ((e.key === ' ' || e.key.toLowerCase() === 'z') && gameRunning && bombsLeft > 0) {
        e.preventDefault();
        bombs.push(new Bomb(ship.x - ship.width/4, ship.y + ship.height, 'left'));
        bombsLeft--;
        soundSystem.playBombDrop();
    }
    
    // Xキーで爆弾投下（右側）
    if (e.key.toLowerCase() === 'x' && gameRunning && bombsLeft > 0) {
        bombs.push(new Bomb(ship.x + ship.width/4, ship.y + ship.height, 'right'));
        bombsLeft--;
        soundSystem.playBombDrop();
    }
    
    // Mキーでサウンド切り替え
    if (e.key.toLowerCase() === 'm') {
        toggleSound();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    demoState.lastUserInput = Date.now();
});

canvas.addEventListener('click', (e) => {
    if (!gameRunning || bombsLeft <= 0) return;
    const rect = canvas.getBoundingClientRect();
    let clickX = e.clientX - rect.left;
    
    // クリック位置が船の中央より左なら左側から、右なら右側から爆弾投下
    if (clickX < ship.x) {
        bombs.push(new Bomb(ship.x - ship.width/4, ship.y + ship.height, 'left'));
    } else {
        bombs.push(new Bomb(ship.x + ship.width/4, ship.y + ship.height, 'right'));
    }
    bombsLeft--;
    soundSystem.playBombDrop();
});

function startGame() {
    gameRunning = true;
    score = 0;
    bombsLeft = maxBombs;
    level = 1;
    consecutiveHits = 0;
    lastBombRefillTime = Date.now();
    bombs = [];
    submarines = [];
    whales = [];
    explosions = [];
    messages = [];
    ship.x = canvas.width / 2;
}

function resetGame() {
    gameRunning = false;
    startGame();
}

function toggleSound() {
    const isEnabled = soundSystem.toggleSound();
    const soundBtn = document.getElementById('soundBtn');
    soundBtn.textContent = isEnabled ? '🔊 音ON' : '🔇 音OFF';
}

// ゲーム開始
gameLoop();