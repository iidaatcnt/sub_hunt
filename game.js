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
let bubbleParticles = []; // 泡エフェクト用

// 戦艦沈没状態管理
let shipSinking = false;
let sinkingStartTime = 0;
let sinkingDuration = 4000; // 4秒かけて沈没
let sinkStartY = 80; // 戦艦の初期Y位置

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
let krakens = [];
let explosions = [];
let messages = [];

// モバイル対応
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let touchMoveDirection = null;

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
        this.initialized = false;
    }
    
    initAudio() {
        if (this.initialized) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // AudioContextが作成された直後は"suspended"状態の場合があるので、再開を試みる
            if (this.audioContext.state === 'suspended') {
                return; // ユーザージェスチャー後に再開される
            }
            
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.soundEnabled = false;
        }
    }
    
    async resumeAudioContext() {
        if (!this.audioContext) {
            this.initAudio();
        }
        
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                this.initialized = true;
            } catch (e) {
                console.warn('Failed to resume audio context:', e);
                this.soundEnabled = false;
            }
        }
    }
    
    createOscillator(frequency, type = 'sine') {
        if (!this.soundEnabled || !this.audioContext || this.audioContext.state === 'suspended') return null;
        
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
    
    playKrakenSound() {
        if (!this.soundEnabled) return;
        
        const nodes = this.createOscillator(40, 'sawtooth'); // より恐ろしいsaw波
        if (!nodes) return;
        
        const { oscillator, gainNode } = nodes;
        
        // クラーケンの恐ろしい鳴き声：低くて不気味な音
        oscillator.frequency.setValueAtTime(30, this.audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(80, this.audioContext.currentTime + 0.3);
        oscillator.frequency.linearRampToValueAtTime(20, this.audioContext.currentTime + 0.7);
        oscillator.frequency.linearRampToValueAtTime(60, this.audioContext.currentTime + 1.2);
        oscillator.frequency.linearRampToValueAtTime(25, this.audioContext.currentTime + 1.8);
        
        // 音量エンベロープも不気味に
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.audioContext.currentTime + 0.4);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.5, this.audioContext.currentTime + 0.8);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.1, this.audioContext.currentTime + 1.5);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 2.0);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 2.0);
        
        // 追加の不気味なエフェクト音
        setTimeout(() => {
            const nodes2 = this.createOscillator(15, 'triangle');
            if (nodes2) {
                const { oscillator: osc2, gainNode: gain2 } = nodes2;
                osc2.frequency.setValueAtTime(15, this.audioContext.currentTime);
                osc2.frequency.linearRampToValueAtTime(45, this.audioContext.currentTime + 0.5);
                
                gain2.gain.setValueAtTime(0, this.audioContext.currentTime);
                gain2.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.audioContext.currentTime + 0.1);
                gain2.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
                
                osc2.start(this.audioContext.currentTime);
                osc2.stop(this.audioContext.currentTime + 0.8);
            }
        }, 200);
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
// サウンドシステムは遅延初期化
let soundSystem;

function initSoundSystem() {
    if (!soundSystem) {
        soundSystem = new SoundSystem();
    }
    return soundSystem;
}

function safePlaySound(soundMethod, ...args) {
    try {
        const sound = initSoundSystem();
        if (sound && typeof sound[soundMethod] === 'function') {
            sound[soundMethod](...args);
        }
    } catch (e) {
        // サウンド再生エラーを無視（ゲームは継続）
        console.warn('Sound playback error:', e);
    }
}

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

