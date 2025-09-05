// Sub Hunt - 潜水艦ゲーム - ゲームロジック

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ゲーム状態
let gameRunning = false;
let score = 0;
let bombsLeft = 15;
let level = 1;
let consecutiveHits = 0;
let lastBombRefillTime = 0;
let hitCount = 0; // 被攻撃回数（3回でゲームオーバー）
let invulnerableTime = 0;
let missedBombs = 0;
let enemyTorpedoes = [];
let smokeParticles = []; // 煙エフェクト用

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
const maxBombs = 15;
const maxHitCount = 3; // 3回被弾でゲームオーバー
const invulnerableDuration = 180; // 3秒間無敵（60fps*3）

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
    
    playHurt() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(200, 'sawtooth');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // ダメージ音：下降音
        oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.4);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.4);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.4);
    }
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        return this.soundEnabled;
    }
    
    playSubmarineAttack() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(120, 'square');
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // 潜水艦攻撃音：低音の警告音
        oscillator.frequency.setValueAtTime(120, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.8);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.3, this.audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.8);
    }
    
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
}

// サウンドシステムのインスタンスを作成
const soundSystem = new SoundSystem();

class SmokeParticle {
    constructor(x, y, type = 'light') {
        this.x = x + (Math.random() - 0.5) * 25;
        this.y = y;
        this.velocityX = (Math.random() - 0.5) * 0.8;
        this.velocityY = -Math.random() * 2 - 0.8;
        this.size = type === 'heavy' ? Math.random() * 4 + 3 : Math.random() * 3 + 2;
        this.life = 1.0;
        this.maxLife = type === 'heavy' ? 120 + Math.random() * 60 : 90 + Math.random() * 30; // heavy: 2-3秒, light: 1.5-2秒
        this.age = 0;
        this.type = type; // 'light' または 'heavy'
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
        this.rotation = Math.random() * Math.PI * 2;
    }
    
    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.age++;
        this.life = 1.0 - (this.age / this.maxLife);
        this.size += this.type === 'heavy' ? 0.08 : 0.05; // 徐々に大きくなる
        this.rotation += this.rotationSpeed;
        
