/**
 * Stickman Shadow Showdown 3D - Main Game Engine
 * Collision physics, pushboxes, hitboxes, dynamic camera, round management,
 * input system (keyboard + touch + gamepad + WebRTC P2P Realtime Online PvP), and game loop.
 */

class StickmanGame {
    constructor() {
        this.container = document.getElementById('game-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Game Modes: 'DUEL_AI', 'VERSUS_2P', 'ONLINE_PVP', 'SURVIVAL'
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

        // WebRTC Online PvP Subsystem State
        this.isOnline = false;
        this.isHost = true;
        this.remoteKeys = { left: false, right: false, block: false };
        this.lastSentMove = { left: false, right: false, block: false };
        this.networkSyncTimer = 0;
        this.onlineHudPill = document.getElementById('online-hud-pill');
        this.onlineHudRole = document.getElementById('online-hud-role');
        this.onlineHudRoom = document.getElementById('online-hud-room');
        this.onlineHudPing = document.getElementById('online-hud-ping');

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
        this.initNetwork();

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

    // ==========================================
    // WEBRTC REALTIME ONLINE PVP SUBSYSTEM
    // ==========================================
    initNetwork() {
        const net = window.networkManager;
        if (!net) return;

        net.onConnected = ({ isHost, roomCode }) => {
            this.isOnline = true;
            this.isHost = isHost;
            console.log(`[Game] Online Match Connected! Role: ${isHost ? 'HOST (Hero)' : 'GUEST (Shadow)'}, Room: ${roomCode}`);

            // Close online lobby modal
            const onlineModal = document.getElementById('online-modal');
            if (onlineModal) onlineModal.style.display = 'none';

            // Show floating announcement
            const roleName = isHost ? "HERO (PLAYER 1)" : "SHADOW (PLAYER 2)";
            this.showOnlineToast(`🌐 LAWAN TERHUBUNG! Karaktermu: ${roleName}`);

            // Small delay for WebRTC handshake settling, then start match
            this.scheduleTimeout(() => {
                const selectArena = document.getElementById('select-arena');
                const arena = selectArena ? selectArena.value : 'cyber';
                this.switchArena(arena);
                this.startMatch('ONLINE_PVP', 'normal');
            }, 750);
        };

        net.onDisconnected = (reason) => {
            if (this.isOnline) {
                this.showOnlineToast(`⚠️ ${reason}`, true);
                if (this.matchState === 'FIGHTING' || this.matchState === 'INTRO') {
                    this.showBanner('DISCONNECTED', 2.0, () => {
                        this.isOnline = false;
                        location.reload();
                    });
                }
            }
            this.isOnline = false;
        };

        net.onPingUpdate = (ms) => {
            if (this.onlineHudPing) {
                this.onlineHudPing.textContent = `📶 ${ms}ms`;
                this.onlineHudPing.className = ms < 60 ? 'ping-good' : (ms < 120 ? 'ping-med' : 'ping-bad');
            }
        };

        net.onRemoteData = (data) => {
            this.handleRemotePacket(data);
        };
    }

    handleRemotePacket(data) {
        if (!data) return;

        // Continuous Movement state from remote player
        if (data.type === 'MOVE') {
            this.remoteKeys.left = Boolean(data.left);
            this.remoteKeys.right = Boolean(data.right);
            this.remoteKeys.block = Boolean(data.block);
            return;
        }

        // Discrete combat action triggers
        if (data.type === 'ACTION') {
            const p = this.isHost ? this.player2 : this.player1;
            const opp = this.isHost ? this.player1 : this.player2;
            const dir = opp.position.x >= p.position.x ? 1 : -1;

            if (data.act === 'PUNCH') {
                p.setFacing(dir);
                p.requestPunchCombo();
            } else if (data.act === 'KICK') {
                p.setFacing(dir);
                p.requestKickCombo();
            } else if (data.act === 'SPECIAL') {
                p.setFacing(dir);
                p.triggerAttack('SPECIAL');
            } else if (data.act === 'DASH') {
                p.setFacing(dir);
                p.triggerDash(data.dir || dir);
            } else if (data.act === 'JUMP') {
                if (p.isGrounded && p.animState !== 'ATTACK') {
                    p.setFacing(dir);
                    p.triggerJump();
                }
            }
            return;
        }

        // Periodic State Sync from Host (Guest applies it)
        if (data.type === 'SYNC' && !this.isHost) {
            this.applyHostSync(data);
            return;
        }

        // Round events
        if (data.type === 'ROUND_EVENT') {
            if (data.event === 'START_ROUND' && !this.isHost) {
                this.startRound(data.round);
            } else if (data.event === 'ROUND_OVER' && !this.isHost) {
                this.p1RoundWins = data.p1Wins;
                this.p2RoundWins = data.p2Wins;
                this.updateRoundIndicators();
            } else if (data.event === 'REMATCH') {
                this.startMatch('ONLINE_PVP', 'normal');
            } else if (data.event === 'REQUEST_REMATCH' && this.isHost) {
                this.showOnlineToast('Lawan meminta Rematch!');
            }
        }
    }

    updateNetworkHostSync(delta) {
        this.networkSyncTimer = (this.networkSyncTimer || 0) + delta;
        if (this.networkSyncTimer >= 1.2) {
            this.networkSyncTimer = 0;
            if (window.networkManager && window.networkManager.isConnected) {
                window.networkManager.send({
                    type: 'SYNC',
                    p1Hp: Math.round(this.player1.health),
                    p2Hp: Math.round(this.player2.health),
                    p1Energy: Math.round(this.player1.energy),
                    p2Energy: Math.round(this.player2.energy),
                    timer: Math.ceil(this.roundTimer),
                    round: this.currentRound,
                    p1Wins: this.p1RoundWins,
                    p2Wins: this.p2RoundWins,
                    p1X: Number(this.player1.position.x.toFixed(2)),
                    p2X: Number(this.player2.position.x.toFixed(2))
                });
            }
        }
    }

    applyHostSync(data) {
        if (!data) return;
        this.player1.health = data.p1Hp;
        this.player2.health = data.p2Hp;
        this.player1.energy = data.p1Energy;
        this.player2.energy = data.p2Energy;
        this.roundTimer = data.timer;
        this.currentRound = data.round;
        this.p1RoundWins = data.p1Wins;
        this.p2RoundWins = data.p2Wins;
        this.updateRoundIndicators();

        // Smooth position drift reconciliation (> 0.95 unit threshold)
        if (Math.abs(this.player1.position.x - data.p1X) > 0.95) {
            this.player1.position.x = data.p1X;
            this.player1.root.position.x = data.p1X;
        }
        if (Math.abs(this.player2.position.x - data.p2X) > 0.95) {
            this.player2.position.x = data.p2X;
            this.player2.root.position.x = data.p2X;
        }
    }

    showOnlineToast(msg, isWarn = false) {
        this.showGamepadToast(msg, isWarn);
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
        }, 3200);
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
        const justReleased = (idx) => Boolean(!isDown(idx) && prevBtns[idx]);

        // Left Analog Stick Axes (-1 to +1)
        const axisX = (pad.axes && pad.axes[0] !== undefined) ? pad.axes[0] : 0;
        const axisY = (pad.axes && pad.axes[1] !== undefined) ? pad.axes[1] : 0;

        const stickLeft = axisX < -0.32;
        const stickRight = axisX > 0.32;
        const stickUp = axisY < -0.55;
        const stickDown = axisY > 0.45;

        const justStickUp = stickUp && !prevAxes.stickUp;
        const justStickLeft = stickLeft && !prevAxes.stickLeft;
        const justStickRight = stickRight && !prevAxes.stickRight;

        const left = isDown(14) || stickLeft;
        const right = isDown(15) || stickRight;
        const down = isDown(13) || stickDown;
        const up = isDown(12) || stickUp;
        const jump = justPressed(12) || justStickUp || justPressed(4);

        // PS1 Kamen Rider Agito 4-Button Layout:
        // [□ Square / X] (Button 2)   = Attack / Hit Combo / Down+□ Sleding / Dash+□ Dash Attack
        // [✕ Cross / A] (Button 0)    = Hold for Guard (Stand/Duck Guard), Release for Dash!
        // [△ Triangle / Y] (Button 3) = Grapple Hug & Throw Slam (Breaks Guard!)
        // [○ Circle / B] (Button 1)   = Special Move (+ Directional Arrow)
        const square = justPressed(2);
        const crossHeld = isDown(0);
        const crossReleased = justReleased(0);
        const triangle = justPressed(3);
        const circle = justPressed(1);

        // Shoulder buttons L1/R1/L2/R2 also allow quick dash
        const dash = crossReleased || justPressed(5) || justPressed(6) || justPressed(7);

        const start = justPressed(9);
        const confirm = justPressed(0) || justPressed(9);

        const currentBtns = {};
        if (pad.buttons) {
            for (let i = 0; i < pad.buttons.length; i++) {
                currentBtns[i] = isDown(i);
            }
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
            down,
            up,
            jump,
            square,
            crossHeld,
            crossReleased,
            triangle,
            circle,
            dash,
            block: crossHeld,
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
                this.triggerRematch();
            }
        } else if (this.matchState === 'FIGHTING') {
            if (input.start && this.gameMode !== 'ONLINE_PVP') {
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

                if (navigator.vibrate) {
                    try { navigator.vibrate(22); } catch (_) {}
                }

                onDown();

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

            btn.addEventListener('contextmenu', (e) => e.preventDefault());
        };

        // Left Thumb: Movement & Crouch (D-Pad Only)
        bindPointerBtn('touch-left', () => this.keys['KeyA'] = true, () => this.keys['KeyA'] = false);
        bindPointerBtn('touch-right', () => this.keys['KeyD'] = true, () => this.keys['KeyD'] = false);
        bindPointerBtn('touch-down', () => this.keys['KeyS'] = true, () => this.keys['KeyS'] = false);
        bindPointerBtn('touch-jump', () => this.keys['KeyW'] = true, () => this.keys['KeyW'] = false, true);

        // Right Thumb: PS1 Kamen Rider Agito 4-Buttons (□, ✕, △, ○) + Right-Side Dash
        bindPointerBtn('touch-square', () => this.keys['KeyJ'] = true, () => this.keys['KeyJ'] = false, true);
        bindPointerBtn('touch-cross', () => this.keys['KeyK'] = true, () => this.keys['KeyK'] = false, false);
        bindPointerBtn('touch-triangle', () => this.keys['KeyI'] = true, () => this.keys['KeyI'] = false, true);
        bindPointerBtn('touch-circle', () => this.keys['KeyL'] = true, () => this.keys['KeyL'] = false, true);
        bindPointerBtn('touch-dash-r', () => this.keys['ShiftLeft'] = true, () => this.keys['ShiftLeft'] = false, true);
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

        // Configure UI for Online vs Local modes
        if (mode === 'ONLINE_PVP') {
            this.isOnline = true;
            this.isHost = window.networkManager ? window.networkManager.isHost : true;

            if (this.onlineHudPill) {
                this.onlineHudPill.style.display = 'flex';
                if (this.onlineHudRole) {
                    this.onlineHudRole.textContent = this.isHost ? 'P1 (HOST)' : 'P2 (GUEST)';
                }
                if (this.onlineHudRoom && window.networkManager) {
                    this.onlineHudRoom.textContent = `ROOM: ${window.networkManager.roomCode || 'ONLINE'}`;
                }
            }

            this.p1NameLabel.textContent = this.isHost ? "HERO (YOU)" : "HERO";
            this.p2NameLabel.textContent = this.isHost ? "SHADOW" : "SHADOW (YOU)";
        } else {
            this.isOnline = false;
            if (this.onlineHudPill) {
                this.onlineHudPill.style.display = 'none';
            }
            this.p1NameLabel.textContent = "HERO";
            this.p2NameLabel.textContent = (mode === 'VERSUS_2P') ? "PLAYER 2" : "SHADOW";
        }

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

        // Broadcast round start if host
        if (this.gameMode === 'ONLINE_PVP' && this.isHost && window.networkManager) {
            window.networkManager.send({
                type: 'ROUND_EVENT',
                event: 'START_ROUND',
                round: roundNumber
            });
        }

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

        // Poll Gamepad inputs every frame
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

            if (this.gameMode === 'ONLINE_PVP') {
                if (this.isHost) {
                    this.handleLocalFightingInput(this.player1, this.player2, effectiveDelta, true);
                    this.handleRemoteFightingInput(this.player2, this.player1, effectiveDelta);
                    this.updateNetworkHostSync(delta);
                } else {
                    this.handleRemoteFightingInput(this.player1, this.player2, effectiveDelta);
                    this.handleLocalFightingInput(this.player2, this.player1, effectiveDelta, false);
                }
            } else if (this.gameMode === 'VERSUS_2P') {
                this.handlePlayer1Input(this.player1, this.player2, effectiveDelta);
                this.handlePlayer2Input(this.player2, this.player1, effectiveDelta);
            } else {
                this.handlePlayer1Input(this.player1, this.player2, effectiveDelta);
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

    // ==========================================
    // LOCAL & REMOTE INPUT ROUTING
    // ==========================================

    // Online PvP: Handles local player input (Host controls P1, Guest controls P2)
    handleLocalFightingInput(p, opponent, delta, isP1) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP' || st === 'THROWN') {
            this.prevCrossKeyLocal = false;
            return;
        }

        const pad = this.pad1Input || this.pad2Input;

        const leftKey = Boolean(this.keys['KeyA'] || (isP1 && this.keys['ArrowLeft']) || (pad && pad.left));
        const rightKey = Boolean(this.keys['KeyD'] || (isP1 && this.keys['ArrowRight']) || (pad && pad.right));
        const downKey = Boolean(this.keys['KeyS'] || (isP1 && this.keys['ArrowDown']) || (pad && pad.down));
        const upKey = Boolean(this.keys['KeyW'] || (isP1 && this.keys['ArrowUp']) || (pad && pad.up));
        const jumpKey = Boolean(this.keys['KeyW'] || this.keys['Space'] || (isP1 && this.keys['ArrowUp']) || (pad && pad.jump));

        // PS1 Kamen Rider Agito 4-Face Buttons:
        // □ Square (KeyJ)   : Hit Combo / Down+□ Sleding / Dash+□ Dash Attack
        // ✕ Cross (KeyK/E)  : Hold = Guard, Release = Dash!
        // △ Triangle (KeyI/G): Peluk & Banting (Breaks Guard!)
        // ○ Circle (KeyL/U) : Special Move + Arah Panah
        const squareKey = Boolean(this.keys['KeyJ'] || (pad && pad.square));
        const crossKeyHeld = Boolean(this.keys['KeyK'] || this.keys['KeyE'] || (pad && pad.crossHeld));
        const crossKeyReleased = (!crossKeyHeld && Boolean(this.prevCrossKeyLocal)) || Boolean(pad && pad.crossReleased);
        this.prevCrossKeyLocal = crossKeyHeld;

        const triangleKey = Boolean(this.keys['KeyI'] || this.keys['KeyG'] || (pad && pad.triangle));
        const circleKey = Boolean(this.keys['KeyL'] || this.keys['KeyU'] || this.keys['KeyQ'] || (pad && pad.circle));
        const quickDashKey = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || (pad && pad.dash));

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;