class BubbleParticle {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 40;
        this.y = y;
        this.velocityX = (Math.random() - 0.5) * 1.0;
        this.velocityY = -Math.random() * 1.5 - 0.5; // 上向きに泡が浮上
        this.size = Math.random() * 4 + 2; // 2-6の大きさ
        this.life = 1.0;
        this.maxLife = 80 + Math.random() * 40; // 1.3-2秒程度
        this.age = 0;
        this.wobble = Math.random() * Math.PI * 2; // 揺らぎのための位相
        this.wobbleSpeed = 0.1 + Math.random() * 0.05;
    }
    
    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.age++;
        this.life = 1.0 - (this.age / this.maxLife);
        
        // 泡の上昇に伴う横揺れ
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * 0.3;
        
        // 徐々に小さくなる（表面に近づくにつれて）
        if (this.life < 0.5) {
            this.size *= 0.995;
        }
        
        // 水面に近づくと速度が上がる
        if (this.y < seaLevel + 20) {
            this.velocityY -= 0.02;
        }
    }
    
    draw() {
        if (this.life <= 0 || this.y < seaLevel) return; // 水面に達したら消える
        
        ctx.save();
        
        const alpha = this.life * 0.8;
        
        // 泡の描画 - 水色で透明感のある円
        const gradient = ctx.createRadialGradient(
            this.x - this.size * 0.3, this.y - this.size * 0.3, 0,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, `rgba(200, 240, 255, ${alpha})`);
        gradient.addColorStop(0.7, `rgba(150, 220, 255, ${alpha * 0.5})`);
        gradient.addColorStop(1, `rgba(100, 200, 255, ${alpha * 0.2})`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // ハイライトで光沢感を追加
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0 || this.y < seaLevel;
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
                    safePlaySound('playSubmarineAttack');
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

class Kraken {
    constructor() {
        this.x = Math.random() * (canvas.width - 80);
        this.y = seaLevel + 150 + Math.random() * 250;
        this.width = 80;
        this.height = 40;
        this.speedX = (Math.random() - 0.5) * 1;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.points = 500;
        this.tailOffset = 0;
        this.hp = 2; // クラーケンは2発で撃破
        this.maxHp = 2;
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
        // クラーケンの本体（ダメージに応じて色を変化）
        let bodyColor = '#2F4F2F'; // 通常の暗緑色
        if (this.hp === 1) {
            bodyColor = '#4F2F2F'; // ダメージ時は暗赤緑色
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // クラーケンの触手（複数）
        ctx.fillStyle = '#1C3A1C'; // さらに暗い緑
        ctx.lineWidth = 3;
        
        // 8本の触手を描画
        for (let i = 0; i < 8; i++) {
            let angle = (i * Math.PI * 2) / 8;
            let tentacleWave = Math.sin(this.tailOffset + i) * 8;
            let startX = this.x + this.width/2 + Math.cos(angle) * (this.width/3);
            let startY = this.y + this.height/2 + Math.sin(angle) * (this.height/3);
            let endX = startX + Math.cos(angle) * (25 + tentacleWave);
            let endY = startY + Math.sin(angle) * (25 + tentacleWave);
            
            // 触手の描画（徐々に細くなる）
            for (let j = 0; j < 3; j++) {
                let progress = j / 3;
                let currentX = startX + (endX - startX) * progress;
                let currentY = startY + (endY - startY) * progress;
                let nextX = startX + (endX - startX) * (progress + 0.33);
                let nextY = startY + (endY - startY) * (progress + 0.33);
                
                ctx.strokeStyle = `rgba(28, 58, 28, ${0.8 - progress * 0.3})`;
                ctx.lineWidth = 4 - j * 1.2;
                ctx.beginPath();
                ctx.moveTo(currentX, currentY);
                ctx.lineTo(nextX, nextY);
                ctx.stroke();
                
                // 吸盤を描画
                if (j < 2) {
                    ctx.fillStyle = `rgba(60, 80, 60, ${0.6 - progress * 0.2})`;
                    ctx.beginPath();
                    ctx.arc(currentX + (Math.random() - 0.5) * 3, currentY + (Math.random() - 0.5) * 3, 
                            2 - j * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // 恐ろしい目（赤く光る）
        ctx.fillStyle = '#8B0000'; // 暗赤色
        let eyeX1 = this.x + this.width/2 - 12;
        let eyeX2 = this.x + this.width/2 + 12;
        let eyeY = this.y + this.height/2 - 8;
        
        ctx.beginPath();
        ctx.arc(eyeX1, eyeY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeX2, eyeY, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // 目の光る部分
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(eyeX1, eyeY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeX2, eyeY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 恐ろしい口（牙付き）
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width/2, this.y + this.height/2 + 10, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 牙
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width/2 - 8, this.y + this.height/2 + 6);
        ctx.lineTo(this.x + this.width/2 - 6, this.y + this.height/2 + 14);
        ctx.lineTo(this.x + this.width/2 - 4, this.y + this.height/2 + 6);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(this.x + this.width/2 + 8, this.y + this.height/2 + 6);
        ctx.lineTo(this.x + this.width/2 + 6, this.y + this.height/2 + 14);
        ctx.lineTo(this.x + this.width/2 + 4, this.y + this.height/2 + 6);
        ctx.fill();
        
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

function spawnKraken() {
    if (krakens.length < 1 && Math.random() < 0.01) {
        krakens.push(new Kraken());
    }
}

function checkCollisions() {
    bombs.forEach((bomb, bombIndex) => {
        // 潜水艦との衝突
        submarines.forEach((sub, subIndex) => {
            if (bomb.x > sub.x && bomb.x < sub.x + sub.width &&
                bomb.y > sub.y && bomb.y < sub.y + sub.height) {
                explosions.push(new Explosion(bomb.x, bomb.y));
                safePlaySound('playExplosion');
                safePlaySound('playSubmarineHit');
                score += sub.points;
                consecutiveHits++;
                
                // 大型潜水艦撃破で爆弾+1
                if (sub.isLarge) {
                    bombsLeft += 1;
                    showMessage("+1 爆弾！", bomb.x, bomb.y - 30);
                    safePlaySound('playPowerUp');
                }
                
                // 連続ヒット5回で爆弾+2
                if (consecutiveHits >= 5) {
                    bombsLeft += 2;
                    consecutiveHits = 0;
                    showMessage("連続ヒット！+2 爆弾！", bomb.x, bomb.y - 50);
                    safePlaySound('playPowerUp');
                }
                
                bombs.splice(bombIndex, 1);
                submarines.splice(subIndex, 1);
            }
        });
        
        // クジラとの衝突
        krakens.forEach((kraken, krakenIndex) => {
            let distance = Math.sqrt(
                Math.pow(bomb.x - (kraken.x + kraken.width/2), 2) +
                Math.pow(bomb.y - (kraken.y + kraken.height/2), 2)
            );
            if (distance < kraken.width/2) {
                explosions.push(new Explosion(bomb.x, bomb.y));
                safePlaySound('playExplosion');
                
                // クラーケンのHPを減らす
                kraken.hp--;
                
                if (kraken.hp <= 0) {
                    // 撃破時
                    safePlaySound('playKrakenSound');
                    score += kraken.points;
                    consecutiveHits++;
                    
                    // クラーケン撃破で爆弾+3
                    bombsLeft += 3;
                    showMessage("クラーケン撃破！+3 爆弾", bomb.x, bomb.y - 30);
                    safePlaySound('playPowerUp');
                    
                    krakens.splice(krakenIndex, 1);
                } else {
                    // ダメージ時
                    showMessage(`クラーケンにダメージ！ 残りHP: ${kraken.hp}`, bomb.x, bomb.y - 30);
                }
                
                bombs.splice(bombIndex, 1);
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
        safePlaySound('playShipEngine');
    }
    
    // 潜水艦の更新
    submarines.forEach((sub, index) => {
        sub.update();
        if (sub.isOffScreen()) {
            submarines.splice(index, 1);
        }
    });
    
    // クジラの更新
    krakens.forEach(kraken => kraken.update());
    
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
                safePlaySound('playHurt');
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
                // 3回目: 沈没開始 - 大量煙と泡エフェクト
                shipSinking = true;
                sinkingStartTime = Date.now();
                sinkStartY = ship.y;
                
                // 大量の煙エフェクト
                for (let i = 0; i < 35; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 5, 'heavy'));
                }
                for (let i = 0; i < 20; i++) {
                    smokeParticles.push(new SmokeParticle(ship.x + ship.width/2, ship.y - 15, 'light'));
                }
                
                // 泡エフェクトを開始
                for (let i = 0; i < 15; i++) {
                    bubbleParticles.push(new BubbleParticle(ship.x + ship.width/2, ship.y + ship.height));
                }
            }
            
            safePlaySound('playExplosion');
            safePlaySound('playHurt');
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
    
    // 泡パーティクルの更新
    bubbleParticles.forEach((particle, index) => {
        particle.update();
        if (particle.isDead()) {
            bubbleParticles.splice(index, 1);
        }
    });
    
    // 戦艦沈没処理
    if (shipSinking) {
        const elapsed = Date.now() - sinkingStartTime;
        const progress = Math.min(elapsed / sinkingDuration, 1.0);
        
        // 戦艦を徐々に沈没させる（Y座標を増加）
        ship.y = sinkStartY + progress * (seaLevel + 40 - sinkStartY);
        
        // 沈没中の継続的なエフェクト
        if (Math.random() < 0.9) { // 90%の確率で煙
            smokeParticles.push(new SmokeParticle(ship.x + ship.width/2 + (Math.random() - 0.5) * 20, ship.y - 10, 'heavy'));
        }
        
        if (Math.random() < 0.7) { // 70%の確率で泡
            bubbleParticles.push(new BubbleParticle(ship.x + ship.width/2, ship.y + ship.height));
        }
        
        // 完全に沈没したらゲームオーバー
        if (progress >= 1.0) {
            gameRunning = false;
            showMessage('💥 沈没！ゲームオーバー 💥', canvas.width/2, canvas.height/2);
            safePlaySound('playGameOver');
            
            // 最後の大きな泡エフェクト
            for (let i = 0; i < 10; i++) {
                bubbleParticles.push(new BubbleParticle(ship.x + ship.width/2, ship.y + ship.height));
            }
        }
    }
    
    // 継続的な煙生成（被攻撃状態に応じて、沈没中でない場合）
    if (hitCount > 0 && !shipSinking) {
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
    spawnKraken();
    
    // レベルアップチェック
    let newLevel = Math.floor(score / 1500) + 1; // レベルアップ条件を厳しく
    if (newLevel > level) {
        let levelDiff = newLevel - level;
        level = newLevel;
        bombsLeft += levelDiff * 5; // 爆弾補充を減少
        showMessage(`レベル ${level}！+${levelDiff * 5} 爆弾！`, canvas.width/2, canvas.height/2);
        safePlaySound('playLevelUp');
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
        safePlaySound('playGameOver');
        const reason = hitCount >= maxHitCount ? '3回被弾' : '爆弾切れ';
        
        // UI表示制御
        document.getElementById('startText').style.display = 'block';
        
        // 画面メッセージのみ表示（ポップアップなし）
        showMessage(`💀 ゲーム終了！(${reason}) 💀\nスコア: ${score} レベル: ${level}`, canvas.width/2, canvas.height/2);
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
    krakens.forEach(kraken => kraken.draw());
    bombs.forEach(bomb => bomb.draw());
    enemyTorpedoes.forEach(torpedo => torpedo.draw());
    explosions.forEach(explosion => explosion.draw());
    smokeParticles.forEach(particle => particle.draw());
    bubbleParticles.forEach(particle => particle.draw());
    messages.forEach(message => message.draw());
    
    // UI更新
    document.getElementById('score').textContent = score;
    document.getElementById('bombs').textContent = bombsLeft;
    document.getElementById('level').textContent = level;
    document.getElementById('hits').textContent = hitCount;
    
    // デバッグ: コンソールで爆弾数を確認
    if (gameRunning) {
        console.log('Current bombs:', bombsLeft);
    }
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
                safePlaySound('playBombDrop');
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
                    krakens.length = 0;
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
document.addEventListener('keydown', async (e) => {
    // サウンドシステムを初期化してAudioContextを再開（ユーザージェスチャーが必要）
    const sound = initSoundSystem();
    await sound.resumeAudioContext();
    
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
        safePlaySound('playBombDrop');
    }
    
    // Xキーで爆弾投下（右側）
    if (e.key.toLowerCase() === 'x' && gameRunning && bombsLeft > 0) {
        bombs.push(new Bomb(ship.x + ship.width/4, ship.y + ship.height, 'right'));
        bombsLeft--;
        safePlaySound('playBombDrop');
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
    safePlaySound('playBombDrop');
});

async function startGame() {
    // サウンドシステムを初期化してAudioContextを再開（ユーザージェスチャーが必要）
    const sound = initSoundSystem();
    await sound.resumeAudioContext();
    
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
    krakens = [];
    explosions = [];
    messages = [];
    enemyTorpedoes = [];
    smokeParticles = [];
    bubbleParticles = [];
    
    // 戦艦沈没状態をリセット
    shipSinking = false;
    sinkingStartTime = 0;
    ship.x = canvas.width / 2;
    ship.y = 80; // 戦艦の初期Y位置をリセット
    
    // UI表示制御
    document.getElementById('startText').style.display = 'none';
    
    stopDemo();
}

function resetGame() {
    gameRunning = false;
    startGame();
}

function toggleSound() {
    const sound = initSoundSystem();
    const isEnabled = sound.toggleSound();
    const soundBtn = document.getElementById('soundBtn');
    soundBtn.textContent = isEnabled ? '🔊 音ON' : '🔇 音OFF';
}

// モバイル用タッチコントロール関数
async function touchMove(direction) {
    // サウンドシステムを初期化してAudioContextを再開（ユーザージェスチャーが必要）
    const sound = initSoundSystem();
    await sound.resumeAudioContext();
    
    if (!gameRunning) return;
    touchMoveDirection = direction;
    if (direction === 'left') {
        keys['ArrowLeft'] = true;
    } else if (direction === 'right') {
        keys['ArrowRight'] = true;
    }
}

function stopMove() {
    touchMoveDirection = null;
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
}

async function dropBomb(side) {
    // サウンドシステムを初期化してAudioContextを再開（ユーザージェスチャーが必要）
    const sound = initSoundSystem();
    await sound.resumeAudioContext();
    
    if (!gameRunning || bombsLeft <= 0) return;
    
    if (side === 'left') {
        bombs.push(new Bomb(ship.x - ship.width/4, ship.y + ship.height, 'left'));
    } else if (side === 'center') {
        bombs.push(new Bomb(ship.x, ship.y + ship.height, 'center'));
    } else {
        bombs.push(new Bomb(ship.x + ship.width/4, ship.y + ship.height, 'right'));
    }
    bombsLeft--;
    safePlaySound('playBombDrop');
}

// 画面サイズに応じてキャンバスをリサイズ
function resizeCanvas() {
    const container = document.body;
    const maxWidth = Math.min(800, window.innerWidth - 40);
    const maxHeight = Math.min(600, window.innerHeight - 200);
    
    // アスペクト比を維持
    const aspectRatio = 800 / 600;
    let newWidth, newHeight;
    
    if (maxWidth / maxHeight > aspectRatio) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
    } else {
        newWidth = maxWidth;
        newHeight = newWidth / aspectRatio;
    }
    
    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
    
    // 船の位置を画面サイズに合わせて調整
    if (ship.x > canvas.width - ship.width) {
        ship.x = canvas.width - ship.width;
    }
}

// 初期表示設定とモバイル対応
window.addEventListener('load', function() {
    document.getElementById('startText').style.display = 'block';
    
    // モバイルデバイスの場合、タッチコントロールを表示
    if (isMobile) {
        document.getElementById('touchControls').style.display = 'block';
        resizeCanvas();
    }
    
    // 画面リサイズ対応
    window.addEventListener('resize', resizeCanvas);
    
    // 初回リサイズ
    resizeCanvas();
});

// ゲーム開始
gameLoop();