        // 風の影響で横に流れる
        this.velocityX += (Math.random() - 0.5) * 0.02;
    }
    
    draw() {
        if (this.life <= 0) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        const alpha = this.life * (this.type === 'heavy' ? 0.7 : 0.5);
        
        if (this.type === 'heavy') {
            // 黒い濃い煙 - グラデーション付き
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
            gradient.addColorStop(0, `rgba(60, 60, 60, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(40, 40, 40, ${alpha * 0.8})`);
            gradient.addColorStop(1, `rgba(20, 20, 20, ${alpha * 0.3})`);
            ctx.fillStyle = gradient;
        } else {
            // 灰色の軽い煙 - グラデーション付き
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
            gradient.addColorStop(0, `rgba(160, 160, 160, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(120, 120, 120, ${alpha * 0.8})`);
            gradient.addColorStop(1, `rgba(100, 100, 100, ${alpha * 0.3})`);
            ctx.fillStyle = gradient;
        }
        
        // より自然な雲のような形
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // 追加の小さな円で雲のような質感を作る
        for (let i = 0; i < 3; i++) {
            const offsetX = (Math.random() - 0.5) * this.size * 0.8;
            const offsetY = (Math.random() - 0.5) * this.size * 0.8;
            const smallSize = this.size * (0.3 + Math.random() * 0.4);
            
            ctx.beginPath();
            ctx.arc(offsetX, offsetY, smallSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

class EnemyTorpedo {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.speed = 2;
        this.width = 12;
        this.height = 4;
        this.trail = [];
        
        // 発射角度を計算
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        this.velocityX = (dx / distance) * this.speed;
        this.velocityY = (dy / distance) * this.speed;
        this.angle = Math.atan2(dy, dx);
    }
    
    update() {
        // 軌跡を記録
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 5) {
            this.trail.shift();
        }
        
        this.x += this.velocityX;
        this.y += this.velocityY;
    }
    
    draw() {
        // 軌跡を描画
        if (this.trail.length > 1) {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.stroke();
        }
        
        // 魚雷本体
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // 魚雷の形状
        ctx.fillStyle = demoState.isDemo ? '#ff6666' : '#ff4444';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // 魚雷の先端
        ctx.fillStyle = demoState.isDemo ? '#ff9999' : '#ff6666';
        ctx.beginPath();
        ctx.moveTo(this.width/2, 0);
        ctx.lineTo(this.width/2 + 4, -this.height/2);
        ctx.lineTo(this.width/2 + 4, this.height/2);
        ctx.closePath();
        ctx.fill();
        
        // 推進器の炎
        ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.fillRect(-this.width/2 - 3, -1, 3, 2);
        
        ctx.restore();
    }
    
    isOffScreen() {
        return this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50;
    }
    
    // 船との衝突判定
    isCollidingWithShip(ship) {
        return this.x < ship.x + ship.width &&
               this.x + this.width > ship.x &&
               this.y < ship.y + ship.height &&
               this.y + this.height > ship.y;
    }
}

class Submarine {
    constructor() {
        this.x = Math.random() < 0.5 ? -50 : canvas.width + 50;
        this.y = seaLevel + 50 + Math.random() * 400;
        this.width = 30 + Math.random() * 40;
        this.height = this.width * 0.4;
        this.speed = (Math.random() * 0.8 + 0.4 + level * 0.1) * (this.x < 0 ? 1 : -1);
        this.points = Math.floor(100 / (this.width / 30));
        this.isLarge = this.width > 50;
        this.lastTorpedoTime = 0;
        this.torpedoCooldown = 3000 + Math.random() * 4000; // 3-7秒のクールダウン
    }
    
    update() {
        this.x += this.speed;
        
        // 魚雷発射の判定（海面レベルより下にいる潜水艦のみ）
        if (gameRunning && this.y > seaLevel + 30 && invulnerableTime === 0) {
            const currentTime = Date.now();
            if (currentTime - this.lastTorpedoTime > this.torpedoCooldown) {
                // 船との距離をチェック（近すぎず遠すぎない距離で発射）
                const distanceToShip = Math.abs(this.x + this.width/2 - ship.x - ship.width/2);
                if (distanceToShip < 300 && distanceToShip > 50) {
                    // 魚雷発射（船の現在位置を予測）
                    const predictedShipX = ship.x + ship.width/2;
                    const predictedShipY = ship.y + ship.height/2;
                    
                    enemyTorpedoes.push(new EnemyTorpedo(
                        this.x + this.width/2,
                        this.y + this.height/2,
                        predictedShipX,
                        predictedShipY
                    ));
                    
                    this.lastTorpedoTime = currentTime;
                    this.torpedoCooldown = 3000 + Math.random() * 4000; // 新しいクールダウンを設定
                    
                    // 魚雷発射音
                    soundSystem.playSubmarineAttack();
                }
            }
        }
    }
    
    draw() {
        this.drawSubmarine();
    }
    
    drawSubmarine() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        
        // 潜水艦の主船体（楕円形）
        ctx.fillStyle = demoState.isDemo ? '#2F5F2F' : '#2F4F2F';
        ctx.beginPath();
        ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // 船体の陰影
        ctx.fillStyle = demoState.isDemo ? '#1F4F1F' : '#1F3F1F';
        ctx.beginPath();
        ctx.ellipse(x + w/2, y + h/2 + h/4, w/2, h/4, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // 司令塔（コニングタワー）
        ctx.fillStyle = demoState.isDemo ? '#3F6F3F' : '#3F5F3F';
        const towerW = w * 0.3;
        const towerH = h * 0.6;
        ctx.fillRect(x + w/2 - towerW/2, y - towerH/2, towerW, towerH);
        
        // 潜望鏡
        ctx.fillStyle = demoState.isDemo ? '#4F7F4F' : '#4F6F4F';
        ctx.fillRect(x + w/2 - 1, y - towerH/2 - 8, 2, 8);
        
        // 潜望鏡レンズ
        ctx.fillStyle = demoState.isDemo ? '#6F9F6F' : '#6F8F6F';
        ctx.fillRect(x + w/2 - 2, y - towerH/2 - 10, 4, 2);
        
        // 魚雷発射管
        const tubeSpacing = w / 4;
        ctx.fillStyle = demoState.isDemo ? '#1F4F1F' : '#1F3F1F';
        for (let i = 0; i < 2; i++) {
            const tubeY = y + h/2 - 2 + i * 4;
            ctx.fillRect(this.speed > 0 ? x + w - 3 : x, tubeY, 6, 2);
        }
        
        // プロペラ
        if (this.speed !== 0) {
            ctx.strokeStyle = demoState.isDemo ? '#4F7F4F' : '#4F6F4F';
            ctx.lineWidth = 1;
            const propX = this.speed > 0 ? x - 8 : x + w + 8;
            const propY = y + h/2;
            
            // プロペラの回転効果
            const rotation = Date.now() * 0.02;
            ctx.save();
            ctx.translate(propX, propY);
            ctx.rotate(rotation);
            
            // プロペラブレード
            ctx.beginPath();
            ctx.moveTo(-4, -6);
            ctx.lineTo(4, 6);
            ctx.moveTo(-4, 6);
            ctx.lineTo(4, -6);
            ctx.stroke();
            ctx.restore();
        }
        
        // 推進器の泡エフェクト
        if (Math.random() < 0.3) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            let bubbleX = this.speed > 0 ? x - 12 : x + w + 12;
            let bubbleY = y + h/2 + (Math.random() - 0.5) * h;
            ctx.beginPath();
            ctx.arc(bubbleX, bubbleY, 1 + Math.random() * 2, 0, 2 * Math.PI);
            ctx.fill();
            
            // 追加の小さな泡
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.arc(bubbleX + (Math.random() - 0.5) * 6, 
                       bubbleY + (Math.random() - 0.5) * 6, 
                       0.5 + Math.random(), 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        
        // 水中での光の屈折効果（大型潜水艦のみ）
        if (this.isLarge && Math.random() < 0.1) {
            ctx.strokeStyle = 'rgba(135, 206, 235, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + h/2);
            ctx.quadraticCurveTo(x + w/2, y + h/2 - 5, x + w, y + h/2);
            ctx.stroke();
        }
        
        // デモモード時の光るエフェクト
        if (demoState.isDemo) {
            ctx.shadowColor = '#2F5F2F';
            ctx.shadowBlur = 5;
            ctx.fillStyle = 'rgba(47, 95, 47, 0.3)';
            ctx.beginPath();
            ctx.ellipse(x + w/2, y + h/2, w/2 + 2, h/2 + 2, 0, 0, 2 * Math.PI);
            ctx.fill();
            ctx.shadowBlur = 0;
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
    const maxSubs = Math.min(2 + Math.floor(level/2), 6); // レベル毎に潜水艦数増加、最大6隻
    if (submarines.length < maxSubs) {
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
                
                // 大型潜水艦撃破で爆弾+1
                if (sub.isLarge) {
                    bombsLeft += 1;
                    showMessage("+1 爆弾！", bomb.x, bomb.y - 30);
                    soundSystem.playPowerUp();
                }
                
                // 連続ヒット5回で爆弾+2
                if (consecutiveHits >= 5) {
                    bombsLeft += 2;
                    consecutiveHits = 0;
                    showMessage("連続ヒット！+2 爆弾！", bomb.x, bomb.y - 50);
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
                
                // クジラ撃破で爆弾+3（スコアペナルティのみ）
                bombsLeft += 3;
                showMessage("クジラ撃破！+3 爆弾", bomb.x, bomb.y - 30);
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
            missedBombs++;
            // 連続で5発外すと爆弾減少ペナルティ
            if (missedBombs >= 5) {
                bombsLeft = Math.max(0, bombsLeft - 2);
                missedBombs = 0;
                showMessage("連続ミス！爆弾-2", canvas.width/2, canvas.height - 50);
                soundSystem.playHurt();
            }
            bombs.splice(index, 1);
        }
    });
    
    // 敵魚雷の更新
    enemyTorpedoes.forEach((torpedo, index) => {
        torpedo.update();
        if (torpedo.isOffScreen()) {
            enemyTorpedoes.splice(index, 1);
        } else if (invulnerableTime === 0 && torpedo.isCollidingWithShip(ship)) {
            // 船に魚雷が当たった
            hitCount++;
            invulnerableTime = invulnerableDuration;
            explosions.push(new Explosion(torpedo.x, torpedo.y));
            
            // 被弾メッセージと煙エフェクト
            showMessage(`被弾！（${hitCount}/3）`, ship.x, ship.y - 30);
            
            // 被弾時の煙エフェクト
            if (hitCount === 1) {
                // 1回目: 軽い煙
                for (let i = 0; i < 8; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 5, 'light'));
                }
            } else if (hitCount === 2) {
                // 2回目: より大量の重い煙
                for (let i = 0; i < 12; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 5, 'heavy'));
                }
                for (let i = 0; i < 6; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 10, 'light'));
                }
            } else if (hitCount >= 3) {
                // 3回目: ゲームオーバー用の大量煙エフェクト
                for (let i = 0; i < 25; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 5, 'heavy'));
                }
                for (let i = 0; i < 15; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 15, 'light'));
                }
            }
            
            soundSystem.playExplosion();
            soundSystem.playHurt();
            enemyTorpedoes.splice(index, 1);
            consecutiveHits = 0; // 連続ヒット数をリセット
        }
    });
    
    // 煙パーティクルの更新
    smokeParticles.forEach((particle, index) => {
        particle.update();
        if (particle.isDead()) {
            smokeParticles.splice(index, 1);
        }
    });
    
    // 継続的な煙生成（被攻撃状態に応じて）
    if (hitCount > 0) {
        if (hitCount === 1) {
            // 1回被弾: 軽い煙を継続的に生成
            if (Math.random() < 0.6) { // 60%の確率
                smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 5, 'light'));
            }
        } else if (hitCount === 2) {
            // 2回被弾: より多くの重い煙を生成
            if (Math.random() < 0.8) { // 80%の確率
                smokeParticles.push(new SmokeParticle(ship.x + ship.width/2 - 5, ship.y - 5, 'heavy'));
            }
            if (Math.random() < 0.6) { // 追加の煙
                smokeParticles.push(new SmokeParticle(ship.x + ship.width/2 + 5, ship.y - 5, 'heavy'));
            }
            if (Math.random() < 0.3) { // さらに追加の軽い煙
                smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 10, 'light'));
            }
        }
    }
    
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
    let newLevel = Math.floor(score / 1500) + 1; // レベルアップ条件を厳しく
    if (newLevel > level) {
        let levelDiff = newLevel - level;
        level = newLevel;
        bombsLeft += levelDiff * 5; // 爆弾補充を減少
        showMessage(`レベル ${level}！+${levelDiff * 5} 爆弾！`, canvas.width/2, canvas.height/2);
        soundSystem.playLevelUp();
        consecutiveHits = 0; // 連続ヒット数リセット
        missedBombs = 0; // ミス数リセット
    }
    
    // 時間経過による爆弾補充（45秒毎に1発）
    let currentTime = Date.now();
    if (currentTime - lastBombRefillTime > 45000) {
        bombsLeft += 1;
        lastBombRefillTime = currentTime;
        showMessage("+1 爆弾！", canvas.width/2, 50);
        soundSystem.playPowerUp();
    }
    
    // 無敵時間減少
    if (invulnerableTime > 0) {
        invulnerableTime--;
    }
    
    // ゲームオーバー判定
    if ((bombsLeft <= 0 && bombs.length === 0) || hitCount >= maxHitCount) {
        gameRunning = false;
        soundSystem.playGameOver();
        const reason = hitCount >= maxHitCount ? '3回被弾' : '爆弾切れ';
        
        // UI表示制御
        document.getElementById('startText').style.display = 'block';
        
        alert(`ゲーム終了！(${reason})\nスコア: ${score} レベル: ${level}`);
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
    
    // 戦艦の描画
    drawWarship();
    
    // ゲームオブジェクトの描画
    submarines.forEach(sub => sub.draw());
    whales.forEach(whale => whale.draw());
    bombs.forEach(bomb => bomb.draw());
    enemyTorpedoes.forEach(torpedo => torpedo.draw());
    explosions.forEach(explosion => explosion.draw());
    smokeParticles.forEach(particle => particle.draw());
    messages.forEach(message => message.draw());
    
    // UI更新
    document.getElementById('score').textContent = score;
    document.getElementById('bombs').textContent = bombsLeft;
    document.getElementById('level').textContent = level;
    document.getElementById('hits').textContent = hitCount;
}