        // Sync continuous state (movement, crouch, X-button guard) to remote peer
        const curMove = {
            left: leftKey,
            right: rightKey,
            down: downKey,
            block: crossKeyHeld
        };

        if (this.lastSentMove.left !== curMove.left ||
            this.lastSentMove.right !== curMove.right ||
            this.lastSentMove.down !== curMove.down ||
            this.lastSentMove.block !== curMove.block) {
            this.lastSentMove = curMove;
            if (window.networkManager && window.networkManager.isConnected) {
                window.networkManager.send({
                    type: 'MOVE',
                    left: curMove.left,
                    right: curMove.right,
                    down: curMove.down,
                    block: curMove.block
                });
            }
        }

        // Apply Guard (Hold ✕) & Crouch (Hold ⬇️):
        // Stand Guard = Hold ✕ standing; Duck Guard = Hold ⬇️ + ✕
        p.setFacing(dirToOpponent);
        p.setGuardAndCrouch(crossKeyHeld, downKey);

        // 1. Release ✕ (Cross) or Quick Dash -> Trigger DASH!
        if (crossKeyReleased || quickDashKey) {
            this.keys['ShiftLeft'] = false;
            this.keys['ShiftRight'] = false;
            if (pad) pad.dash = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            if (p.triggerDash(dashDir)) {
                if (window.networkManager && window.networkManager.isConnected) {
                    window.networkManager.send({ type: 'ACTION', act: 'DASH', dir: dashDir });
                }
            }
            return;
        }

