/**
 * Stickman Shadow Showdown 3D - Procedural Rig & Kamen Rider Agito (PS1) Combat System
 * Features:
 * - PS1 4-Button Architecture:
 *   [□ Square]   : 4-Hit Combo / Dash Attack (Dash + □) / Sliding Kick (Down + □) / Air Kick
 *   [✕ Cross]    : Hold = Guard (Stand Guard / Duck Guard), Release = Dash!
 *   [△ Triangle] : Grapple Hug & Throw Slam (Unblockable - breaks both Stand & Duck Guard!)
 *   [○ Circle]   : Directional Special Moves (Neutral/Fwd ○ = Energy Blast, Down ○ = Ground Quake Low,
 *                  Up ○ = Rising Dragon Launcher, Air ○ = Flying Rider Dive Kick!)
 * - 2-Tier Hit Level System: HIGH (Atas - blocked by Stand Guard) & LOW (Bawah - blocked by Duck Guard)
 */

class Stickman {
    constructor(scene, vfx, options = {}) {
        this.scene = scene;
        this.vfx = vfx;

        // Configuration
        this.isPlayer = options.isPlayer ?? true;
        this.name = options.name || (this.isPlayer ? "HERO" : "SHADOW");
        this.accentColor = options.accentColor || (this.isPlayer ? 0x00f0ff : 0xff2244);
        this.bodyColor = options.bodyColor || 0x181c26;
        this.facing = options.facing || 1; // 1 = facing right (+X), -1 = facing left (-X)

        // Combat Stats
        this.maxHealth = 100;
        this.health = 100;
        this.prevHealth = 100;
        this.maxEnergy = 100;
        this.energy = 60;
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;

        // Physics & Movement
        this.position = new THREE.Vector3(options.startX || 0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isGrounded = true;
        this.walkSpeed = 6.4;
        this.jumpForce = 12.4;
        this.gravity = -30.0;
        this.dashSpeed = 16.0;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.dashAttackWindow = 0; // Window to trigger Dash Attack (Dash + □)
        this.ghostSpawnTimer = 0;
        this.moveDir = 0; // -1, 0, 1

        // Animation & Combo State Machine
        // States: IDLE, RUN, CROUCH, CROUCH_BLOCK, JUMP, DASH, ATTACK, BLOCK, HURT, KNOCKDOWN, GETUP, THROWN, KO, VICTORY
        this.animState = 'IDLE';
        this.animTime = 0;
        this.attackType = null;
        this.attackPhase = 0; // 0 = chamber/windup, 1 = active strike & hold, 2 = recovery
        this.attackTimer = 0;
        this.attackDuration = 0;
        this.hitRegistered = false;

        // 4-Hit □ Combo Counter & Buffer
        this.comboStep = 0; // 1: Jab, 2: Cross, 3: Roundhouse Kick, 4: Tornado Finisher
        this.comboResetTimer = 0;
        this.queuedAttack = null;
        this.trailTimer = 0;

        // Throw / Grapple References
        this.throwVictim = null;
        this.throwAttacker = null;

        // Headband Cloth Segments
        this.headbandTails = [];

        // Base Stances
        this.GUARD_POSE = {
            hipsY: 0.89,
            hips: [0, -0.28, 0],
            spine: [0.10, 0.28, 0],
            neck: [-0.06, 0, 0],
            lShoulder: [-0.78, 0.18, 0.22],
            lElbow: -1.65,
            rShoulder: [-0.58, -0.22, -0.22],
            rElbow: -1.85,
            lHip: [-0.32, 0.12, 0.08],
            lKnee: 0.52,
            rHip: [0.22, -0.12, -0.08],
            rKnee: 0.38
        };

        this.CROUCH_POSE = {
            hipsY: 0.58,
            hips: [0.12, -0.22, 0],
            spine: [0.38, 0.22, 0],
            neck: [-0.25, 0, 0],
            lShoulder: [-0.68, 0.22, 0.25],
            lElbow: -1.75,
            rShoulder: [-0.55, -0.22, -0.25],
            rElbow: -1.85,
            lHip: [-0.90, 0.12, 0.08],
            lKnee: 1.50,
            rHip: [0.35, -0.12, -0.08],
            rKnee: 1.30
        };

        this.CROUCH_BLOCK_POSE = {
            hipsY: 0.55,
            hips: [0.15, -0.32, 0],
            spine: [0.42, 0.32, 0],
            neck: [-0.30, 0, 0],
            lShoulder: [-1.25, -0.20, 0.25],
            lElbow: -1.75,
            rShoulder: [-1.25, 0.20, -0.25],
            rElbow: -1.75,
            lHip: [-0.95, 0.15, 0.10],
            lKnee: 1.58,
            rHip: [0.40, -0.15, -0.10],
            rKnee: 1.38
        };

        this.buildMesh();
        this.setFacing(this.facing);
    }

    // 2-Level Hit System: HIGH (Atas) vs LOW (Bawah) + THROW (Banting)
    static getAttackHitLevel(attackType) {
        switch (attackType) {
            case 'SLIDE_KICK':
            case 'SPECIAL_LOW':
            case 'DOWN_LK':
            case 'LOW_KICK':
                return 'LOW';
            case 'THROW_SLAM':
                return 'THROW';
            default:
                return 'HIGH';
        }
    }

    buildMesh() {
        this.root = new THREE.Group();
        this.root.position.copy(this.position);

        this.bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.bodyColor,
            roughness: 0.28,
            metalness: 0.55
        });

        this.glowMaterial = new THREE.MeshStandardMaterial({
            color: this.accentColor,
            emissive: this.accentColor,
            emissiveIntensity: 0.95,
            roughness: 0.2,
            metalness: 0.4
        });