// 戦艦描画関数
function drawWarship() {
    const x = ship.x;
    const y = ship.y;
    const w = ship.width;
    const h = ship.height;
    
    // 無敵時間中は点滅させる
    if (invulnerableTime > 0 && Math.floor(invulnerableTime / 10) % 2 === 0) {
        return; // 点滅効果のため描画をスキップ
    }
    
    // デモモード時の光る効果
    if (demoState.isDemo) {
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
    }
    
    // 船体（メイン）
    ctx.fillStyle = demoState.isDemo ? '#00ffff' : '#708090';
    ctx.fillRect(x - w/2, y, w, h);
    
    // 船体の装甲板効果
    ctx.fillStyle = demoState.isDemo ? '#0099cc' : '#556B69';
    ctx.fillRect(x - w/2 + 2, y + 2, w - 4, h - 4);
    
    // 艦橋（上部構造）
    ctx.fillStyle = demoState.isDemo ? '#0099cc' : '#5F6A6A';
    ctx.fillRect(x - w/4, y - 8, w/2, 8);
    
    // 煙突
    ctx.fillStyle = demoState.isDemo ? '#004466' : '#2F4F4F';
    ctx.fillRect(x - 3, y - 15, 6, 7);
    
    // 主砲塔（前）
    ctx.fillStyle = demoState.isDemo ? '#006688' : '#36454F';
    ctx.fillRect(x - w/3, y - 5, w/6, 8);
    
    // 主砲塔（後）
    ctx.fillStyle = demoState.isDemo ? '#006688' : '#36454F';
    ctx.fillRect(x + w/6, y - 5, w/6, 8);
    
    // 砲身（前）
    ctx.strokeStyle = demoState.isDemo ? '#004466' : '#2F2F2F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - w/4, y - 1);
    ctx.lineTo(x - w/4 - 12, y - 1);
    ctx.stroke();
    
    // 砲身（後）
    ctx.beginPath();
    ctx.moveTo(x + w/4, y - 1);
    ctx.lineTo(x + w/4 + 12, y - 1);
    ctx.stroke();
    
    // レーダーマスト
    ctx.strokeStyle = demoState.isDemo ? '#0099cc' : '#696969';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y - 20);
    ctx.stroke();
    
    // レーダーアンテナ
    ctx.fillStyle = demoState.isDemo ? '#0099cc' : '#696969';
    ctx.fillRect(x - 4, y - 22, 8, 2);
    
    // 艦首波
    if (gameRunning && (keys['ArrowLeft'] || keys['ArrowRight'] || keys['a'] || keys['A'] || keys['d'] || keys['D'])) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - w/2 - 3, y + h);
        ctx.lineTo(x - w/2, y + h + 5);
        ctx.moveTo(x + w/2 + 3, y + h);
        ctx.lineTo(x + w/2, y + h + 5);
        ctx.stroke();
    }
    
    if (demoState.isDemo) {
        ctx.shadowBlur = 0;
    }
}