        // 2. [△ Triangle]: Meluk & Banting (Grapple Throw - Tembus Guard ✕!)
        if (triangleKey) {
            this.keys['KeyI'] = false;
            this.keys['KeyG'] = false;
            if (pad) pad.triangle = false;
            p.setFacing(dirToOpponent);
            p.requestTriangleThrow(opponent);
            if (window.networkManager && window.networkManager.isConnected) {
                window.networkManager.send({ type: 'ACTION', act: 'THROW' });
            }
            return;
        }

        // 3. [○ Circle]: Special Moves + Kombinasi Arah Panah!
        if (circleKey) {
            this.keys['KeyL'] = false;
            this.keys['KeyU'] = false;
            this.keys['KeyQ'] = false;
            if (pad) pad.circle = false;
            p.setFacing(dirToOpponent);

            let specAct = 'SPECIAL';
            if (!p.isGrounded) {
                specAct = 'SPECIAL_DIVE';
            } else if (downKey) {
                specAct = 'SPECIAL_LOW';
            } else if (upKey || (leftKey && dirToOpponent > 0) || (rightKey && dirToOpponent < 0)) {
                specAct = 'SPECIAL_UPPER';
            }

            if (p.triggerAttack(specAct, true)) {
                if (window.networkManager && window.networkManager.isConnected) {
                    window.networkManager.send({ type: 'ACTION', act: specAct });
                }
            }
            return;
        }