        this.eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });

        const createDownBone = (radiusTop, radiusBottom, height, mat = this.bodyMaterial) => {
            const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12);
            geo.translate(0, -height / 2, 0);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        const createUpBone = (radiusTop, radiusBottom, height, mat = this.bodyMaterial) => {
            const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12);
            geo.translate(0, height / 2, 0);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        const createJoint = (radius, mat = this.glowMaterial) => {
            const geo = new THREE.SphereGeometry(radius, 12, 12);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            return mesh;
        };

        // 1. Hips
        this.hips = new THREE.Group();
        this.hips.position.set(0, 0.90, 0);
        this.root.add(this.hips);

        this.hipMesh = createJoint(0.125, this.bodyMaterial);
        this.hips.add(this.hipMesh);

        const beltGeo = new THREE.CylinderGeometry(0.128, 0.128, 0.045, 16);
        const beltMesh = new THREE.Mesh(beltGeo, this.glowMaterial);
        this.hips.add(beltMesh);

        // 2. Spine & Chest
        this.spine = new THREE.Group();
        this.hips.add(this.spine);

        this.spineBone = createUpBone(0.10, 0.085, 0.36);
        this.spine.add(this.spineBone);

        this.chest = new THREE.Group();
        this.chest.position.set(0, 0.36, 0);
        this.spine.add(this.chest);

        this.chestMesh = createJoint(0.14, this.bodyMaterial);
        this.chest.add(this.chestMesh);

        const coreGeo = new THREE.SphereGeometry(0.06, 10, 10);
        const coreMesh = new THREE.Mesh(coreGeo, this.glowMaterial);
        coreMesh.position.set(0, 0, 0.11);
        this.chest.add(coreMesh);

        // 3. Neck & Head
        this.neck = new THREE.Group();
        this.neck.position.set(0, 0.14, 0);
        this.chest.add(this.neck);

        const headGeo = new THREE.SphereGeometry(0.20, 16, 16);
        this.headMesh = new THREE.Mesh(headGeo, this.bodyMaterial);
        this.headMesh.position.set(0, 0.20, 0);
        this.headMesh.castShadow = true;
        this.neck.add(this.headMesh);

        const bandGeo = new THREE.CylinderGeometry(0.206, 0.206, 0.055, 16, 1, true);
        const bandMesh = new THREE.Mesh(bandGeo, this.glowMaterial);
        bandMesh.position.set(0, 0.22, 0);
        this.neck.add(bandMesh);

        const eyeGeo = new THREE.BoxGeometry(0.075, 0.026, 0.04);
        this.leftEye = new THREE.Mesh(eyeGeo, this.eyeMaterial);
        this.leftEye.position.set(0.065, 0.22, 0.18);
        this.leftEye.rotation.set(0, 0.2, -0.12);
        this.neck.add(this.leftEye);

        this.rightEye = new THREE.Mesh(eyeGeo, this.eyeMaterial);
        this.rightEye.position.set(-0.065, 0.22, 0.18);
        this.rightEye.rotation.set(0, -0.2, 0.12);
        this.neck.add(this.rightEye);

        for (let t = 0; t < 2; t++) {
            const tailRoot = new THREE.Group();
            tailRoot.position.set(t === 0 ? 0.045 : -0.045, 0.22, -0.19);
            this.neck.add(tailRoot);

            const segments = [];
            let parentNode = tailRoot;
            for (let s = 0; s < 3; s++) {
                const segGeo = new THREE.BoxGeometry(0.042, 0.13, 0.015);
                segGeo.translate(0, -0.065, 0);
                const segMesh = new THREE.Mesh(segGeo, this.glowMaterial);
                const segNode = new THREE.Group();
                segNode.add(segMesh);
                if (s > 0) segNode.position.y = -0.13;
                parentNode.add(segNode);
                parentNode = segNode;
                segments.push(segNode);
            }
            this.headbandTails.push(segments);
        }

        // 4. Arms
        const buildArm = (isLeft) => {
            const side = isLeft ? 1 : -1;
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.22, 0.06, 0);
            this.chest.add(shoulder);

            const shoulderJoint = createJoint(0.065, this.glowMaterial);
            shoulder.add(shoulderJoint);

            const upperArm = createDownBone(0.055, 0.048, 0.31);
            shoulder.add(upperArm);

            const elbow = new THREE.Group();
            elbow.position.set(0, -0.31, 0);
            shoulder.add(elbow);

            const elbowJoint = createJoint(0.052, this.glowMaterial);
            elbow.add(elbowJoint);

            const forearm = createDownBone(0.048, 0.042, 0.31);
            elbow.add(forearm);

            const hand = new THREE.Group();
            hand.position.set(0, -0.31, 0);
            elbow.add(hand);

            const fistMesh = createJoint(0.078, this.glowMaterial);
            hand.add(fistMesh);

            return { shoulder, elbow, hand, fistMesh };
        };

        this.leftArm = buildArm(true);
        this.rightArm = buildArm(false);

        // 5. Legs
        const buildLeg = (isLeft) => {
            const side = isLeft ? 1 : -1;
            const hipJoint = new THREE.Group();
            hipJoint.position.set(side * 0.12, -0.04, 0);
            this.hips.add(hipJoint);

            const hipSphere = createJoint(0.068, this.glowMaterial);
            hipJoint.add(hipSphere);

            const thigh = createDownBone(0.065, 0.052, 0.43);
            hipJoint.add(thigh);

            const knee = new THREE.Group();
            knee.position.set(0, -0.43, 0);
            hipJoint.add(knee);

            const kneeSphere = createJoint(0.058, this.glowMaterial);
            knee.add(kneeSphere);

            const shin = createDownBone(0.052, 0.042, 0.43);
            knee.add(shin);

            const foot = new THREE.Group();
            foot.position.set(0, -0.43, 0);
            knee.add(foot);

            const footGeo = new THREE.BoxGeometry(0.095, 0.06, 0.20);
            footGeo.translate(0, -0.02, 0.06);
            const footMesh = new THREE.Mesh(footGeo, this.glowMaterial);
            foot.add(footMesh);

            return { hipJoint, knee, foot, footMesh };
        };

        this.leftLeg = buildLeg(true);
        this.rightLeg = buildLeg(false);

        this.scene.add(this.root);
    }

    setFacing(dir) {
        this.facing = dir >= 0 ? 1 : -1;
        this.root.rotation.set(0, this.facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    }

    getLeftHandWorldPos() {
        const v = new THREE.Vector3();
        this.leftArm.hand.getWorldPosition(v);
        return v;
    }

    getRightHandWorldPos() {
        const v = new THREE.Vector3();
        this.rightArm.hand.getWorldPosition(v);
        return v;
    }

    getLeftFootWorldPos() {
        const v = new THREE.Vector3();
        this.leftLeg.foot.getWorldPosition(v);
        return v;
    }

    getRightFootWorldPos() {
        const v = new THREE.Vector3();
        this.rightLeg.foot.getWorldPosition(v);
        return v;
    }

    getChestWorldPos() {
        const v = new THREE.Vector3();
        this.chest.getWorldPosition(v);
        return v;
    }

    getHeadWorldPos() {
        const v = new THREE.Vector3();
        this.neck.getWorldPosition(v);
        return v;
    }

    // Set Guard & Crouch states (Kamen Rider Agito X-Button Guard / Down Crouch)
    setGuardAndCrouch(isHoldingGuard, isHoldingDown) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' ||
            this.animState === 'THROWN' || this.animState === 'KO' || this.animState === 'ATTACK' || this.animState === 'DASH') {
            return;
        }

        this.isCrouching = Boolean(isHoldingDown);
        this.isBlocking = Boolean(isHoldingGuard && !isHoldingDown);
        this.isCrouchBlocking = Boolean(isHoldingGuard && isHoldingDown);

        if (this.isCrouchBlocking) {
            this.animState = 'CROUCH_BLOCK';
        } else if (this.isBlocking) {
            this.animState = 'BLOCK';
        } else if (this.isCrouching) {
            this.animState = 'CROUCH';
        } else if (this.animState === 'BLOCK' || this.animState === 'CROUCH' || this.animState === 'CROUCH_BLOCK') {
            this.animState = 'IDLE';
        }
    }

    setCrouch(isCrouching, isBlockingBack = false) {
        this.setGuardAndCrouch(isBlockingBack, isCrouching);
    }

    setBlock(isBlocking) {
        this.setGuardAndCrouch(isBlocking, this.isCrouching);
    }

    // =========================================================================
    // KAMEN RIDER AGITO PS1 COMMAND PROCESSOR
    // =========================================================================

    // [□ Square Button]: Hit Combo / Dash Attack / Low Slide Kick (Sleding) / Air Kick
    requestSquareAttack(isDownHeld = false, opponent = null) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' ||
            this.animState === 'THROWN' || this.animState === 'KO') {
            return false;
        }

        // 1. Air Attack (Jump + □)
        if (!this.isGrounded) {
            return this.triggerAttack('AIR_KICK');
        }

        // 2. Sliding Kick / Sleding (Down ⬇️ + □)
        if (isDownHeld || this.isCrouching) {
            this.queuedAttack = null;
            this.comboStep = 0;
            return this.triggerAttack('SLIDE_KICK', true);
        }

        // 3. Dash Attack (During Dash or right after releasing ✕ to Dash + □)
        if (this.animState === 'DASH' || this.dashAttackWindow > 0) {
            this.dashAttackWindow = 0;
            this.queuedAttack = null;
            this.comboStep = 0;
            return this.triggerAttack('DASH_STRIKE', true);
        }

        // 4. 4-Hit Agito Basic Combo (□ -> □ -> □ -> □)
        const comboChain = ['LP', 'RP', 'LK', '3_3_4_FINISHER'];

        if (this.animState === 'ATTACK') {
            if (this.attackTimer > 0.05 && !this.queuedAttack) {
                this.comboStep = (this.comboStep % 4) + 1;
                this.queuedAttack = comboChain[this.comboStep - 1];
                return true;
            }
            return false;
        }

        this.comboStep = (this.comboStep % 4) + 1;
        return this.triggerAttack(comboChain[this.comboStep - 1]);
    }

    // [△ Triangle Button]: Grapple Hug & Slam (Breaks BOTH Stand Guard & Duck Guard!)
    requestTriangleThrow(opponent = null) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' ||
            this.animState === 'THROWN' || this.animState === 'KO' || !this.isGrounded) {
            return false;
        }

        if (opponent) {
            const dist = Math.abs(this.position.x - opponent.position.x);
            const oppSt = opponent.animState;
            // Hits even if opponent is in BLOCK or CROUCH_BLOCK!
            const canBeThrown = (
                dist < 1.82 &&
                oppSt !== 'KNOCKDOWN' &&
                oppSt !== 'GETUP' &&
                oppSt !== 'THROWN' &&
                oppSt !== 'KO' &&
                opponent.isGrounded &&
                !opponent.isInvulnerable
            );
            if (canBeThrown) {
                this.executeThrowOn(opponent);
                return true;
            }
        }
        return this.triggerAttack('THROW_ATTEMPT', true);
    }

    // [○ Circle Button]: Directional Special Moves
    // dir: 'NEUTRAL', 'FORWARD', 'DOWN', 'UP', 'BACK', 'AIR'
    requestCircleSpecial(dir = 'NEUTRAL') {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' ||
            this.animState === 'THROWN' || this.animState === 'KO') {
            return false;
        }

        if (!this.isGrounded || dir === 'AIR') {
            return this.triggerAttack('SPECIAL_DIVE', true);
        }
        if (dir === 'DOWN' || this.isCrouching) {
            return this.triggerAttack('SPECIAL_LOW', true);
        }
        if (dir === 'UP' || dir === 'BACK') {
            return this.triggerAttack('SPECIAL_UPPER', true);
        }
        return this.triggerAttack('SPECIAL', true);
    }

    // Unified command router for network & AI compatibility
    requestTekkenCommand(cmd, opponent = null) {
        switch (cmd) {
            case 'SQUARE':
            case 'LP':
            case 'PUNCH':
                return this.requestSquareAttack(false, opponent);
            case 'SLIDE_KICK':
            case 'DOWN_LK':
                return this.triggerAttack('SLIDE_KICK', true);
            case 'DASH_STRIKE':
                return this.triggerAttack('DASH_STRIKE', true);
            case 'THROW':
                return this.requestTriangleThrow(opponent);
            case 'SPECIAL':
            case 'SPECIAL_BLAST':
                return this.triggerAttack('SPECIAL', true);
            case 'SPECIAL_LOW':
                return this.triggerAttack('SPECIAL_LOW', true);
            case 'SPECIAL_UPPER':
            case 'UPPERCUT':
                return this.triggerAttack('SPECIAL_UPPER', true);
            case 'SPECIAL_DIVE':
                return this.triggerAttack('SPECIAL_DIVE', true);
            default:
                return this.triggerAttack(cmd, true);
        }
    }

    requestPunchCombo() {
        return this.requestSquareAttack(false);
    }

    requestKickCombo() {
        return this.requestSquareAttack(this.isCrouching);
    }

    // Execute Grapple Hug & Slam on Victim
    executeThrowOn(victim) {
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.animState = 'ATTACK';
        this.attackType = 'THROW_SLAM';
        this.attackDuration = 0.84;
        this.attackTimer = 0;
        this.attackPhase = 1;
        this.hitRegistered = false;
        this.throwVictim = victim;

        victim.animState = 'THROWN';
        victim.attackType = null;
        victim.queuedAttack = null;
        victim.isBlocking = false;
        victim.isCrouching = false;
        victim.isCrouchBlocking = false;
        victim.isInvulnerable = true;
        victim.invulnerableTimer = 0.95;
        victim.throwAttacker = this;
        victim.animTime = 0;

        window.soundEngine.playThrowGrab();
        this.vfx.spawnHitSparks(this.getChestWorldPos(), 0x00f0ff, 12, 1.0);
        this.vfx.spawnDamageNumber(victim.getHeadWorldPos(), 'GRABBED!', 'crit');
    }

    // Execute a specific attack move immediately
    triggerAttack(type, isComboChain = false) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' ||
            this.animState === 'THROWN' || this.animState === 'KO') {
            return false;
        }
        if (!isComboChain && this.animState === 'ATTACK' && this.attackPhase < 2) {
            return false;
        }

        // Special energy cost check (25 energy so directional specials are fun & frequent!)
        if (type === 'SPECIAL' || type === 'SPECIAL_LOW' || type === 'SPECIAL_UPPER' || type === 'SPECIAL_DIVE') {
            if (this.energy < 25) return false;
            this.energy -= 25;
        }

        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.animState = 'ATTACK';
        this.attackType = type;
        this.attackPhase = 0;
        this.attackTimer = 0;
        this.hitRegistered = false;
        this.comboResetTimer = 1.10;
        this.trailTimer = 0;

        switch (type) {
            case 'LP':
            case 'PUNCH_1': // Hit 1: Snapping Jab (High)
                this.attackDuration = 0.24;
                if (this.isGrounded) this.velocity.x = this.facing * 3.5;
                window.soundEngine.playPunchSwing();
                break;

            case 'LP_2':
            case 'RP':
            case 'PUNCH_2': // Hit 2: Power Right Cross (High)
                this.attackDuration = 0.27;
                if (this.isGrounded) this.velocity.x = this.facing * 4.5;
                window.soundEngine.playPunchSwing();
                break;

            case 'LK':
            case 'KICK_1':
            case 'RK':
            case 'KICK_2': // Hit 3: Roundhouse Kick (High)
                this.attackDuration = 0.32;
                if (this.isGrounded) this.velocity.x = this.facing * 4.8;
                window.soundEngine.playKickSwing();
                break;

            case '3_3_4_FINISHER':
            case '1_1_2_FINISHER':
            case 'KICK_3': // Hit 4: 360 Tornado Finisher Kick (High)
                this.attackDuration = 0.50;
                if (this.isGrounded) {
                    this.velocity.x = this.facing * 7.5;
                    this.velocity.y = 6.2;
                    this.isGrounded = false;
                }
                window.soundEngine.playKickSwing();
                break;

            case 'DASH_STRIKE': // Dash + □: Lunging Dash Punch / Flying Knee! (High)
                this.attackDuration = 0.38;
                this.velocity.x = this.facing * 14.5;
                window.soundEngine.playDash();
                window.soundEngine.playPunchSwing();
                this.vfx.spawnGhostTrail(this.root, this.accentColor);
                break;

            case 'SLIDE_KICK':
            case 'DOWN_LK': // Down + □: Sleding / Low Sliding Kick! (Low)
                this.attackDuration = 0.44;
                if (this.isGrounded) this.velocity.x = this.facing * 13.5;
                window.soundEngine.playDash();
                window.soundEngine.playKickSwing();
                this.vfx.spawnGroundDust(this.position, 6);
                break;

            case 'SPECIAL_UPPER':
            case 'UPPERCUT':
            case 'PUNCH_3': // Up + ○: Rising Dragon Uppercut Launcher! (High)
                this.attackDuration = 0.45;
                if (this.isGrounded) {
                    this.velocity.x = this.facing * 6.0;
                    this.velocity.y = 7.5;
                    this.isGrounded = false;
                }
                window.soundEngine.playSpecialCharge();
                window.soundEngine.playPunchSwing();
                break;

            case 'SPECIAL_LOW': // Down + ○: Earthquake Ground Smash! (Low)
                this.attackDuration = 0.46;
                if (this.isGrounded) this.velocity.x = this.facing * 2.5;
                window.soundEngine.playSpecialCharge();
                break;

            case 'SPECIAL_DIVE': // Air + ○: Flying Rider Dive Kick! (High)
                this.attackDuration = 0.44;
                this.velocity.x = this.facing * 13.5;
                this.velocity.y = -14.0;
                window.soundEngine.playDash();
                window.soundEngine.playKickSwing();
                this.vfx.spawnGhostTrail(this.root, 0xffea00);
                break;

            case 'AIR_KICK':
                this.attackDuration = 0.38;
                this.velocity.x = this.facing * 8.5;
                window.soundEngine.playKickSwing();
                break;

            case 'THROW_ATTEMPT':
                this.attackDuration = 0.34;
                if (this.isGrounded) this.velocity.x = this.facing * 3.2;
                window.soundEngine.playPunchSwing();
                break;

            case 'SPECIAL':
                this.attackDuration = 0.50;
                this.queuedAttack = null;
                window.soundEngine.playSpecialCharge();
                break;
        }

        return true;
    }

    triggerDash(direction) {
        if (this.dashCooldown > 0 || this.animState === 'HURT' || this.animState === 'KNOCKDOWN' ||
            this.animState === 'GETUP' || this.animState === 'THROWN' || this.animState === 'KO') {
            return false;
        }
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.queuedAttack = null;
        this.animState = 'DASH';
        this.animTime = 0;
        this.dashTimer = 0.24;
        this.dashCooldown = 0.38;
        this.dashAttackWindow = 0.38; // Allows pressing □ during or right after dash for Dash Attack!
        this.ghostSpawnTimer = 0;
        const dashDir = direction || this.facing;
        this.velocity.x = dashDir * this.dashSpeed;

        window.soundEngine.playDash();
        this.vfx.spawnGhostTrail(this.root, this.accentColor);
        this.vfx.spawnGroundDust(this.position, 5);
        return true;
    }

    triggerJump() {
        if (!this.isGrounded || this.animState === 'HURT' || this.animState === 'KNOCKDOWN' ||
            this.animState === 'GETUP' || this.animState === 'THROWN' || this.animState === 'KO') {
            return false;
        }
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.queuedAttack = null;
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.animState = 'JUMP';
        this.animTime = 0;
        window.soundEngine.playJump();
        this.vfx.spawnGroundDust(this.position, 5);
        return true;
    }

    // 2-Level Damage & Guard Evaluation (Stand Guard = HIGH, Duck Guard = LOW, Throw = Unblockable)
    takeDamage(amount, knockbackX = 0, knockbackY = 0, isHeavy = false, attacker = null, hitLevel = 'HIGH') {
        if (this.isInvulnerable || this.animState === 'KO' || this.animState === 'KNOCKDOWN' ||
            this.animState === 'GETUP' || this.animState === 'THROWN') {
            return false;
        }

        let finalDamage = amount;
        let blocked = false;
        let guardBroken = false;
        this.queuedAttack = null;

        if (attacker) {
            const dirToAttacker = attacker.position.x > this.position.x ? 1 : -1;
            this.setFacing(dirToAttacker);
        }

        // KAMEN RIDER AGITO GUARD RULES:
        // 1. LOW Attack (Sleding / Down+O): Only blocked by DUCK GUARD (CROUCH_BLOCK)! Breaks Stand Guard!
        if (hitLevel === 'LOW') {
            if (this.isCrouchBlocking || this.animState === 'CROUCH_BLOCK') {
                blocked = true;
                finalDamage = Math.max(1, Math.round(amount * 0.15));
                knockbackX *= 0.2;
                knockbackY = 0;
                window.soundEngine.playBlock();
                this.vfx.spawnHitSparks(this.getLeftFootWorldPos(), 0x00f0ff, 8, 0.7);
                this.vfx.spawnDamageNumber(this.getChestWorldPos(), `DUCK GUARD -${finalDamage}`, 'blocked');
                this.vfx.triggerShake(0.1);
            } else {
                blocked = false;
                if (this.isBlocking) guardBroken = true;
            }
        }
        // 2. HIGH Attack (Normal Combo / Dash Attack / Jump / Neutral+O): Only blocked by STAND GUARD (BLOCK)!
        else if (hitLevel === 'HIGH') {
            if (this.isBlocking && !this.isCrouching) {
                blocked = true;
                finalDamage = Math.max(1, Math.round(amount * 0.15));
                knockbackX *= 0.2;
                knockbackY = 0;
                window.soundEngine.playBlock();
                this.vfx.spawnHitSparks(this.getChestWorldPos(), 0x00f0ff, 8, 0.7);
                this.vfx.spawnDamageNumber(this.getChestWorldPos(), `STAND GUARD -${finalDamage}`, 'blocked');
                this.vfx.triggerShake(0.1);
            } else {
                blocked = false;
                if (this.isCrouchBlocking) guardBroken = true;
            }
        }

        if (!blocked) {
            if (isHeavy || guardBroken) {
                window.soundEngine.playKickHit();
                this.vfx.triggerShake(0.42);
            } else {
                window.soundEngine.playPunchHit(false);
                this.vfx.triggerShake(0.18);
            }

            const hitPos = (hitLevel === 'LOW') ? this.getLeftFootWorldPos() : this.getChestWorldPos();
            this.vfx.spawnHitSparks(hitPos, 0xffea00, (isHeavy || guardBroken) ? 20 : 12, (isHeavy || guardBroken) ? 1.35 : 1.0);
            this.vfx.spawnShockwave(hitPos, (isHeavy || guardBroken) ? 0xffea00 : 0xffffff, (isHeavy || guardBroken) ? 2.3 : 1.3);

            const label = guardBroken
                ? (hitLevel === 'LOW' ? `LOW HIT! -${finalDamage}` : `HIGH HIT! -${finalDamage}`)
                : `-${finalDamage}`;
            this.vfx.spawnDamageNumber(hitPos, label, (isHeavy || guardBroken) ? 'crit' : 'normal');
        }

        this.health = Math.max(0, this.health - finalDamage);
        this.energy = Math.min(this.maxEnergy, this.energy + 10);

        this.velocity.x = knockbackX;
        if (knockbackY > 0) {
            this.velocity.y = knockbackY;
            this.isGrounded = false;
        }

        if (this.health <= 0) {
            this.triggerKO();
            return true;
        }

        if (!blocked) {
            this.attackType = null;
            this.isBlocking = false;
            this.isCrouchBlocking = false;
            if (isHeavy && (Math.abs(knockbackX) >= 8 || knockbackY >= 4.0)) {
                this.animState = 'KNOCKDOWN';
                this.animTime = 0;
            } else {
                this.animState = 'HURT';
                this.animTime = 0;
            }
        }

        return true;
    }

    triggerKO() {
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.attackType = null;
        this.queuedAttack = null;
        this.animState = 'KO';
        this.animTime = 0;
        this.velocity.y = 5.5;
        this.velocity.x = -this.facing * 7.5;
        this.isGrounded = false;
        window.soundEngine.playKOBlow();
        this.vfx.triggerShake(0.65);
    }

    reset(xPos, facing, keepHealth = false) {
        if (!keepHealth) {
            this.health = this.maxHealth;
            this.prevHealth = this.maxHealth;
        }
        this.energy = 60;
        this.position.set(xPos, 0, 0);
        this.root.position.copy(this.position);
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isBlocking = false;
        this.isCrouching = false;
        this.isCrouchBlocking = false;
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.dashAttackWindow = 0;
        this.attackType = null;
        this.queuedAttack = null;
        this.throwVictim = null;
        this.throwAttacker = null;
        this.comboStep = 0;
        this.animState = 'IDLE';
        this.animTime = 0;
        this.setFacing(facing);
        this.resetBonesToNeutral();
    }

    resetBonesToNeutral() {
        this.root.rotation.set(0, this.facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0);

        this.hips.position.set(0, 0.90, 0);
        this.hips.rotation.set(0, 0, 0);
        this.spine.rotation.set(0, 0, 0);
        this.chest.rotation.set(0, 0, 0);
        this.neck.rotation.set(0, 0, 0);

        this.leftArm.shoulder.rotation.set(0, 0, 0);
        this.leftArm.elbow.rotation.set(0, 0, 0);
        this.rightArm.shoulder.rotation.set(0, 0, 0);
        this.rightArm.elbow.rotation.set(0, 0, 0);

        this.leftLeg.hipJoint.rotation.set(0, 0, 0);
        this.leftLeg.knee.rotation.set(0, 0, 0);
        this.rightLeg.hipJoint.rotation.set(0, 0, 0);
        this.rightLeg.knee.rotation.set(0, 0, 0);
    }

    applyBlendedPose(poseA, poseB, t) {
        const lerp = THREE.MathUtils.lerp;
        const lerpArr = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

        this.hips.position.y = lerp(poseA.hipsY, poseB.hipsY, t);
        this.hips.rotation.set(...lerpArr(poseA.hips, poseB.hips, t));
        this.spine.rotation.set(...lerpArr(poseA.spine, poseB.spine, t));
        this.neck.rotation.set(...lerpArr(poseA.neck, poseB.neck, t));

        this.leftArm.shoulder.rotation.set(...lerpArr(poseA.lShoulder, poseB.lShoulder, t));
        this.leftArm.elbow.rotation.set(lerp(poseA.lElbow, poseB.lElbow, t), 0, 0);

        this.rightArm.shoulder.rotation.set(...lerpArr(poseA.rShoulder, poseB.rShoulder, t));
        this.rightArm.elbow.rotation.set(lerp(poseA.rElbow, poseB.rElbow, t), 0, 0);

        this.leftLeg.hipJoint.rotation.set(...lerpArr(poseA.lHip, poseB.lHip, t));
        this.leftLeg.knee.rotation.set(lerp(poseA.lKnee, poseB.lKnee, t), 0, 0);

        this.rightLeg.hipJoint.rotation.set(...lerpArr(poseA.rHip, poseB.rHip, t));
        this.rightLeg.knee.rotation.set(lerp(poseA.rKnee, poseB.rKnee, t), 0, 0);
    }

    applyThreePhaseStrike(p, chamberPose, strikePose) {
        if (p < 0.20) {
            const f = p / 0.20;
            const ease = f * f;
            this.applyBlendedPose(this.GUARD_POSE, chamberPose, ease);
        } else if (p < 0.40) {
            const f = (p - 0.20) / 0.20;
            const snap = 1 - Math.pow(1 - f, 4);
            this.applyBlendedPose(chamberPose, strikePose, snap);
        } else if (p < 0.62) {
            this.applyBlendedPose(strikePose, strikePose, 1.0);
        } else {
            const f = (p - 0.62) / 0.38;
            const ease = f * (2 - f);
            this.applyBlendedPose(strikePose, this.GUARD_POSE, ease);
        }
    }

    update(delta, arenaBounds = 15.5) {
        this.animTime += delta;

        if (this.prevHealth > this.health) {
            this.prevHealth = Math.max(this.health, this.prevHealth - 32 * delta);
        }

        if (this.energy < this.maxEnergy && this.animState !== 'KO') {
            this.energy = Math.min(this.maxEnergy, this.energy + 5.5 * delta);
        }

        if (this.dashCooldown > 0) this.dashCooldown -= delta;
        if (this.dashAttackWindow > 0) this.dashAttackWindow -= delta;

        if (this.comboResetTimer > 0) {
            this.comboResetTimer -= delta;
            if (this.comboResetTimer <= 0) {
                this.comboStep = 0;
            }
        }
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= delta;
            this.isInvulnerable = this.invulnerableTimer > 0;
        } else {
            this.isInvulnerable = false;
        }

        if (this.animState === 'DASH') {
            this.dashTimer -= delta;
            this.ghostSpawnTimer += delta;
            if (this.ghostSpawnTimer >= 0.055) {
                this.ghostSpawnTimer = 0;
                this.vfx.spawnGhostTrail(this.root, this.accentColor);
            }
            if (this.dashTimer <= 0) {
                this.animState = this.isGrounded ? 'IDLE' : 'JUMP';
                this.velocity.x *= 0.25;
            }
        }

        if (this.animState !== 'THROWN') {
            if (!this.isGrounded) {
                this.velocity.y += this.gravity * delta;
            }

            this.position.x += this.velocity.x * delta;
            this.position.y += this.velocity.y * delta;

            if (this.position.y <= 0) {
                const wasAirborne = !this.isGrounded && this.velocity.y < -4.0;
                this.position.y = 0;
                this.velocity.y = 0;
                this.isGrounded = true;

                if (wasAirborne) {
                    this.vfx.spawnGroundDust(this.position, 5);
                }

                if (this.animState === 'JUMP' || (this.animState === 'ATTACK' && (this.attackType === 'AIR_KICK' || this.attackType === 'SPECIAL_DIVE'))) {
                    if (this.attackType === 'SPECIAL_DIVE') {
                        this.vfx.spawnShockwave(this.position, 0xffea00, 2.2);
                        this.vfx.triggerShake(0.25);
                    }
                    this.animState = 'IDLE';
                    this.attackType = null;
                }
            }

            if (this.position.x > arenaBounds) {
                this.position.x = arenaBounds;
                this.velocity.x = 0;
            } else if (this.position.x < -arenaBounds) {
                this.position.x = -arenaBounds;
                this.velocity.x = 0;
            }

            if (this.animState !== 'DASH') {
                const isSliding = (this.animState === 'ATTACK' && (this.attackType === 'SLIDE_KICK' || this.attackType === 'DASH_STRIKE'));
                if (this.isGrounded) {
                    this.velocity.x *= Math.pow(isSliding ? 0.04 : 0.0005, delta);
                    if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
                } else {
                    this.velocity.x *= Math.pow(0.35, delta);
                }
            }
        }

        this.root.position.copy(this.position);

        this.updateHeadband(delta);
        this.resetBonesToNeutral();
        this.updateAnimations(delta);
    }

    updateHeadband(delta) {
        const speedFactor = Math.min(1.5, Math.abs(this.velocity.x) * 0.08);
        const wave = Math.sin(this.animTime * 11) * (0.2 + speedFactor * 0.25);

        this.headbandTails.forEach((segments, tIndex) => {
            const offset = tIndex * 0.6;
            segments.forEach((seg, sIndex) => {
                const lag = (sIndex + 1) * 0.35;
                seg.rotation.x = 0.35 + speedFactor * 0.5 + Math.sin(this.animTime * 10 - lag + offset) * 0.18;
                seg.rotation.y = Math.cos(this.animTime * 7 - lag + offset) * 0.15;
                seg.rotation.z = wave * 0.22;
            });
        });
    }

    updateAnimations(delta) {
        const t = this.animTime;

        switch (this.animState) {
            case 'IDLE': {
                const bounce = Math.sin(t * 7.5) * 0.032;
                this.applyBlendedPose(this.GUARD_POSE, this.GUARD_POSE, 1.0);
                this.hips.position.y += bounce;
                this.leftArm.shoulder.rotation.x += bounce * 0.7;
                this.rightArm.shoulder.rotation.x -= bounce * 0.7;
                this.leftLeg.knee.rotation.x += bounce * 1.4;
                this.rightLeg.knee.rotation.x += bounce * 1.4;
                break;
            }

            case 'CROUCH': {
                this.applyBlendedPose(this.CROUCH_POSE, this.CROUCH_POSE, 1.0);
                const breathe = Math.sin(t * 6.5) * 0.015;
                this.hips.position.y += breathe;
                break;
            }

            case 'CROUCH_BLOCK': {
                this.applyBlendedPose(this.CROUCH_BLOCK_POSE, this.CROUCH_BLOCK_POSE, 1.0);
                const breathe = Math.sin(t * 6.5) * 0.015;
                this.hips.position.y += breathe;
                break;
            }

            case 'RUN': {
                const isMovingForward = (this.moveDir * this.facing) >= 0;
                const dirSign = isMovingForward ? 1 : -1;
                const runCycle = t * 15 * dirSign;
                const swing = Math.sin(runCycle) * 0.72;

                this.hips.position.y = 0.87 + Math.abs(Math.cos(runCycle)) * 0.07;
                this.spine.rotation.x = isMovingForward ? 0.26 : -0.10;
                this.spine.rotation.y = -swing * 0.28;
                this.neck.rotation.x = isMovingForward ? -0.15 : 0.05;

                this.leftLeg.hipJoint.rotation.set(-swing, 0, 0.05);
                this.leftLeg.knee.rotation.set(swing > 0 ? 0.25 + swing * 0.9 : 0.35, 0, 0);

                this.rightLeg.hipJoint.rotation.set(swing, 0, -0.05);
                this.rightLeg.knee.rotation.set(-swing > 0 ? 0.25 - swing * 0.9 : 0.35, 0, 0);

                this.leftArm.shoulder.rotation.set(swing * 0.7 - 0.55, 0.15, 0.2);
                this.leftArm.elbow.rotation.set(-1.55, 0, 0);

                this.rightArm.shoulder.rotation.set(-swing * 0.7 - 0.55, -0.15, -0.2);
                this.rightArm.elbow.rotation.set(-1.55, 0, 0);

                if (Math.random() < 0.15) {
                    this.vfx.spawnGroundDust(this.position, 1);
                }
                break;
            }

            case 'DASH': {
                this.hips.position.y = 0.76;
                this.spine.rotation.x = 0.55;
                this.neck.rotation.x = -0.35;

                this.leftArm.shoulder.rotation.set(1.15, 0, 0.25);
                this.leftArm.elbow.rotation.set(-0.25, 0, 0);
                this.rightArm.shoulder.rotation.set(1.15, 0, -0.25);
                this.rightArm.elbow.rotation.set(-0.25, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.85, 0, 0);
                this.leftLeg.knee.rotation.set(1.15, 0, 0);
                this.rightLeg.hipJoint.rotation.set(0.65, 0, 0);
                this.rightLeg.knee.rotation.set(0.45, 0, 0);
                break;
            }

            case 'JUMP': {
                this.hips.position.y = 0.94;
                this.spine.rotation.x = 0.15;

                this.leftLeg.hipJoint.rotation.set(-0.85, 0, 0.08);
                this.leftLeg.knee.rotation.set(1.35, 0, 0);
                this.rightLeg.hipJoint.rotation.set(-0.45, 0, -0.08);
                this.rightLeg.knee.rotation.set(0.95, 0, 0);

                this.leftArm.shoulder.rotation.set(-0.85, 0.2, 0.35);
                this.leftArm.elbow.rotation.set(-1.45, 0, 0);
                this.rightArm.shoulder.rotation.set(-0.65, -0.2, -0.35);
                this.rightArm.elbow.rotation.set(-1.55, 0, 0);
                break;
            }

            case 'BLOCK': {
                this.hips.position.y = 0.84;
                this.spine.rotation.x = -0.08;

                this.leftArm.shoulder.rotation.set(-1.15, -0.45, 0.2);
                this.leftArm.elbow.rotation.set(-1.65, 0, 0);
                this.rightArm.shoulder.rotation.set(-1.15, 0.45, -0.2);
                this.rightArm.elbow.rotation.set(-1.65, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.45, 0.1, 0.1);
                this.leftLeg.knee.rotation.set(0.75, 0, 0);
                this.rightLeg.hipJoint.rotation.set(0.25, -0.1, -0.1);
                this.rightLeg.knee.rotation.set(0.55, 0, 0);
                break;
            }

            case 'ATTACK': {
                this.updateAttackAnimation(delta);
                break;
            }

            case 'THROWN': {
                const thrownPose = {
                    hipsY: 0.85,
                    hips: [-0.35, 0, 0],
                    spine: [-0.45, 0, 0],
                    neck: [0.35, 0, 0],
                    lShoulder: [0.65, 0.3, 0.4],
                    lElbow: -0.6,
                    rShoulder: [0.65, -0.3, -0.4],
                    rElbow: -0.6,
                    lHip: [-0.4, 0, 0.2],
                    lKnee: 0.6,
                    rHip: [-0.2, 0, -0.2],
                    rKnee: 0.4
                };
                this.applyBlendedPose(thrownPose, thrownPose, 1.0);
                break;
            }

            case 'HURT': {
                const p = Math.min(1.0, this.animTime / 0.24);
                const recoil = Math.sin(p * Math.PI);

                this.hips.position.y = 0.88 - recoil * 0.06;
                this.spine.rotation.x = -recoil * 0.48;
                this.neck.rotation.x = -recoil * 0.55;

                this.leftArm.shoulder.rotation.set(-0.4 + recoil * 0.5, 0, 0.5);
                this.leftArm.elbow.rotation.set(-1.1, 0, 0);
                this.rightArm.shoulder.rotation.set(-0.4 + recoil * 0.5, 0, -0.5);
                this.rightArm.elbow.rotation.set(-1.1, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.2, 0, 0);
                this.leftLeg.knee.rotation.set(0.4, 0, 0);
                this.rightLeg.hipJoint.rotation.set(0.2, 0, 0);
                this.rightLeg.knee.rotation.set(0.4, 0, 0);

                if (p >= 1.0) {
                    this.animState = 'IDLE';
                }
                break;
            }

            case 'KNOCKDOWN': {
                const fallProgress = Math.min(1.0, this.animTime / 0.28);
                this.hips.position.y = THREE.MathUtils.lerp(0.85, 0.18, fallProgress);
                this.hips.rotation.x = THREE.MathUtils.lerp(0, -Math.PI / 2, fallProgress);

                this.leftArm.shoulder.rotation.set(-0.3, 0, 0.6);
                this.leftArm.elbow.rotation.set(-0.4, 0, 0);
                this.rightArm.shoulder.rotation.set(-0.3, 0, -0.6);
                this.rightArm.elbow.rotation.set(-0.4, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.25, 0, 0.15);
                this.leftLeg.knee.rotation.set(0.45, 0, 0);
                this.rightLeg.hipJoint.rotation.set(-0.1, 0, -0.15);
                this.rightLeg.knee.rotation.set(0.25, 0, 0);

                if (this.isGrounded && this.animTime >= 0.75) {
                    this.animState = 'GETUP';
                    this.animTime = 0;
                }
                break;
            }

            case 'GETUP': {
                const p = Math.min(1.0, this.animTime / 0.35);
                const ease = 1 - Math.pow(1 - p, 2);

                this.hips.position.y = THREE.MathUtils.lerp(0.18, 0.89, ease);
                this.hips.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, ease);
                this.spine.rotation.x = Math.sin(p * Math.PI) * 0.4;

                this.leftLeg.hipJoint.rotation.set(-0.5 * (1 - p), 0, 0);
                this.leftLeg.knee.rotation.set(0.9 * (1 - p), 0, 0);
                this.rightLeg.hipJoint.rotation.set(-0.5 * (1 - p), 0, 0);
                this.rightLeg.knee.rotation.set(0.9 * (1 - p), 0, 0);

                if (p >= 1.0) {
                    this.animState = 'IDLE';
                    this.invulnerableTimer = 0.35;
                }
                break;
            }

            case 'KO': {
                const p = Math.min(1.0, this.animTime / 0.40);
                this.hips.position.y = THREE.MathUtils.lerp(0.85, 0.16, p);
                this.hips.rotation.x = THREE.MathUtils.lerp(0, -Math.PI / 2, p);

                this.spine.rotation.x = -0.1;
                this.neck.rotation.x = -0.2;

                this.leftArm.shoulder.rotation.set(0.1, 0, 0.85);
                this.leftArm.elbow.rotation.set(-0.2, 0, 0);
                this.rightArm.shoulder.rotation.set(0.1, 0, -0.85);
                this.rightArm.elbow.rotation.set(-0.2, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.1, 0, 0.25);
                this.leftLeg.knee.rotation.set(0.2, 0, 0);
                this.rightLeg.hipJoint.rotation.set(0.05, 0, -0.25);
                this.rightLeg.knee.rotation.set(0.15, 0, 0);
                break;
            }

            case 'VICTORY': {
                const pump = Math.sin(t * 7) * 0.15;
                this.hips.position.y = 0.92;
                this.spine.rotation.x = -0.08;
                this.spine.rotation.y = -0.25;

                this.rightArm.shoulder.rotation.set(-2.75 + pump, 0, -0.2);
                this.rightArm.elbow.rotation.set(-0.25, 0, 0);

                this.leftArm.shoulder.rotation.set(-0.4, 0.2, 0.45);
                this.leftArm.elbow.rotation.set(-1.5, 0, 0);

                this.leftLeg.hipJoint.rotation.set(-0.15, 0, 0.1);
                this.leftLeg.knee.rotation.set(0.25, 0, 0);
                this.rightLeg.hipJoint.rotation.set(0.15, 0, -0.1);
                this.rightLeg.knee.rotation.set(0.25, 0, 0);
                break;
            }
        }
    }

    updateAttackAnimation(delta) {
        this.attackTimer += delta;
        this.trailTimer += delta;
        const p = Math.min(1.0, this.attackTimer / this.attackDuration);

        if (p < 0.20) {
            this.attackPhase = 0;
        } else if (p < 0.65) {
            this.attackPhase = 1;
        } else {
            this.attackPhase = 2;
        }

        // Check Buffered Combo Chain right after strike hold
        if (p >= 0.56 && this.queuedAttack) {
            const nextMove = this.queuedAttack;
            this.queuedAttack = null;
            this.triggerAttack(nextMove, true);
            return;
        }

        switch (this.attackType) {
            // -----------------------------------------------------------------
            // HIT 1: Left Snapping Jab (□ 1st Hit)
            // -----------------------------------------------------------------
            case 'LP':
            case 'LP_2':
            case 'PUNCH_1': {
                const chamber = {
                    hipsY: 0.88,
                    hips: [0, -0.35, 0],
                    spine: [0.06, -0.18, 0],
                    neck: [-0.04, 0.18, 0],
                    lShoulder: [-0.50, 0.25, 0.25],
                    lElbow: -2.05,
                    rShoulder: [-0.65, -0.25, -0.20],
                    rElbow: -1.85,
                    lHip: [-0.42, 0.1, 0.08],
                    lKnee: 0.62,
                    rHip: [0.28, -0.1, -0.08],
                    rKnee: 0.35
                };
                const strike = {
                    hipsY: 0.85,
                    hips: [0, 0.28, 0],
                    spine: [0.22, 0.70, 0],
                    neck: [-0.15, -0.58, 0],
                    lShoulder: [-1.62, -0.20, 0.0],
                    lElbow: -0.04,
                    rShoulder: [-0.55, -0.30, -0.25],
                    rElbow: -1.95,
                    lHip: [-0.65, 0.1, 0.08],
                    lKnee: 0.82,
                    rHip: [0.45, -0.1, -0.08],
                    rKnee: 0.22
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.024) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getLeftHandWorldPos(), this.accentColor, 1.4);
                }
                break;
            }

            // -----------------------------------------------------------------
            // HIT 2: Right Power Straight Cross (□ 2nd Hit)
            // -----------------------------------------------------------------
            case 'RP':
            case 'PUNCH_2': {
                const chamber = {
                    hipsY: 0.86,
                    hips: [0, 0.38, 0],
                    spine: [0.10, 0.52, 0],
                    neck: [-0.06, -0.45, 0],
                    lShoulder: [-1.15, 0, 0.15],
                    lElbow: -0.75,
                    rShoulder: [0.22, -0.30, -0.35],
                    rElbow: -2.05,
                    lHip: [-0.55, 0.1, 0.08],
                    lKnee: 0.72,
                    rHip: [0.35, -0.1, -0.08],
                    rKnee: 0.45
                };
                const strike = {
                    hipsY: 0.82,
                    hips: [0, -0.48, 0],
                    spine: [0.28, -0.80, 0],
                    neck: [-0.18, 0.70, 0],
                    lShoulder: [-0.55, 0.28, 0.28],
                    lElbow: -1.95,
                    rShoulder: [-1.65, 0.22, 0.0],
                    rElbow: -0.04,
                    lHip: [-0.75, 0, 0.08],
                    lKnee: 0.95,
                    rHip: [0.58, 0, -0.08],
                    rKnee: 0.18
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.022) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getRightHandWorldPos(), this.accentColor, 1.7);
                }
                break;
            }

            // -----------------------------------------------------------------
            // HIT 3: Roundhouse Kick (□ 3rd Hit)
            // -----------------------------------------------------------------
            case 'LK':
            case 'RK':
            case 'KICK_1':
            case 'KICK_2': {
                const chamber = {
                    hipsY: 0.90,
                    hips: [-0.10, -0.25, 0],
                    spine: [-0.15, -0.20, 0],
                    neck: [0.10, 0.20, 0],
                    lShoulder: [-0.70, 0.2, 0.3],
                    lElbow: -1.65,
                    rShoulder: [-0.70, -0.2, -0.3],
                    rElbow: -1.75,
                    lHip: [-1.45, 0.25, 0.35],
                    lKnee: 1.68,
                    rHip: [0.05, 0, 0],
                    rKnee: 0.25
                };
                const strike = {
                    hipsY: 0.91,
                    hips: [-0.24, 0.48, -0.15],
                    spine: [-0.30, 0.30, 0.10],
                    neck: [0.20, -0.40, 0],
                    lShoulder: [0.45, 0, 0.50],
                    lElbow: -0.85,
                    rShoulder: [-0.95, 0.25, -0.20],
                    rElbow: -1.65,
                    lHip: [-1.55, -0.12, 0.20],
                    lKnee: 0.04,
                    rHip: [0.24, 0, -0.08],
                    rKnee: 0.18
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.022) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getLeftFootWorldPos(), this.accentColor, 1.8);
                }
                break;
            }

            // -----------------------------------------------------------------
            // HIT 4: 360 Tornado Jump Kick Finisher (□ 4th Hit)
            // -----------------------------------------------------------------
            case '3_3_4_FINISHER':
            case '1_1_2_FINISHER':
            case 'KICK_3': {
                const chamber = {
                    hipsY: 1.05,
                    hips: [-0.15, Math.PI * 0.85, 0],
                    spine: [-0.15, 0.25, 0],
                    neck: [0.10, 0, 0],
                    lShoulder: [-0.85, 0.3, 0.3],
                    lElbow: -1.65,
                    rShoulder: [-0.85, -0.3, -0.3],
                    rElbow: -1.65,
                    lHip: [-1.15, 0, 0.18],
                    lKnee: 1.55,
                    rHip: [-1.35, 0, -0.28],
                    rKnee: 1.60
                };
                const strike = {
                    hipsY: 1.12,
                    hips: [-0.36, Math.PI * 2.0 - 0.55, 0.22],
                    spine: [-0.36, -0.45, -0.15],
                    neck: [0.22, 0.45, 0],
                    lShoulder: [-0.95, -0.2, 0.45],
                    lElbow: -1.35,
                    rShoulder: [0.65, 0, -0.58],
                    rElbow: -0.55,
                    lHip: [-0.80, 0, 0.20],
                    lKnee: 1.48,
                    rHip: [-1.76, 0.18, -0.30],
                    rKnee: 0.02
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.016) {
                    this.trailTimer = 0;
                    const rFoot = this.getRightFootWorldPos();
                    this.vfx.spawnStrikeTrail(rFoot, 0xffea00, 2.2);
                    this.vfx.spawnHitSparks(rFoot, this.accentColor, 1, 0.65);
                }
                break;
            }

            // -----------------------------------------------------------------
            // DASH_STRIKE: Dash + □ (Tonjok/Tendang Melesat Sambil Ngedash!)
            // -----------------------------------------------------------------
            case 'DASH_STRIKE': {
                const chamber = {
                    hipsY: 0.75,
                    hips: [0, 0.45, 0],
                    spine: [0.40, 0.55, 0],
                    neck: [-0.25, -0.45, 0],
                    lShoulder: [0.65, 0, 0.3],
                    lElbow: -1.45,
                    rShoulder: [0.55, -0.3, -0.35],
                    rElbow: -2.05,
                    lHip: [-0.95, 0, 0.08],
                    lKnee: 1.25,
                    rHip: [0.55, 0, -0.08],
                    rKnee: 0.45
                };
                const strike = {
                    hipsY: 0.78,
                    hips: [0, -0.65, 0],
                    spine: [0.45, -0.90, 0],
                    neck: [-0.30, 0.75, 0],
                    lShoulder: [0.55, 0.25, 0.35],
                    lElbow: -1.55,
                    rShoulder: [-1.75, 0.22, 0.0], // Full lunging dash punch!
                    rElbow: -0.02,
                    lHip: [-1.25, 0, 0.08], // Flying knee drive!
                    lKnee: 1.45,
                    rHip: [0.75, 0, -0.08],
                    rKnee: 0.15
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.018) {
                    this.trailTimer = 0;
                    const rHand = this.getRightHandWorldPos();
                    this.vfx.spawnStrikeTrail(rHand, 0xffea00, 2.1);
                    this.vfx.spawnGhostTrail(this.root, this.accentColor);
                }
                break;
            }

            // -----------------------------------------------------------------
            // SLIDE_KICK: Down + □ (Sleding Rendah di Lantai - LOW Attack!)
            // -----------------------------------------------------------------
            case 'SLIDE_KICK':
            case 'DOWN_LK': {
                const chamber = {
                    hipsY: 0.48,
                    hips: [-0.25, -0.25, 0],
                    spine: [-0.20, 0.20, 0],
                    neck: [0.25, 0, 0],
                    lShoulder: [-0.5, 0.2, 0.3],
                    lElbow: -1.5,
                    rShoulder: [0.4, -0.2, -0.3],
                    rElbow: -1.2,
                    lHip: [-1.15, 0, 0.1],
                    lKnee: 1.25,
                    rHip: [0.2, 0, -0.1],
                    rKnee: 1.45
                };
                const strike = {
                    hipsY: 0.28, // Drops right onto the floor for a true Agito slide!
                    hips: [-0.55, 0.35, 0],
                    spine: [-0.35, -0.30, 0],
                    neck: [0.45, 0.25, 0],
                    lShoulder: [0.55, 0, 0.45],
                    lElbow: -0.65,
                    rShoulder: [-0.75, 0.2, -0.25],
                    rElbow: -1.45,
                    lHip: [-1.52, -0.10, 0.15], // Lead leg extended flat along the floor!
                    lKnee: 0.03,
                    rHip: [0.35, 0, -0.20], // Trailing leg folded underneath
                    rKnee: 1.65
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.020) {
                    this.trailTimer = 0;
                    const lFoot = this.getLeftFootWorldPos();
                    this.vfx.spawnStrikeTrail(lFoot, 0x00f0ff, 2.0);
                    this.vfx.spawnGroundDust(this.position, 2);
                }
                break;
            }

            // -----------------------------------------------------------------
            // SPECIAL_UPPER: Up + ○ (Rising Dragon Uppercut Launcher!)
            // -----------------------------------------------------------------
            case 'SPECIAL_UPPER':
            case 'UPPERCUT':
            case 'PUNCH_3': {
                const chamber = {
                    hipsY: 0.65,
                    hips: [0.18, 0.48, 0],
                    spine: [0.48, 0.68, 0],
                    neck: [-0.38, -0.58, 0],
                    lShoulder: [-0.35, 0.35, 0.40],
                    lElbow: -1.45,
                    rShoulder: [0.42, -0.25, -0.35],
                    rElbow: -1.85,
                    lHip: [-0.95, 0, 0.1],
                    lKnee: 1.45,
                    rHip: [0.35, 0, -0.1],
                    rKnee: 1.15
                };
                const strike = {
                    hipsY: 1.08,
                    hips: [-0.15, -0.55, 0],
                    spine: [-0.30, -0.80, 0],
                    neck: [0.18, 0.65, 0],
                    lShoulder: [0.42, 0.2, 0.48],
                    lElbow: -1.55,
                    rShoulder: [-2.42, 0.18, -0.08],
                    rElbow: -0.45,
                    lHip: [-0.22, 0, 0.08],
                    lKnee: 0.30,
                    rHip: [-1.05, 0, -0.08],
                    rKnee: 1.40
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.016) {
                    this.trailTimer = 0;
                    const rHand = this.getRightHandWorldPos();
                    this.vfx.spawnStrikeTrail(rHand, 0xffea00, 2.4);
                    this.vfx.spawnHitSparks(rHand, this.accentColor, 2, 0.8);
                }
                break;
            }

            // -----------------------------------------------------------------
            // SPECIAL_LOW: Down + ○ (Earthquake Ground Quake Smash - LOW!)
            // -----------------------------------------------------------------
            case 'SPECIAL_LOW': {
                const chamber = {
                    hipsY: 0.96,
                    hips: [-0.15, 0, 0],
                    spine: [-0.25, 0, 0],
                    neck: [0.15, 0, 0],
                    lShoulder: [-2.2, 0.2, 0.2],
                    lElbow: -0.5,
                    rShoulder: [-2.2, -0.2, -0.2],
                    rElbow: -0.5,
                    lHip: [-0.4, 0, 0.1],
                    lKnee: 0.6,
                    rHip: [0.2, 0, -0.1],
                    rKnee: 0.4
                };
                const strike = {
                    hipsY: 0.46,
                    hips: [0.35, 0, 0],
                    spine: [0.65, 0, 0],
                    neck: [-0.45, 0, 0],
                    lShoulder: [-1.35, -0.15, 0.1], // Both fists slamming the ground!
                    lElbow: -0.15,
                    rShoulder: [-1.35, 0.15, -0.1],
                    rElbow: -0.15,
                    lHip: [-1.10, 0, 0.15],
                    lKnee: 1.55,
                    rHip: [0.45, 0, -0.15],
                    rKnee: 1.35
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (p >= 0.36 && !this.hitRegistered) {
                    // Ground impact VFX
                    const impactPos = new THREE.Vector3(this.position.x + this.facing * 0.9, 0.05, 0);
                    this.vfx.spawnShockwave(impactPos, 0xffea00, 2.6);
                    this.vfx.spawnGroundDust(impactPos, 10);
                    this.vfx.triggerShake(0.35);
                }
                break;
            }

            // -----------------------------------------------------------------
            // SPECIAL_DIVE: Air + ○ (Flying Rider Kick Dive!)
            // -----------------------------------------------------------------
            case 'SPECIAL_DIVE': {
                const divePose = {
                    hipsY: 0.90,
                    hips: [-0.55, 0.35, 0],
                    spine: [-0.30, 0.25, 0],
                    neck: [0.30, -0.25, 0],
                    lShoulder: [0.5, 0, 0.5],
                    lElbow: -0.8,
                    rShoulder: [-1.1, 0, -0.3],
                    rElbow: -1.5,
                    lHip: [-1.55, 0, 0.1], // Blazing flying Rider Kick extension!
                    lKnee: 0.02,
                    rHip: [-0.45, 0, -0.1],
                    rKnee: 1.55
                };
                this.applyBlendedPose(this.GUARD_POSE, divePose, Math.min(1.0, p * 3.0));
                if (this.trailTimer >= 0.016) {
                    this.trailTimer = 0;
                    const lFoot = this.getLeftFootWorldPos();
                    this.vfx.spawnStrikeTrail(lFoot, 0xffea00, 2.4);
                    this.vfx.spawnHitSparks(lFoot, this.accentColor, 2, 0.7);
                }
                break;
            }

            // -----------------------------------------------------------------
            // AIR_KICK: Jump + □
            // -----------------------------------------------------------------
            case 'AIR_KICK': {
                const chamber = {
                    hipsY: 0.95,
                    hips: [-0.20, 0, 0],
                    spine: [-0.10, 0, 0],
                    neck: [0.10, 0, 0],
                    lShoulder: [-0.7, 0, 0.4],
                    lElbow: -1.4,
                    rShoulder: [-0.7, 0, -0.4],
                    rElbow: -1.4,
                    lHip: [-1.3, 0, 0],
                    lKnee: 1.5,
                    rHip: [-0.6, 0, 0],
                    rKnee: 1.3
                };
                const strike = {
                    hipsY: 0.92,
                    hips: [-0.48, 0.35, 0],
                    spine: [-0.25, 0.25, 0],
                    neck: [0.25, -0.25, 0],
                    lShoulder: [0.4, 0, 0.5],
                    lElbow: -0.8,
                    rShoulder: [-0.9, 0, -0.3],
                    rElbow: -1.5,
                    lHip: [-1.45, 0, 0.1],
                    lKnee: 0.04,
                    rHip: [-0.55, 0, -0.1],
                    rKnee: 1.45
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.022) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getLeftFootWorldPos(), this.accentColor, 1.8);
                }
                break;
            }

            // -----------------------------------------------------------------
            // THROW_ATTEMPT: △ Grapple Hug Reach
            // -----------------------------------------------------------------
            case 'THROW_ATTEMPT': {
                const reachPose = {
                    hipsY: 0.85,
                    hips: [0, 0.1, 0],
                    spine: [0.25, 0, 0],
                    neck: [-0.15, 0, 0],
                    lShoulder: [-1.45, 0.25, 0.15],
                    lElbow: -0.35,
                    rShoulder: [-1.45, -0.25, -0.15],
                    rElbow: -0.35,
                    lHip: [-0.55, 0, 0.08],
                    lKnee: 0.75,
                    rHip: [0.40, 0, -0.08],
                    rKnee: 0.35
                };
                this.applyBlendedPose(this.GUARD_POSE, reachPose, Math.sin(p * Math.PI));
                break;
            }

            // -----------------------------------------------------------------
            // THROW_SLAM: △ Peluk & Banting (Breaks Guard -> Hoist -> Slam!)
            // -----------------------------------------------------------------
            case 'THROW_SLAM': {
                const victim = this.throwVictim;

                if (p < 0.25) {
                    const grabPose = {
                        hipsY: 0.80,
                        hips: [0, 0.15, 0],
                        spine: [0.20, 0, 0],
                        neck: [-0.15, 0, 0],
                        lShoulder: [-1.35, 0.35, 0.15],
                        lElbow: -0.75,
                        rShoulder: [-1.35, -0.35, -0.15],
                        rElbow: -0.75,
                        lHip: [-0.55, 0, 0.08],
                        lKnee: 0.85,
                        rHip: [0.45, 0, -0.08],
                        rKnee: 0.40
                    };
                    this.applyBlendedPose(this.GUARD_POSE, grabPose, p / 0.25);

                    if (victim) {
                        victim.position.x = this.position.x + this.facing * 0.60;
                        victim.position.y = 0;
                        victim.setFacing(-this.facing);
                    }
                } else if (p < 0.52) {
                    const lift = (p - 0.25) / 0.27;
                    const hoistPose = {
                        hipsY: 0.95,
                        hips: [0, -0.45, 0],
                        spine: [-0.35, -0.30, 0],
                        neck: [0.25, 0.20, 0],
                        lShoulder: [-2.1, 0.35, 0.1],
                        lElbow: -0.85,
                        rShoulder: [-2.1, -0.35, -0.1],
                        rElbow: -0.85,
                        lHip: [-0.25, 0, 0.08],
                        lKnee: 0.35,
                        rHip: [0.15, 0, -0.08],
                        rKnee: 0.25
                    };
                    this.applyBlendedPose(this.GUARD_POSE, hoistPose, lift);

                    if (victim) {
                        victim.position.x = this.position.x + this.facing * (0.60 - lift * 1.6);
                        victim.position.y = Math.sin(lift * Math.PI) * 1.65;
                        victim.root.rotation.z = -this.facing * lift * Math.PI * 0.95;
                    }
                } else if (!this.hitRegistered) {
                    this.hitRegistered = true;
                    if (victim) {
                        victim.position.x = this.position.x - this.facing * 1.25;
                        victim.position.y = 0;
                        victim.root.rotation.z = 0;
                        window.soundEngine.playThrowSlam();
                        this.vfx.spawnShockwave(victim.position, 0x00f0ff, 3.2);
                        this.vfx.spawnGroundDust(victim.position, 14);
                        this.vfx.triggerShake(0.55);
                        victim.takeDamage(24, -this.facing * 2.5, 0, true, this, 'THROW');
                        victim.animState = 'KNOCKDOWN';
                        victim.animTime = 0;
                    }
                } else {
                    const f = (p - 0.52) / 0.48;
                    const recoveryPose = {
                        hipsY: 0.86,
                        hips: [0, -0.15, 0],
                        spine: [0.15, 0, 0],
                        neck: [-0.10, 0, 0],
                        lShoulder: [-0.85, 0.2, 0.2],
                        lElbow: -1.45,
                        rShoulder: [-0.85, -0.2, -0.2],
                        rElbow: -1.45,
                        lHip: [-0.4, 0, 0.08],
                        lKnee: 0.6,
                        rHip: [0.3, 0, -0.08],
                        rKnee: 0.4
                    };
                    this.applyBlendedPose(recoveryPose, this.GUARD_POSE, f);
                }
                break;
            }

            // -----------------------------------------------------------------
            // SPECIAL: Neutral/Forward + ○ (Rider Flame Ki Blast)
            // -----------------------------------------------------------------
            case 'SPECIAL': {
                if (p < 0.45) {
                    const chargePose = {
                        hipsY: 0.80,
                        hips: [0, 0.35, 0],
                        spine: [-0.12, 0.45, 0],
                        neck: [0.08, -0.40, 0],
                        lShoulder: [0.35, 0.3, 0.35],
                        lElbow: -1.85,
                        rShoulder: [0.35, -0.3, -0.35],
                        rElbow: -1.85,
                        lHip: [-0.55, 0, 0.1],
                        lKnee: 0.85,
                        rHip: [0.40, 0, -0.1],
                        rKnee: 0.55
                    };
                    this.applyBlendedPose(this.GUARD_POSE, chargePose, Math.min(1.0, p / 0.35));
                    if (Math.random() < 0.35) {
                        this.vfx.spawnHitSparks(this.getChestWorldPos(), this.accentColor, 1, 0.5);
                    }
                } else {
                    const releasePose = {
                        hipsY: 0.84,
                        hips: [0, 0, 0],
                        spine: [0.26, 0, 0],
                        neck: [-0.18, 0, 0],
                        lShoulder: [-1.55, -0.15, 0.05],
                        lElbow: -0.08,
                        rShoulder: [-1.55, 0.15, -0.05],
                        rElbow: -0.08,
                        lHip: [-0.65, 0, 0],
                        lKnee: 0.90,
                        rHip: [0.50, 0, 0],
                        rKnee: 0.25
                    };
                    this.applyBlendedPose(releasePose, releasePose, 1.0);

                    if (!this.hitRegistered) {
                        this.hitRegistered = true;
                        window.soundEngine.playSpecialBlast();
                        const blastPos = this.getChestWorldPos();
                        blastPos.x += this.facing * 0.75;
                        this.vfx.spawnKiBlast(blastPos, this.facing, this, this.accentColor);
                        this.vfx.spawnShockwave(blastPos, this.accentColor, 2.0);
                        this.vfx.triggerShake(0.28);
                    }
                }
                break;
            }
        }

        if (p >= 1.0) {
            this.animState = this.isGrounded ? 'IDLE' : 'JUMP';
            this.attackType = null;
            this.throwVictim = null;
        }
    }
}