// デモモード関連関数
function checkDemoMode() {
    if (demoState.isDemo || gameRunning) return;
    
    // 30秒間操作がなければデモモード開始
    if (Date.now() - demoState.lastUserInput > 30000) {
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
                    bombsLeft = maxBombs;
                    level = 1;
                    consecutiveHits = 0;
                    hitCount = 0;
                    submarines.length = 0;
                    whales.length = 0;
                    bombs.length = 0;
                    explosions.length = 0;
                    messages.length = 0;
                    enemyTorpedoes.length = 0;
                    smokeParticles.length = 0;
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
    
    // スペースキーでゲーム開始（ゲームが停止中の場合）
    if (e.key === ' ' && !gameRunning) {
        e.preventDefault();
        startGame();
        return;
    }
    
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
    hitCount = 0;
    invulnerableTime = 0;
    missedBombs = 0;
    lastBombRefillTime = Date.now();
    bombs = [];
    submarines = [];
    whales = [];
    explosions = [];
    messages = [];
    enemyTorpedoes = [];
    smokeParticles = [];
    ship.x = canvas.width / 2;
    
    // UI表示制御
    document.getElementById('startText').style.display = 'none';
    
    stopDemo();
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

// 初期表示設定
window.addEventListener('load', function() {
    document.getElementById('startText').style.display = 'block';
});

// ゲーム開始
gameLoop();