        // 4. [□ Square]: Hit Combo / Down+□ Sleding / Dash+□ Dash Attack!
        if (squareKey) {
            this.keys['KeyJ'] = false;
            if (pad) pad.square = false;
            p.setFacing(dirToOpponent);

            let sqAct = 'SQUARE';
            if (!p.isGrounded) {
                sqAct = 'AIR_KICK';
            } else if (downKey || p.isCrouching) {
                sqAct = 'SLIDE_KICK';
            } else if (p.animState === 'DASH' || p.dashAttackWindow > 0) {
                sqAct = 'DASH_STRIKE';
            }

            p.requestSquareAttack(downKey, opponent);
            if (window.networkManager && window.networkManager.isConnected) {
                window.networkManager.send({ type: 'ACTION', act: sqAct });
            }
            return;
        }

        // 5. Jump (▲ Up / W / Space)
        if (jumpKey && p.isGrounded && st !== 'ATTACK' && !crossKeyHeld && !downKey) {
            this.keys['KeyW'] = false;
            this.keys['Space'] = false;
            if (pad) pad.jump = false;
            p.setFacing(dirToOpponent);
            p.triggerJump();
            if (window.networkManager && window.networkManager.isConnected) {
                window.networkManager.send({ type: 'ACTION', act: 'JUMP' });
            }
            return;
        }

