/**
 * Stickman Shadow Showdown 3D - Main Game Engine
 * Collision physics, pushboxes, hitboxes, dynamic camera, round management,
 * input system (keyboard + touch), and game loop.
 */

class StickmanGame {
    constructor() {
        this.container = document.getElementById('game-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Game Modes: 'DUEL_AI', 'VERSUS_2P', 'SURVIVAL'
        this.gameMode = 'DUEL_AI';
        this.difficulty = 'normal'; // 'easy', 'normal', 'brutal'

        // Match State
        this.matchState = 'MENU'; // 'MENU', 'INTRO', 'FIGHTING', 'ROUND_OVER', 'MATCH_OVER', 'PAUSED'
        this.currentRound = 1;
        this.maxRounds = 3;
        this.p1RoundWins = 0;
        this.p2RoundWins = 0;
        this.roundTimer = 99;
        this.survivalScore = 0;
        this.survivalWave = 1;
        this.activeTimeouts = [];

        // Combo Trackers
        this.p1Combo = 0;
        this.p1ComboTimer = 0;
        this.p2Combo = 0;
        this.p2ComboTimer = 0;

        // Hitstop & Slow-motion mechanics
        this.hitstopTimer = 0;
        this.timeScale = 1.0;
        this.slowmoTimer = 0;

        // Input States
        this.keys = {};

        // Three.js Core
        this.initThree();

        // Subsystems
        this.vfx = new VFXManager(this.scene, this.camera);
        this.arena = new ArenaManager(this.scene);
        this.arena.buildArena('cyber');

        // Fighters
        this.player1 = null;
        this.player2 = null;
        this.ai = null;

        this.initFighters();
        this.initInput();
        this.initHUD();

        // Animation Loop
        this.clock = new THREE.Clock();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        // Resize Listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x06080e);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
        this.camera.position.set(0, 2.8, 10.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        this.container.appendChild(this.renderer.domElement);
    }

    initFighters() {
        // Player 1 (Hero - Cyan Neon)
        this.player1 = new Stickman(this.scene, this.vfx, {
            isPlayer: true,
            name: "HERO",
            accentColor: 0x00f0ff,
            startX: -4.0,
            facing: 1
        });

        // Player 2 / AI (Shadow - Crimson Neon)
        this.player2 = new Stickman(this.scene, this.vfx, {
            isPlayer: false,
            name: "SHADOW",
            accentColor: 0xff2244,
            startX: 4.0,
            facing: -1
        });

        this.ai = new FighterAI(this.player2, this.player1, this.difficulty);
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            window.soundEngine.init();
            this.keys[e.code] = true;

            if (e.code === 'KeyP' || e.code === 'Escape') {
                this.togglePause();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        this.initTouchControls();
    }

    initTouchControls() {
        const bindTouchBtn = (id, onDown, onUp) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const start = (e) => { e.preventDefault(); window.soundEngine.init(); onDown(); };
            const end = (e) => { e.preventDefault(); if (onUp) onUp(); };
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('touchend', end, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
        };

        bindTouchBtn('touch-left', () => this.keys['KeyA'] = true, () => this.keys['KeyA'] = false);
        bindTouchBtn('touch-right', () => this.keys['KeyD'] = true, () => this.keys['KeyD'] = false);
        bindTouchBtn('touch-jump', () => { this.keys['KeyW'] = true; setTimeout(() => this.keys['KeyW'] = false, 150); });
        bindTouchBtn('touch-punch', () => { this.keys['KeyJ'] = true; setTimeout(() => this.keys['KeyJ'] = false, 120); });
        bindTouchBtn('touch-kick', () => { this.keys['KeyK'] = true; setTimeout(() => this.keys['KeyK'] = false, 120); });
        bindTouchBtn('touch-dash', () => { this.keys['KeyL'] = true; setTimeout(() => this.keys['KeyL'] = false, 120); });
        bindTouchBtn('touch-block', () => this.keys['KeyI'] = true, () => this.keys['KeyI'] = false);
        bindTouchBtn('touch-special', () => { this.keys['KeyU'] = true; setTimeout(() => this.keys['KeyU'] = false, 120); });
    }

    initHUD() {
        this.p1HealthBar = document.getElementById('p1-health');
        this.p1GhostBar = document.getElementById('p1-ghost');
        this.p1EnergyBar = document.getElementById('p1-energy');
        this.p1NameLabel = document.getElementById('p1-name');

        this.p2HealthBar = document.getElementById('p2-health');
        this.p2GhostBar = document.getElementById('p2-ghost');
        this.p2EnergyBar = document.getElementById('p2-energy');
        this.p2NameLabel = document.getElementById('p2-name');

        this.timerLabel = document.getElementById('round-timer');
        this.banner = document.getElementById('announcement-banner');
        this.p1ComboBanner = document.getElementById('p1-combo-display');
        this.p2ComboBanner = document.getElementById('p2-combo-display');
    }

    clearRoundTimeouts() {
        this.activeTimeouts.forEach(id => clearTimeout(id));
        this.activeTimeouts = [];
    }

    scheduleTimeout(fn, ms) {
        const id = setTimeout(fn, ms);
        this.activeTimeouts.push(id);
        return id;
    }

    startMatch(mode = 'DUEL_AI', difficulty = 'normal') {
        window.soundEngine.init();
        this.clearRoundTimeouts();
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.ai.setDifficulty(difficulty);

        this.p1RoundWins = 0;
        this.p2RoundWins = 0;
        this.currentRound = 1;
        this.survivalScore = 0;
        this.survivalWave = 1;
        this.player1.maxHealth = 100;
        this.player2.maxHealth = 100;

        this.p1Combo = 0;
        this.p2Combo = 0;

        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('pause-modal').style.display = 'none';
        document.getElementById('victory-modal').style.display = 'none';
        document.getElementById('hud').style.display = 'block';

        this.p2NameLabel.textContent = (mode === 'VERSUS_2P') ? "PLAYER 2" : "SHADOW";

        this.updateRoundIndicators();
        this.startRound(this.currentRound);
    }

    startRound(roundNumber) {
        this.clearRoundTimeouts();
        this.matchState = 'INTRO';
        this.roundTimer = 99;
        this.hitstopTimer = 0;
        this.timeScale = 1.0;
        this.slowmoTimer = 0;
        this.p1Combo = 0;
        this.p2Combo = 0;

        // Reset Fighter positions & bones
        const isSurvivalNextWave = (this.gameMode === 'SURVIVAL' && this.survivalWave > 1);
        this.player1.reset(-4.0, 1, isSurvivalNextWave);
        this.player2.reset(4.0, -1, false);
        this.vfx.clear();

        let roundText = `ROUND ${roundNumber}`;
        if (roundNumber === 3 && this.gameMode !== 'SURVIVAL') roundText = "FINAL ROUND";
        if (this.gameMode === 'SURVIVAL') roundText = `WAVE ${this.survivalWave}`;

        this.showBanner(roundText, 1.1, () => {
            window.soundEngine.playFightBell();
            this.showBanner("FIGHT!", 0.75, () => {
                this.matchState = 'FIGHTING';
            });
        });
    }

    showBanner(text, duration = 1.0, callback = null) {
        this.banner.textContent = text;
        this.banner.style.display = 'block';
        this.banner.classList.remove('banner-pop');
        void this.banner.offsetWidth;
        this.banner.classList.add('banner-pop');

        this.scheduleTimeout(() => {
            this.banner.style.display = 'none';
            if (callback) callback();
        }, duration * 1000);
    }

    // Main Update Loop
    animate() {
        requestAnimationFrame(this.animate);

        let delta = this.clock.getDelta();
        if (delta > 0.08) delta = 0.08;

        if (this.matchState === 'PAUSED') {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Hitstop micro-pause on heavy hits
        if (this.hitstopTimer > 0) {
            this.hitstopTimer -= delta;
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Slow motion decay on KO
        if (this.slowmoTimer > 0) {
            this.slowmoTimer -= delta;
            this.timeScale = 0.22;
            if (this.slowmoTimer <= 0) {
                this.timeScale = 1.0;
            }
        }

        const effectiveDelta = delta * this.timeScale;

        // Update Arena
        this.arena.update(this.clock.getElapsedTime());

        // Update Match Logic
        if (this.matchState === 'FIGHTING') {
            this.updateRoundTimer(delta);
            this.handlePlayer1Input(this.player1, this.player2, effectiveDelta);

            if (this.gameMode === 'VERSUS_2P') {
                this.handlePlayer2Input(this.player2, this.player1, effectiveDelta);
            } else {
                this.ai.update(effectiveDelta);
            }
        }

        // Update Fighter Physics & Rig Animation
        this.player1.update(effectiveDelta, this.arena.bounds);
        this.player2.update(effectiveDelta, this.arena.bounds);

        // Resolve Character Body Pushbox Collision so fighters don't overlap
        if (this.matchState === 'FIGHTING' || this.matchState === 'INTRO') {
            this.resolveFighterPushbox();
        }

        // Update world matrices for accurate hitbox positions
        this.scene.updateMatrixWorld();

        if (this.matchState === 'FIGHTING') {
            this.checkCombatHits();
            this.checkProjectiles();
            this.checkRoundEnd();
        }

        // Update VFX
        this.vfx.update(effectiveDelta);

        // Update Dynamic Camera
        this.updateCamera(effectiveDelta);

        // Update HUD
        this.updateHUD();

        // Render Scene
        this.renderer.render(this.scene, this.camera);
    }

    // Pushbox collision: prevents fighters from standing inside each other
    resolveFighterPushbox() {
        const p1 = this.player1;
        const p2 = this.player2;

        if (p1.animState === 'KO' || p2.animState === 'KO') return;
        // Allow dashing or jumping past opponent if airborne
        if (Math.abs(p1.position.y - p2.position.y) > 1.1) return;

        const minSep = 0.88;
        const dx = p2.position.x - p1.position.x;
        const absDx = Math.abs(dx);

        if (absDx < minSep) {
            const overlap = (minSep - absDx) * 0.5;
            const pushDir = dx >= 0 ? 1 : -1;
            p1.position.x = Math.max(-this.arena.bounds, p1.position.x - pushDir * overlap);
            p2.position.x = Math.min(this.arena.bounds, p2.position.x + pushDir * overlap);
            p1.root.position.x = p1.position.x;
            p2.root.position.x = p2.position.x;
        }
    }

    // Dynamic Camera Tracking Fighters
    updateCamera(delta) {
        const p1 = this.player1.position;
        const p2 = this.player2.position;

        const midX = (p1.x + p2.x) * 0.5;
        const midY = Math.max(0, (p1.y + p2.y) * 0.5);
        const dist = Math.abs(p1.x - p2.x);

        const targetZ = Math.max(8.8, Math.min(14.5, 7.2 + dist * 0.65));
        const targetY = 2.25 + midY * 0.35;

        this.vfx.cameraTargetPos.set(midX * 0.85, targetY, targetZ);
        this.camera.lookAt(midX * 0.9, targetY - 0.55, 0);
    }

    // Player 1 Input Handler
    handlePlayer1Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP') return;

        const is1PMode = (this.gameMode !== 'VERSUS_2P');
        const leftKey = this.keys['KeyA'] || (is1PMode && this.keys['ArrowLeft']);
        const rightKey = this.keys['KeyD'] || (is1PMode && this.keys['ArrowRight']);
        const jumpKey = this.keys['KeyW'] || this.keys['Space'] || (is1PMode && this.keys['ArrowUp']);
        const blockKey = this.keys['KeyI'] || this.keys['KeyE'] || this.keys['KeyS'];

        const punchKey = this.keys['KeyJ'];
        const kickKey = this.keys['KeyK'];
        const dashKey = this.keys['KeyL'] || this.keys['ShiftLeft'];
        const specialKey = this.keys['KeyU'] || this.keys['KeyQ'];

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;

        // Guard / Block
        if (blockKey && st !== 'ATTACK' && st !== 'DASH') {
            p.setFacing(dirToOpponent);
            p.setBlock(true);
            p.moveDir = 0;
            return;
        } else {
            p.setBlock(false);
        }

        // Special Ki Blast
        if (specialKey) {
            this.keys['KeyU'] = false;
            this.keys['KeyQ'] = false;
            p.setFacing(dirToOpponent);
            p.triggerAttack('SPECIAL');
            return;
        }

        // Shadow Dash (Dash in pressed direction, or toward opponent if neutral)
        if (dashKey) {
            this.keys['KeyL'] = false;
            this.keys['ShiftLeft'] = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        // 3-Hit Punch Combo (1: Left Jab -> 2: Right Cross -> 3: Electric Uppercut)
        if (punchKey) {
            this.keys['KeyJ'] = false;
            p.setFacing(dirToOpponent);
            p.requestPunchCombo();
            return;
        }

        // 3-Hit Kick Combo (1: Left High Kick -> 2: Right Heavy Kick -> 3: 360 Tornado Kick, or Air Divekick)
        if (kickKey) {
            this.keys['KeyK'] = false;
            p.setFacing(dirToOpponent);
            p.requestKickCombo();
            return;
        }

        // Jump
        if (jumpKey && p.isGrounded && st !== 'ATTACK') {
            p.setFacing(dirToOpponent);
            p.triggerJump();
            return;
        }

        // Horizontal Movement
        if (st !== 'ATTACK' && st !== 'DASH') {
            p.setFacing(dirToOpponent);
            if (leftKey) {
                p.position.x -= p.walkSpeed * delta;
                p.moveDir = -1;
                if (p.isGrounded) p.animState = 'RUN';
            } else if (rightKey) {
                p.position.x += p.walkSpeed * delta;
                p.moveDir = 1;
                if (p.isGrounded) p.animState = 'RUN';
            } else {
                p.moveDir = 0;
                if (p.isGrounded) p.animState = 'IDLE';
            }
        }
    }

    // Player 2 Input Handler (Local 2-Player Versus Mode)
    handlePlayer2Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP') return;

        const leftKey = this.keys['ArrowLeft'] || this.keys['Numpad4'];
        const rightKey = this.keys['ArrowRight'] || this.keys['Numpad6'];
        const jumpKey = this.keys['ArrowUp'] || this.keys['Numpad8'];
        const blockKey = this.keys['Numpad5'] || this.keys['KeyH'] || this.keys['ArrowDown'];

        const punchKey = this.keys['Numpad1'] || this.keys['KeyB'];
        const kickKey = this.keys['Numpad2'] || this.keys['KeyN'];
        const dashKey = this.keys['Numpad3'] || this.keys['KeyM'];
        const specialKey = this.keys['Numpad0'] || this.keys['KeyG'];

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;

        if (blockKey && st !== 'ATTACK' && st !== 'DASH') {
            p.setFacing(dirToOpponent);
            p.setBlock(true);
            p.moveDir = 0;
            return;
        } else {
            p.setBlock(false);
        }

        if (specialKey) {
            this.keys['Numpad0'] = false;
            this.keys['KeyG'] = false;
            p.setFacing(dirToOpponent);
            p.triggerAttack('SPECIAL');
            return;
        }

        if (dashKey) {
            this.keys['Numpad3'] = false;
            this.keys['KeyM'] = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        if (punchKey) {
            this.keys['Numpad1'] = false;
            this.keys['KeyB'] = false;
            p.setFacing(dirToOpponent);
            p.requestPunchCombo();
            return;
        }

        if (kickKey) {
            this.keys['Numpad2'] = false;
            this.keys['KeyN'] = false;
            p.setFacing(dirToOpponent);
            p.requestKickCombo();
            return;
        }

        if (jumpKey && p.isGrounded && st !== 'ATTACK') {
            p.setFacing(dirToOpponent);
            p.triggerJump();
            return;
        }

        if (st !== 'ATTACK' && st !== 'DASH') {
            p.setFacing(dirToOpponent);
            if (leftKey) {
                p.position.x -= p.walkSpeed * delta;
                p.moveDir = -1;
                if (p.isGrounded) p.animState = 'RUN';
            } else if (rightKey) {
                p.position.x += p.walkSpeed * delta;
                p.moveDir = 1;
                if (p.isGrounded) p.animState = 'RUN';
            } else {
                p.moveDir = 0;
                if (p.isGrounded) p.animState = 'IDLE';
            }
        }
    }

    // Accurate 3D Strike & Range Hitbox Detection
    checkCombatHits() {
        const testHit = (attacker, victim, isP1Attacking) => {
            if (attacker.animState !== 'ATTACK' || attacker.attackPhase !== 1 || attacker.hitRegistered) return;
            if (attacker.attackType === 'SPECIAL') return; // handled by projectile

            let strikePos = null;
            let dmg = 8;
            let knockX = attacker.facing * 3.5;
            let knockY = 0;
            let isHeavy = false;
            let hitRadius = 0.92;
            let maxReachX = 1.55;

            switch (attacker.attackType) {
                case 'PUNCH_1': // 1. Left Jab
                    strikePos = attacker.getLeftHandWorldPos();
                    dmg = 7;
                    knockX = attacker.facing * 2.2;
                    maxReachX = 1.48;
                    break;
                case 'PUNCH_2': // 2. Right Power Cross
                    strikePos = attacker.getRightHandWorldPos();
                    dmg = 11;
                    knockX = attacker.facing * 2.8;
                    maxReachX = 1.56;
                    break;
                case 'PUNCH_3': // 3. Tekken Electric Uppercut Finisher!
                    strikePos = attacker.getRightHandWorldPos();
                    dmg = 20;
                    knockX = attacker.facing * 6.5;
                    knockY = 12.0;
                    isHeavy = true;
                    hitRadius = 1.05;
                    maxReachX = 1.65;
                    break;
                case 'KICK_1': // 1. Left High Roundhouse Kick
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 9;
                    knockX = attacker.facing * 2.5;
                    maxReachX = 1.62;
                    break;
                case 'KICK_2': // 2. Right Heavy Thrust Kick
                    strikePos = attacker.getRightFootWorldPos();
                    dmg = 13;
                    knockX = attacker.facing * 3.0;
                    maxReachX = 1.68;
                    break;
                case 'KICK_3': // 3. 360° Tornado Jumping Spin Kick Finisher!
                    strikePos = attacker.getRightFootWorldPos();
                    dmg = 22;
                    knockX = attacker.facing * 12.5;
                    knockY = 5.5;
                    isHeavy = true;
                    hitRadius = 1.15;
                    maxReachX = 1.80;
                    break;
                case 'AIR_KICK':
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 16;
                    knockX = attacker.facing * 8.5;
                    knockY = 2.5;
                    isHeavy = true;
                    hitRadius = 1.05;
                    maxReachX = 1.65;
                    break;
            }

            if (!strikePos) return;

            const victimChest = victim.getChestWorldPos();
            const victimHead = victim.getHeadWorldPos();
            const distChest = strikePos.distanceTo(victimChest);
            const distHead = strikePos.distanceTo(victimHead);

            // Also check horizontal fighting box (prevents point-blank whiffs)
            const signedDx = (victim.position.x - attacker.position.x) * attacker.facing;
            const dy = Math.abs(victim.position.y - attacker.position.y);
            const inStrikeBox = (signedDx >= -0.15 && signedDx <= maxReachX && dy < 1.25);

            if (distChest < hitRadius || distHead < hitRadius || inStrikeBox) {
                attacker.hitRegistered = true;

                const didHit = victim.takeDamage(dmg, knockX, knockY, isHeavy, attacker);
                if (didHit) {
                    // Hitstop micro-freeze for impact feel
                    this.hitstopTimer = isHeavy ? 0.065 : 0.038;

                    // Attacker gains Ki energy
                    attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 12);

                    // Update combo counter
                    if (isP1Attacking) {
                        this.p1Combo++;
                        this.p1ComboTimer = 2.0;
                        window.soundEngine.playComboSound(this.p1Combo);
                    } else {
                        this.p2Combo++;
                        this.p2ComboTimer = 2.0;
                        window.soundEngine.playComboSound(this.p2Combo);
                    }
                }
            }
        };

        testHit(this.player1, this.player2, true);
        testHit(this.player2, this.player1, false);
    }

    // Ki Blast projectile collision check
    checkProjectiles() {
        this.vfx.projectiles.forEach(p => {
            if (!p.alive) return;
            const target = (p.owner === this.player1) ? this.player2 : this.player1;
            const targetPos = target.getChestWorldPos();

            if (p.group.position.distanceTo(targetPos) < 1.05) {
                p.alive = false;
                window.soundEngine.playBlastExplode();
                this.vfx.spawnShockwave(p.group.position, p.colorHex, 3.0);
                this.vfx.spawnHitSparks(p.group.position, p.colorHex, 24, 1.8);
                this.vfx.triggerShake(0.55);

                target.takeDamage(p.damage, p.direction * 12.5, 5.5, true, p.owner);
            }
        });
    }

    // Round and Match Management
    checkRoundEnd() {
        if (this.player1.health <= 0 || this.player2.health <= 0 || this.roundTimer <= 0) {
            this.matchState = 'ROUND_OVER';
            this.slowmoTimer = 1.25;

            let winner = null;
            if (this.player1.health > this.player2.health) {
                winner = this.player1;
                this.p1RoundWins++;
                this.player1.animState = 'VICTORY';
                this.player1.animTime = 0;
            } else if (this.player2.health > this.player1.health) {
                winner = this.player2;
                this.p2RoundWins++;
                this.player2.animState = 'VICTORY';
                this.player2.animTime = 0;
            }

            this.updateRoundIndicators();

            this.scheduleTimeout(() => {
                const p2Label = (this.gameMode === 'VERSUS_2P') ? "PLAYER 2" : "SHADOW";
                const koText = winner ? (winner === this.player1 ? "HERO WINS!" : `${p2Label} WINS!`) : "DRAW!";
                this.showBanner(koText, 1.7, () => {
                    if (this.gameMode === 'SURVIVAL' && winner === this.player1) {
                        this.survivalWave++;
                        this.survivalScore += 1000 + Math.floor(this.player1.health * 10);
                        this.player1.health = Math.min(this.player1.maxHealth, this.player1.health + 40);
                        this.player1.prevHealth = this.player1.health;
                        this.player2.maxHealth = Math.min(250, 100 + (this.survivalWave - 1) * 20);
                        if (this.survivalWave >= 4) this.ai.setDifficulty('brutal');
                        else if (this.survivalWave >= 2) this.ai.setDifficulty('normal');
                        this.startRound(this.survivalWave);
                    } else if (this.p1RoundWins >= 2 || this.p2RoundWins >= 2 || this.gameMode === 'SURVIVAL') {
                        this.endMatch(winner);
                    } else {
                        this.currentRound++;
                        this.startRound(this.currentRound);
                    }
                });
            }, 950);
        }
    }

    endMatch(winner) {
        this.matchState = 'MATCH_OVER';
        const modal = document.getElementById('victory-modal');
        const title = document.getElementById('victory-title');
        const sub = document.getElementById('victory-sub');

        modal.style.display = 'flex';
        if (this.gameMode === 'SURVIVAL') {
            title.textContent = "SURVIVAL OVER";
            title.style.color = "#ffe600";
            sub.textContent = `Waves Cleared: ${this.survivalWave - 1} | Score: ${this.survivalScore}`;
        } else if (winner === this.player1) {
            title.textContent = "VICTORY!";
            title.style.color = "#00f0ff";
            sub.textContent = "HERO IS TRIUMPHANT!";
        } else {
            title.textContent = (this.gameMode === 'VERSUS_2P') ? "PLAYER 2 WINS!" : "DEFEAT";
            title.style.color = "#ff2244";
            sub.textContent = (this.gameMode === 'VERSUS_2P') ? "SHADOW CHAMPION!" : "SHADOW PREVAILS!";
        }
    }

    updateRoundTimer(delta) {
        this.roundTimer -= delta;
        if (this.roundTimer < 0) this.roundTimer = 0;
        this.timerLabel.textContent = Math.ceil(this.roundTimer);

        if (this.p1ComboTimer > 0) {
            this.p1ComboTimer -= delta;
            if (this.p1ComboTimer <= 0) this.p1Combo = 0;
        }
        if (this.p2ComboTimer > 0) {
            this.p2ComboTimer -= delta;
            if (this.p2ComboTimer <= 0) this.p2Combo = 0;
        }
    }

    updateRoundIndicators() {
        const p1Dots = document.querySelectorAll('#p1-rounds .round-dot');
        const p2Dots = document.querySelectorAll('#p2-rounds .round-dot');

        p1Dots.forEach((dot, idx) => {
            if (idx < this.p1RoundWins) dot.classList.add('won');
            else dot.classList.remove('won');
        });

        p2Dots.forEach((dot, idx) => {
            if (idx < this.p2RoundWins) dot.classList.add('won');
            else dot.classList.remove('won');
        });
    }

    updateHUD() {
        if (!this.player1 || !this.player2) return;

        const p1Pct = Math.max(0, (this.player1.health / this.player1.maxHealth) * 100);
        const p1GhostPct = Math.max(0, (this.player1.prevHealth / this.player1.maxHealth) * 100);
        const p1EnergyPct = Math.max(0, (this.player1.energy / this.player1.maxEnergy) * 100);

        this.p1HealthBar.style.width = `${p1Pct}%`;
        this.p1GhostBar.style.width = `${p1GhostPct}%`;
        this.p1EnergyBar.style.width = `${p1EnergyPct}%`;

        const p2Pct = Math.max(0, (this.player2.health / this.player2.maxHealth) * 100);
        const p2GhostPct = Math.max(0, (this.player2.prevHealth / this.player2.maxHealth) * 100);
        const p2EnergyPct = Math.max(0, (this.player2.energy / this.player2.maxEnergy) * 100);

        this.p2HealthBar.style.width = `${p2Pct}%`;
        this.p2GhostBar.style.width = `${p2GhostPct}%`;
        this.p2EnergyBar.style.width = `${p2EnergyPct}%`;

        if (this.p1Combo >= 2) {
            this.p1ComboBanner.style.display = 'block';
            this.p1ComboBanner.textContent = `${this.p1Combo} HITS!`;
        } else {
            this.p1ComboBanner.style.display = 'none';
        }

        if (this.p2Combo >= 2) {
            this.p2ComboBanner.style.display = 'block';
            this.p2ComboBanner.textContent = `${this.p2Combo} HITS!`;
        } else {
            this.p2ComboBanner.style.display = 'none';
        }
    }

    togglePause() {
        if (this.matchState === 'FIGHTING') {
            this.matchState = 'PAUSED';
            document.getElementById('pause-modal').style.display = 'flex';
        } else if (this.matchState === 'PAUSED') {
            this.matchState = 'FIGHTING';
            document.getElementById('pause-modal').style.display = 'none';
        }
    }

    switchArena(type) {
        this.arena.buildArena(type);
    }

    onWindowResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }
}

// Global Game instance initialization
window.addEventListener('DOMContentLoaded', () => {
    if (!window.game) {
        window.game = new StickmanGame();
    }
});
