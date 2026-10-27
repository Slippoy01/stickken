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

        // Gamepad Subsystem State
        this.prevPadButtons = [{}, {}];
        this.prevPadAxes = [{}, {}];
        this.pad1Input = null;
        this.pad2Input = null;
        this.gamepadStatusEl = document.getElementById('gamepad-status-text');
        this.gamepadBadgeEl = document.getElementById('gamepad-badge-status');
        this.gamepadToastEl = document.getElementById('gamepad-toast');
        this.gamepadToastMsgEl = document.getElementById('gamepad-toast-msg');
        this.gamepadToastTimer = null;

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

        // Gamepad Connect / Disconnect Handlers
        window.addEventListener('gamepadconnected', (e) => {
            this.onGamepadConnected(e.gamepad);
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            this.onGamepadDisconnected(e.gamepad);
        });

        this.initTouchControls();
        this.updateGamepadBadge();
    }

    showGamepadToast(message, isDisconnect = false) {
        if (!this.gamepadToastEl || !this.gamepadToastMsgEl) return;
        this.gamepadToastMsgEl.textContent = message;
        if (isDisconnect) {
            this.gamepadToastEl.classList.add('toast-disconnect');
        } else {
            this.gamepadToastEl.classList.remove('toast-disconnect');
        }
        this.gamepadToastEl.classList.add('show');
        clearTimeout(this.gamepadToastTimer);
        this.gamepadToastTimer = setTimeout(() => {
            if (this.gamepadToastEl) this.gamepadToastEl.classList.remove('show');
        }, 3000);
    }

    onGamepadConnected(gp) {
        window.soundEngine.init();
        const pLabel = (gp.index === 0) ? "Player 1" : (gp.index === 1 ? "Player 2" : `#${gp.index + 1}`);
        const shortName = gp.id.split('(')[0].trim() || 'Gamepad';
        this.showGamepadToast(`🎮 ${shortName} terhubung (${pLabel})`);
        this.updateGamepadBadge();
        this.triggerGamepadRumble(gp.index, 100, 0.3, 0.5);
    }

    onGamepadDisconnected(gp) {
        this.showGamepadToast(`⚠️ Gamepad #${gp.index + 1} terputus`, true);
        this.updateGamepadBadge();
    }

    updateGamepadBadge() {
        const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
        const activePads = Array.from(rawPads).filter(p => p !== null && p.connected);
        if (!this.gamepadBadgeEl || !this.gamepadStatusEl) return;

        if (activePads.length > 0) {
            this.gamepadBadgeEl.className = 'gamepad-status-pill connected';
            if (activePads.length === 1) {
                const padName = activePads[0].id.split('(')[0].trim() || 'Controller';
                this.gamepadStatusEl.textContent = `🎮 P1: ${padName.slice(0, 16)}`;
            } else {
                this.gamepadStatusEl.textContent = `🎮 2 Gamepad Aktif (P1 & P2)`;
            }
        } else {
            this.gamepadBadgeEl.className = 'gamepad-status-pill disconnected';
            this.gamepadStatusEl.textContent = 'Gamepad Disconnected';
        }
    }

    triggerGamepadRumble(playerIndex = 0, durationMs = 120, weak = 0.4, strong = 0.7) {
        try {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = pads[playerIndex];
            if (pad && pad.vibrationActuator && pad.vibrationActuator.playEffect) {
                pad.vibrationActuator.playEffect('dual-rumble', {
                    startDelay: 0,
                    duration: durationMs,
                    weakMagnitude: weak,
                    strongMagnitude: strong
                }).catch(() => {});
            }
        } catch (e) {}
    }

    pollGamepadState() {
        const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad1 = rawPads[0];
        const pad2 = rawPads[1];

        this.pad1Input = this.readPadInput(pad1, 0);
        this.pad2Input = this.readPadInput(pad2, 1);

        // Global Gamepad Menu Navigation / Pause
        this.handleMenuGamepadInput(this.pad1Input || this.pad2Input);
    }

    readPadInput(pad, padIndex) {
        if (!pad || !pad.connected) {
            this.prevPadButtons[padIndex] = {};
            this.prevPadAxes[padIndex] = {};
            return null;
        }

        const prevBtns = this.prevPadButtons[padIndex] || {};
        const prevAxes = this.prevPadAxes[padIndex] || {};

        const isDown = (idx) => Boolean(pad.buttons && pad.buttons[idx] && (pad.buttons[idx].pressed || pad.buttons[idx].value > 0.45));
        const justPressed = (idx) => Boolean(isDown(idx) && !prevBtns[idx]);

        // Left Analog Stick Axes (-1 to +1)
        const axisX = (pad.axes && pad.axes[0] !== undefined) ? pad.axes[0] : 0;
        const axisY = (pad.axes && pad.axes[1] !== undefined) ? pad.axes[1] : 0;

        const stickLeft = axisX < -0.32;
        const stickRight = axisX > 0.32;
        const stickUp = axisY < -0.58;
        const stickDown = axisY > 0.48;

        const justStickUp = stickUp && !prevAxes.stickUp;
        const justStickLeft = stickLeft && !prevAxes.stickLeft;
        const justStickRight = stickRight && !prevAxes.stickRight;

        // Standard Button Mapping (W3C Standard Gamepad / Xbox / PlayStation)
        // 0: A (Cross) - Jump
        // 1: B (Circle) - Special Ki Blast
        // 2: X (Square) - Punch Combo
        // 3: Y (Triangle) - Kick Combo
        // 4: LB (L1) - Guard / Block
        // 5: RB (R1) - Dash
        // 6: LT (L2) - Guard / Special
        // 7: RT (R2) - Dash
        // 8: Back / Select
        // 9: Start / Options / Menu
        // 12: D-Pad Up (Jump)
        // 13: D-Pad Down (Block)
        // 14: D-Pad Left
        // 15: D-Pad Right
        const left = isDown(14) || stickLeft;
        const right = isDown(15) || stickRight;
        const jump = justPressed(0) || justPressed(12) || justStickUp;
        const punch = justPressed(2);
        const kick = justPressed(3);
        const dash = justPressed(5) || justPressed(7);
        const block = isDown(4) || isDown(13) || stickDown || (pad.buttons[6] && pad.buttons[6].value > 0.35);
        const special = justPressed(1) || (pad.buttons[6] && pad.buttons[6].value > 0.65 && !prevBtns.ltSpecial);
        const start = justPressed(9);
        const confirm = justPressed(0) || justPressed(9);

        // Record current button states for next frame edge detection
        const currentBtns = {};
        if (pad.buttons) {
            for (let i = 0; i < pad.buttons.length; i++) {
                currentBtns[i] = isDown(i);
            }
            currentBtns.ltSpecial = Boolean(pad.buttons[6] && pad.buttons[6].value > 0.65);
        }
        this.prevPadButtons[padIndex] = currentBtns;

        this.prevPadAxes[padIndex] = {
            stickUp,
            stickDown,
            stickLeft,
            stickRight
        };

        return {
            left,
            right,
            jump,
            punch,
            kick,
            dash,
            block,
            special,
            start,
            confirm,
            justLeft: justPressed(14) || justStickLeft,
            justRight: justPressed(15) || justStickRight
        };
    }

    handleMenuGamepadInput(input) {
        if (!input) return;

        if (this.matchState === 'MENU') {
            if (input.confirm) {
                const btn = document.getElementById('btn-start-fight');
                if (btn) btn.click();
            }
        } else if (this.matchState === 'PAUSED') {
            if (input.start || input.confirm) {
                this.togglePause();
            }
        } else if (this.matchState === 'MATCH_OVER') {
            if (input.confirm) {
                const btn = document.getElementById('btn-rematch');
                if (btn) btn.click();
            }
        } else if (this.matchState === 'FIGHTING') {
            if (input.start) {
                this.togglePause();
            }
        }
    }

    initTouchControls() {
        const bindPointerBtn = (id, onDown, onUp, isTapAction = false) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            let isPressed = false;
            let autoReleaseTimer = null;

            const handleDown = (e) => {
                if (e) {
                    e.preventDefault();
                    if (e.target && e.target.setPointerCapture && e.pointerId !== undefined) {
                        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
                    }
                }
                if (isPressed) return;
                isPressed = true;
                btn.classList.add('touch-active');
                window.soundEngine.init();

                // Physical vibration feedback on mobile phone
                if (navigator.vibrate) {
                    try { navigator.vibrate(22); } catch (_) {}
                }

                onDown();

                // Auto reset discrete tap actions after short trigger
                if (isTapAction) {
                    clearTimeout(autoReleaseTimer);
                    autoReleaseTimer = setTimeout(() => {
                        if (onUp) onUp();
                    }, 120);
                }
            };

            const handleUp = (e) => {
                if (e) e.preventDefault();
                if (!isPressed) return;
                isPressed = false;
                btn.classList.remove('touch-active');
                clearTimeout(autoReleaseTimer);
                if (onUp) onUp();
            };

            btn.addEventListener('pointerdown', handleDown);
            btn.addEventListener('pointerup', handleUp);
            btn.addEventListener('pointercancel', handleUp);
            btn.addEventListener('pointerleave', (e) => {
                if (!btn.hasPointerCapture || !btn.hasPointerCapture(e.pointerId)) {
                    handleUp(e);
                }
            });

            // Prevent context menu on long tap
            btn.addEventListener('contextmenu', (e) => e.preventDefault());
        };

        // Left Thumb: Movement & Dash
        bindPointerBtn('touch-left', () => this.keys['KeyA'] = true, () => this.keys['KeyA'] = false);
        bindPointerBtn('touch-right', () => this.keys['KeyD'] = true, () => this.keys['KeyD'] = false);
        bindPointerBtn('touch-jump', () => this.keys['KeyW'] = true, () => this.keys['KeyW'] = false, true);
        bindPointerBtn('touch-dash-l', () => this.keys['KeyL'] = true, () => this.keys['KeyL'] = false, true);
        bindPointerBtn('touch-dash', () => this.keys['KeyL'] = true, () => this.keys['KeyL'] = false, true);

        // Right Thumb: Combat Action Attacks
        bindPointerBtn('touch-punch', () => this.keys['KeyJ'] = true, () => this.keys['KeyJ'] = false, true);
        bindPointerBtn('touch-kick', () => this.keys['KeyK'] = true, () => this.keys['KeyK'] = false, true);
        bindPointerBtn('touch-block', () => this.keys['KeyI'] = true, () => this.keys['KeyI'] = false);
        bindPointerBtn('touch-special', () => this.keys['KeyU'] = true, () => this.keys['KeyU'] = false, true);
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

        // Auto display touch controls on mobile or if enabled by user
        const touchControls = document.getElementById('touch-controls');
        if (touchControls) {
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024) || (touchControls.dataset.userEnabled === 'true');
            if (isTouch) {
                touchControls.style.display = 'flex';
            }
        }

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

        // Poll Gamepad inputs every frame (continuous axes + edge-triggered buttons)
        this.pollGamepadState();

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

    // Player 1 Input Handler (Keyboard + Touch + Gamepad 1)
    handlePlayer1Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP') return;

        const pad = this.pad1Input;
        const is1PMode = (this.gameMode !== 'VERSUS_2P');

        const leftKey = this.keys['KeyA'] || (is1PMode && this.keys['ArrowLeft']) || (pad && pad.left);
        const rightKey = this.keys['KeyD'] || (is1PMode && this.keys['ArrowRight']) || (pad && pad.right);
        const jumpKey = this.keys['KeyW'] || this.keys['Space'] || (is1PMode && this.keys['ArrowUp']) || (pad && pad.jump);
        const blockKey = this.keys['KeyI'] || this.keys['KeyE'] || this.keys['KeyS'] || (pad && pad.block);

        const punchKey = this.keys['KeyJ'] || (pad && pad.punch);
        const kickKey = this.keys['KeyK'] || (pad && pad.kick);
        const dashKey = this.keys['KeyL'] || this.keys['ShiftLeft'] || (pad && pad.dash);
        const specialKey = this.keys['KeyU'] || this.keys['KeyQ'] || (pad && pad.special);

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
            if (pad) pad.special = false;
            p.setFacing(dirToOpponent);
            p.triggerAttack('SPECIAL');
            return;
        }

        // Shadow Dash (Dash in pressed direction, or toward opponent if neutral)
        if (dashKey) {
            this.keys['KeyL'] = false;
            this.keys['ShiftLeft'] = false;
            if (pad) pad.dash = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        // 3-Hit Punch Combo (1: Left Jab -> 2: Right Cross -> 3: Electric Uppercut)
        if (punchKey) {
            this.keys['KeyJ'] = false;
            if (pad) pad.punch = false;
            p.setFacing(dirToOpponent);
            p.requestPunchCombo();
            return;
        }

        // 3-Hit Kick Combo (1: Left High Kick -> 2: Right Heavy Kick -> 3: 360 Tornado Kick, or Air Divekick)
        if (kickKey) {
            this.keys['KeyK'] = false;
            if (pad) pad.kick = false;
            p.setFacing(dirToOpponent);
            p.requestKickCombo();
            return;
        }

        // Jump
        if (jumpKey && p.isGrounded && st !== 'ATTACK') {
            if (pad) pad.jump = false;
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

    // Player 2 Input Handler (Local 2-Player Versus Mode: Keyboard / Gamepad 2)
    handlePlayer2Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP') return;

        const pad = this.pad2Input;

        const leftKey = this.keys['ArrowLeft'] || this.keys['Numpad4'] || (pad && pad.left);
        const rightKey = this.keys['ArrowRight'] || this.keys['Numpad6'] || (pad && pad.right);
        const jumpKey = this.keys['ArrowUp'] || this.keys['Numpad8'] || (pad && pad.jump);
        const blockKey = this.keys['Numpad5'] || this.keys['KeyH'] || this.keys['ArrowDown'] || (pad && pad.block);

        const punchKey = this.keys['Numpad1'] || this.keys['KeyB'] || (pad && pad.punch);
        const kickKey = this.keys['Numpad2'] || this.keys['KeyN'] || (pad && pad.kick);
        const dashKey = this.keys['Numpad3'] || this.keys['KeyM'] || (pad && pad.dash);
        const specialKey = this.keys['Numpad0'] || this.keys['KeyG'] || (pad && pad.special);

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
            if (pad) pad.special = false;
            p.setFacing(dirToOpponent);
            p.triggerAttack('SPECIAL');
            return;
        }

        if (dashKey) {
            this.keys['Numpad3'] = false;
            this.keys['KeyM'] = false;
            if (pad) pad.dash = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        if (punchKey) {
            this.keys['Numpad1'] = false;
            this.keys['KeyB'] = false;
            if (pad) pad.punch = false;
            p.setFacing(dirToOpponent);
            p.requestPunchCombo();
            return;
        }

        if (kickKey) {
            this.keys['Numpad2'] = false;
            this.keys['KeyN'] = false;
            if (pad) pad.kick = false;
            p.setFacing(dirToOpponent);
            p.requestKickCombo();
            return;
        }

        if (jumpKey && p.isGrounded && st !== 'ATTACK') {
            if (pad) pad.jump = false;
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

                    // Gamepad Haptic Vibration Feedback
                    const victimIndex = (victim === this.player1) ? 0 : 1;
                    const attackerIndex = (attacker === this.player1) ? 0 : 1;
                    if (isHeavy) {
                        this.triggerGamepadRumble(victimIndex, 180, 0.6, 0.9);
                        this.triggerGamepadRumble(attackerIndex, 100, 0.3, 0.6);
                    } else {
                        this.triggerGamepadRumble(victimIndex, 80, 0.3, 0.5);
                    }

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

                // Gamepad explosion rumble
                this.triggerGamepadRumble(0, 220, 0.7, 1.0);
                this.triggerGamepadRumble(1, 220, 0.7, 1.0);

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