        // 6. Horizontal Walk (Only when not guarding with ✕, not crouching, and not attacking)
        if (st !== 'ATTACK' && st !== 'DASH' && !crossKeyHeld && !downKey) {
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
        } else {
            p.moveDir = 0;
        }
    }

    // Online PvP: Applies received remote input to the remote fighter
    handleRemoteFightingInput(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP' || st === 'THROWN') return;

        const leftKey = Boolean(this.remoteKeys.left);
        const rightKey = Boolean(this.remoteKeys.right);
        const downKey = Boolean(this.remoteKeys.down);
        const blockKey = Boolean(this.remoteKeys.block);

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;
        p.setFacing(dirToOpponent);
        p.setGuardAndCrouch(blockKey, downKey);

        if (st !== 'ATTACK' && st !== 'DASH' && !blockKey && !downKey) {
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
        } else {
            p.moveDir = 0;
        }
    }

    // Player 1 Local Offline Input Handler (Kamen Rider Agito PS1 Controls)
    handlePlayer1Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP' || st === 'THROWN') {
            this.prevCrossKeyP1 = false;
            return;
        }

        const pad = this.pad1Input;
        const is1PMode = (this.gameMode !== 'VERSUS_2P');

        const leftKey = Boolean(this.keys['KeyA'] || (is1PMode && this.keys['ArrowLeft']) || (pad && pad.left));
        const rightKey = Boolean(this.keys['KeyD'] || (is1PMode && this.keys['ArrowRight']) || (pad && pad.right));
        const downKey = Boolean(this.keys['KeyS'] || (is1PMode && this.keys['ArrowDown']) || (pad && pad.down));
        const upKey = Boolean(this.keys['KeyW'] || (is1PMode && this.keys['ArrowUp']) || (pad && pad.up));
        const jumpKey = Boolean(this.keys['KeyW'] || this.keys['Space'] || (is1PMode && this.keys['ArrowUp']) || (pad && pad.jump));

        const squareKey = Boolean(this.keys['KeyJ'] || (pad && pad.square));
        const crossKeyHeld = Boolean(this.keys['KeyK'] || this.keys['KeyE'] || (pad && pad.crossHeld));
        const crossKeyReleased = (!crossKeyHeld && Boolean(this.prevCrossKeyP1)) || Boolean(pad && pad.crossReleased);
        this.prevCrossKeyP1 = crossKeyHeld;

        const triangleKey = Boolean(this.keys['KeyI'] || this.keys['KeyG'] || (pad && pad.triangle));
        const circleKey = Boolean(this.keys['KeyL'] || this.keys['KeyU'] || this.keys['KeyQ'] || (pad && pad.circle));
        const quickDashKey = Boolean(this.keys['ShiftLeft'] || (pad && pad.dash));

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;

        p.setFacing(dirToOpponent);
        p.setGuardAndCrouch(crossKeyHeld, downKey);

        // 1. Release ✕ (Cross) or Shift -> Dash!
        if (crossKeyReleased || quickDashKey) {
            this.keys['ShiftLeft'] = false;
            if (pad) pad.dash = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        // 2. [△ Triangle]: Meluk & Banting
        if (triangleKey) {
            this.keys['KeyI'] = false;
            this.keys['KeyG'] = false;
            if (pad) pad.triangle = false;
            p.setFacing(dirToOpponent);
            p.requestTriangleThrow(opponent);
            return;
        }

        // 3. [○ Circle]: Special Moves + Arah Panah
        if (circleKey) {
            this.keys['KeyL'] = false;
            this.keys['KeyU'] = false;
            this.keys['KeyQ'] = false;
            if (pad) pad.circle = false;
            p.setFacing(dirToOpponent);

            let specAct = 'SPECIAL';
            if (!p.isGrounded) {
                specAct = 'SPECIAL_DIVE';
            } else if (downKey) {
                specAct = 'SPECIAL_LOW';
            } else if (upKey || (leftKey && dirToOpponent > 0) || (rightKey && dirToOpponent < 0)) {
                specAct = 'SPECIAL_UPPER';
            }
            p.triggerAttack(specAct, true);
            return;
        }

        // 4. [□ Square]: Hit Combo / Sleding (Down+□) / Dash Attack (Dash+□)
        if (squareKey) {
            this.keys['KeyJ'] = false;
            if (pad) pad.square = false;
            p.setFacing(dirToOpponent);
            p.requestSquareAttack(downKey, opponent);
            return;
        }

        // 5. Jump
        if (jumpKey && p.isGrounded && st !== 'ATTACK' && !crossKeyHeld && !downKey) {
            this.keys['KeyW'] = false;
            this.keys['Space'] = false;
            if (pad) pad.jump = false;
            p.setFacing(dirToOpponent);
            p.triggerJump();
            return;
        }

        // 6. Walk
        if (st !== 'ATTACK' && st !== 'DASH' && !crossKeyHeld && !downKey) {
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
        } else {
            p.moveDir = 0;
        }
    }

    // Player 2 Local Offline Input Handler (2P Versus)
    handlePlayer2Input(p, opponent, delta) {
        const st = p.animState;
        if (st === 'KO' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP' || st === 'THROWN') {
            this.prevCrossKeyP2 = false;
            return;
        }

        const pad = this.pad2Input;

        const leftKey = Boolean(this.keys['ArrowLeft'] || (pad && pad.left));
        const rightKey = Boolean(this.keys['ArrowRight'] || (pad && pad.right));
        const downKey = Boolean(this.keys['ArrowDown'] || (pad && pad.down));
        const upKey = Boolean(this.keys['ArrowUp'] || (pad && pad.up));
        const jumpKey = Boolean(this.keys['ArrowUp'] || this.keys['Numpad8'] || (pad && pad.jump));

        // 2P Numpad / Secondary Keys:
        // □ Square: Numpad1 / KeyB
        // ✕ Cross : Numpad2 / KeyN (Hold = Guard, Release = Dash)
        // △ Tri   : Numpad4 / KeyM (Meluk & Banting)
        // ○ Circle: Numpad5 / KeyH (Special + Arah)
        const squareKey = Boolean(this.keys['Numpad1'] || this.keys['KeyB'] || (pad && pad.square));
        const crossKeyHeld = Boolean(this.keys['Numpad2'] || this.keys['KeyN'] || (pad && pad.crossHeld));
        const crossKeyReleased = (!crossKeyHeld && Boolean(this.prevCrossKeyP2)) || Boolean(pad && pad.crossReleased);
        this.prevCrossKeyP2 = crossKeyHeld;

        const triangleKey = Boolean(this.keys['Numpad4'] || this.keys['KeyM'] || this.keys['Numpad0'] || (pad && pad.triangle));
        const circleKey = Boolean(this.keys['Numpad5'] || this.keys['KeyH'] || this.keys['Numpad3'] || (pad && pad.circle));
        const quickDashKey = Boolean(this.keys['Numpad6'] || this.keys['ShiftRight'] || (pad && pad.dash));

        const dirToOpponent = opponent.position.x >= p.position.x ? 1 : -1;

        p.setFacing(dirToOpponent);
        p.setGuardAndCrouch(crossKeyHeld, downKey);

        if (crossKeyReleased || quickDashKey) {
            this.keys['Numpad6'] = false;
            this.keys['ShiftRight'] = false;
            if (pad) pad.dash = false;
            const dashDir = leftKey ? -1 : (rightKey ? 1 : dirToOpponent);
            p.setFacing(dirToOpponent);
            p.triggerDash(dashDir);
            return;
        }

        if (triangleKey) {
            this.keys['Numpad4'] = false;
            this.keys['KeyM'] = false;
            this.keys['Numpad0'] = false;
            if (pad) pad.triangle = false;
            p.setFacing(dirToOpponent);
            p.requestTriangleThrow(opponent);
            return;
        }

        if (circleKey) {
            this.keys['Numpad5'] = false;
            this.keys['KeyH'] = false;
            this.keys['Numpad3'] = false;
            if (pad) pad.circle = false;
            p.setFacing(dirToOpponent);

            let specAct = 'SPECIAL';
            if (!p.isGrounded) {
                specAct = 'SPECIAL_DIVE';
            } else if (downKey) {
                specAct = 'SPECIAL_LOW';
            } else if (upKey || (leftKey && dirToOpponent > 0) || (rightKey && dirToOpponent < 0)) {
                specAct = 'SPECIAL_UPPER';
            }
            p.triggerAttack(specAct, true);
            return;
        }

        if (squareKey) {
            this.keys['Numpad1'] = false;
            this.keys['KeyB'] = false;
            if (pad) pad.square = false;
            p.setFacing(dirToOpponent);
            p.requestSquareAttack(downKey, opponent);
            return;
        }

        if (jumpKey && p.isGrounded && st !== 'ATTACK' && !crossKeyHeld && !downKey) {
            this.keys['ArrowUp'] = false;
            this.keys['Numpad8'] = false;
            if (pad) pad.jump = false;
            p.setFacing(dirToOpponent);
            p.triggerJump();
            return;
        }

        if (st !== 'ATTACK' && st !== 'DASH' && !crossKeyHeld && !downKey) {
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
        } else {
            p.moveDir = 0;
        }
    }

    // Accurate 3D Strike & Range Hitbox Detection
    checkCombatHits() {
        const testHit = (attacker, victim, isP1Attacking) => {
            if (attacker.animState !== 'ATTACK' || attacker.attackPhase !== 1 || attacker.hitRegistered) return;
            if (attacker.attackType === 'SPECIAL' || attacker.attackType === 'THROW_SLAM' || attacker.attackType === 'THROW_ATTEMPT') return;

            let strikePos = null;
            let dmg = 8;
            let knockX = attacker.facing * 3.5;
            let knockY = 0;
            let isHeavy = false;
            let hitRadius = 0.96;
            let maxReachX = 1.62;

            switch (attacker.attackType) {
                case 'LP':
                case 'LP_2':
                case 'PUNCH_1': // Hit 1: Jab (High)
                    strikePos = attacker.getLeftHandWorldPos();
                    dmg = 7;
                    knockX = attacker.facing * 2.4;
                    maxReachX = 1.52;
                    break;

                case 'RP':
                case 'PUNCH_2': // Hit 2: Cross (High)
                    strikePos = attacker.getRightHandWorldPos();
                    dmg = 10;
                    knockX = attacker.facing * 3.0;
                    maxReachX = 1.60;
                    break;

                case 'LK':
                case 'RK':
                case 'KICK_1':
                case 'KICK_2': // Hit 3: Roundhouse Kick (High)
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 12;
                    knockX = attacker.facing * 3.6;
                    maxReachX = 1.68;
                    break;

                case '3_3_4_FINISHER':
                case '1_1_2_FINISHER':
                case 'KICK_3': // Hit 4: Tornado Finisher Kick (High)
                    strikePos = attacker.getRightFootWorldPos();
                    dmg = 20;
                    knockX = attacker.facing * 12.0;
                    knockY = 5.5;
                    isHeavy = true;
                    hitRadius = 1.15;
                    maxReachX = 1.82;
                    break;

                case 'DASH_STRIKE': // Dash + □: Dash Attack (High)
                    strikePos = attacker.getRightHandWorldPos();
                    dmg = 16;
                    knockX = attacker.facing * 10.0;
                    knockY = 3.5;
                    isHeavy = true;
                    hitRadius = 1.10;
                    maxReachX = 1.80;
                    break;

                case 'SLIDE_KICK':
                case 'DOWN_LK': // Down + □: Sleding / Low Slide Kick (Low!)
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 14;
                    knockX = attacker.facing * 6.5;
                    knockY = 5.0; // Sweeps feet off the ground into knockdown!
                    isHeavy = true;
                    hitRadius = 1.12;
                    maxReachX = 1.88;
                    break;

                case 'SPECIAL_UPPER':
                case 'UPPERCUT':
                case 'PUNCH_3': // Up + ○: Rising Dragon Uppercut (High Launcher!)
                    strikePos = attacker.getRightHandWorldPos();
                    dmg = 20;
                    knockX = attacker.facing * 5.2;
                    knockY = 12.2;
                    isHeavy = true;
                    hitRadius = 1.15;
                    maxReachX = 1.72;
                    break;

                case 'SPECIAL_LOW': // Down + ○: Ground Quake Smash (Low!)
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 18;
                    knockX = attacker.facing * 7.5;
                    knockY = 6.2;
                    isHeavy = true;
                    hitRadius = 1.38;
                    maxReachX = 2.18;
                    break;

                case 'SPECIAL_DIVE': // Air + ○: Flying Rider Dive Kick (High!)
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 22;
                    knockX = attacker.facing * 11.5;
                    knockY = 4.5;
                    isHeavy = true;
                    hitRadius = 1.22;
                    maxReachX = 1.85;
                    break;

                case 'AIR_KICK': // Jump + □
                    strikePos = attacker.getLeftFootWorldPos();
                    dmg = 15;
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
            const victimFoot = victim.getLeftFootWorldPos();
            const distChest = strikePos.distanceTo(victimChest);
            const distHead = strikePos.distanceTo(victimHead);
            const distFoot = strikePos.distanceTo(victimFoot);

            const signedDx = (victim.position.x - attacker.position.x) * attacker.facing;
            const dy = Math.abs(victim.position.y - attacker.position.y);
            const inStrikeBox = (signedDx >= -0.18 && signedDx <= maxReachX && dy < 1.35);

            if (distChest < hitRadius || distHead < hitRadius || distFoot < hitRadius || inStrikeBox) {
                attacker.hitRegistered = true;

                const hitLevel = Stickman.getAttackHitLevel(attacker.attackType);
                const didHit = victim.takeDamage(dmg, knockX, knockY, isHeavy, attacker, hitLevel);
                if (didHit) {
                    this.hitstopTimer = isHeavy ? 0.065 : 0.038;
                    attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 12);

                    const victimIndex = (victim === this.player1) ? 0 : 1;
                    const attackerIndex = (attacker === this.player1) ? 0 : 1;
                    if (isHeavy) {
                        this.triggerGamepadRumble(victimIndex, 180, 0.6, 0.9);
                        this.triggerGamepadRumble(attackerIndex, 100, 0.3, 0.6);
                    } else {
                        this.triggerGamepadRumble(victimIndex, 80, 0.3, 0.5);
                    }

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

            // In Online PvP, Host notifies Guest of round results
            if (this.gameMode === 'ONLINE_PVP' && this.isHost && window.networkManager) {
                window.networkManager.send({
                    type: 'ROUND_EVENT',
                    event: 'ROUND_OVER',
                    p1Wins: this.p1RoundWins,
                    p2Wins: this.p2RoundWins,
                    winner: winner === this.player1 ? 'P1' : (winner === this.player2 ? 'P2' : 'DRAW')
                });
            }

            this.updateRoundIndicators();

            this.scheduleTimeout(() => {
                let koText = "DRAW!";
                if (winner === this.player1) {
                    koText = (this.gameMode === 'ONLINE_PVP') ? (this.isHost ? "KAMU MENANG (P1)!" : "HERO (P1) WINS!") : "HERO WINS!";
                } else if (winner === this.player2) {
                    koText = (this.gameMode === 'ONLINE_PVP') ? (!this.isHost ? "KAMU MENANG (P2)!" : "SHADOW (P2) WINS!") : ((this.gameMode === 'VERSUS_2P') ? "PLAYER 2 WINS!" : "SHADOW WINS!");
                }

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
        } else if (this.gameMode === 'ONLINE_PVP') {
            const isLocalWinner = (winner === this.player1 && this.isHost) || (winner === this.player2 && !this.isHost);
            if (isLocalWinner) {
                title.textContent = "VICTORY!";
                title.style.color = "#00f0ff";
                sub.textContent = "KAMU MEMENANGKAN DUEL ONLINE INI!";
            } else if (!winner) {
                title.textContent = "DRAW!";
                title.style.color = "#ffe600";
                sub.textContent = "PERTANDINGAN BERAKHIR SERI!";
            } else {
                title.textContent = "DEFEAT!";
                title.style.color = "#ff2244";
                sub.textContent = "LAWANMEMENANGKAN DUEL ONLINE INI!";
            }
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

    triggerRematch() {
        if (this.gameMode === 'ONLINE_PVP') {
            if (window.networkManager && window.networkManager.isConnected) {
                if (this.isHost) {
                    window.networkManager.send({ type: 'ROUND_EVENT', event: 'REMATCH' });
                    this.startMatch('ONLINE_PVP', 'normal');
                } else {
                    window.networkManager.send({ type: 'ROUND_EVENT', event: 'REQUEST_REMATCH' });
                    this.showOnlineToast('Meminta Host untuk Rematch...');
                }
            }
        } else {
            this.startMatch(this.gameMode, this.difficulty);
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
        if (this.gameMode === 'ONLINE_PVP') {
            this.showOnlineToast('Game online tidak bisa dijeda!');
            return;
        }

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
