/**
 * Stickman Shadow Showdown 3D - Procedural Rig & Tekken-Style Animation System
 * Features 3-Phase Keyframe Pose Interpolation (Chamber -> Snap/Hold -> Guard Recovery),
 * Input Buffering for seamless 3-Hit Punch Combos (Left Jab -> Right Cross -> Electric Uppercut)
 * and 3-Hit Kick Combos (Left Roundhouse -> Right Heavy Kick -> 360 Tornado Spin Kick).
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
        this.energy = 50;
        this.isBlocking = false;
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;

        // Physics & Movement
        this.position = new THREE.Vector3(options.startX || 0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isGrounded = true;
        this.walkSpeed = 6.2;
        this.jumpForce = 12.2;
        this.gravity = -30.0;
        this.dashSpeed = 15.5;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.ghostSpawnTimer = 0;
        this.moveDir = 0; // -1, 0, 1

        // Animation & Combo State Machine
        // States: IDLE, RUN, JUMP, DASH, ATTACK, BLOCK, HURT, KNOCKDOWN, GETUP, KO, VICTORY
        this.animState = 'IDLE';
        this.animTime = 0;
        // Attack Types: PUNCH_1, PUNCH_2, PUNCH_3, KICK_1, KICK_2, KICK_3, AIR_KICK, SPECIAL
        this.attackType = null;
        this.attackPhase = 0; // 0 = chamber/windup, 1 = active strike & hold, 2 = recovery
        this.attackTimer = 0;
        this.attackDuration = 0;
        this.hitRegistered = false;

        // Separate 3-Hit Combo Counters & Input Buffer
        this.punchComboStep = 0; // 1: Left Jab, 2: Right Cross, 3: Uppercut
        this.kickComboStep = 0;  // 1: Left Kick, 2: Right Kick, 3: 360 Tornado Kick
        this.comboResetTimer = 0;
        this.queuedAttack = null; // Buffered next attack input for smooth Tekken combos
        this.trailTimer = 0;

        // Headband Cloth Segments
        this.headbandTails = [];

        // Define Base Guard Pose (Tekken Fighting Stance)
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

        // Build the 3D Procedural Mesh & Skeleton
        this.buildMesh();
        this.setFacing(this.facing);
    }

    buildMesh() {
        this.root = new THREE.Group();
        this.root.position.copy(this.position);

        // Materials
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

        // 1. Hips (Main Pelvis Pivot)
        this.hips = new THREE.Group();
        this.hips.position.set(0, 0.90, 0);
        this.root.add(this.hips);

        this.hipMesh = createJoint(0.125, this.bodyMaterial);
        this.hips.add(this.hipMesh);

        const beltGeo = new THREE.CylinderGeometry(0.128, 0.128, 0.045, 16);
        const beltMesh = new THREE.Mesh(beltGeo, this.glowMaterial);
        this.hips.add(beltMesh);

        // 2. Spine & Chest (Extends upward +Y from Hips)
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

    // World position helpers for accurate 3D hitboxes & swing trails
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

    // Request next combo punch (J): Left Jab -> Right Cross -> Electric Uppercut
    requestPunchCombo() {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            return false;
        }

        // If already in an attack, buffer the next punch step if after early windup!
        if (this.animState === 'ATTACK') {
            if (this.attackTimer > 0.06 && !this.queuedAttack) {
                const nextStep = (this.punchComboStep % 3) + 1;
                this.punchComboStep = nextStep;
                this.queuedAttack = `PUNCH_${nextStep}`;
                return true;
            }
            return false;
        }

        this.punchComboStep = (this.punchComboStep % 3) + 1;
        this.kickComboStep = 0;
        return this.triggerAttack(`PUNCH_${this.punchComboStep}`);
    }

    // Request next combo kick (K): Left Roundhouse -> Right Heavy Kick -> 360 Tornado Kick
    requestKickCombo() {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            return false;
        }

        if (!this.isGrounded) {
            return this.triggerAttack('AIR_KICK');
        }

        if (this.animState === 'ATTACK') {
            if (this.attackTimer > 0.06 && !this.queuedAttack) {
                const nextStep = (this.kickComboStep % 3) + 1;
                this.kickComboStep = nextStep;
                this.queuedAttack = `KICK_${nextStep}`;
                return true;
            }
            return false;
        }

        this.kickComboStep = (this.kickComboStep % 3) + 1;
        this.punchComboStep = 0;
        return this.triggerAttack(`KICK_${this.kickComboStep}`);
    }

    // Execute a specific attack move immediately
    triggerAttack(type, isComboChain = false) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            return false;
        }
        if (!isComboChain && this.animState === 'ATTACK' && this.attackPhase < 2) {
            return false;
        }

        if (type === 'SPECIAL') {
            if (this.energy < 40) return false;
            this.energy -= 40;
        }

        this.isBlocking = false;
        this.animState = 'ATTACK';
        this.attackType = type;
        this.attackPhase = 0;
        this.attackTimer = 0;
        this.hitRegistered = false;
        this.comboResetTimer = 1.05;
        this.trailTimer = 0;

        switch (type) {
            case 'PUNCH_1': // 1. Left Snapping Jab
                this.attackDuration = 0.28;
                if (this.isGrounded) this.velocity.x = this.facing * 3.5;
                window.soundEngine.playPunchSwing();
                break;
            case 'PUNCH_2': // 2. Right Power Cross
                this.attackDuration = 0.32;
                if (this.isGrounded) this.velocity.x = this.facing * 4.5;
                window.soundEngine.playPunchSwing();
                break;
            case 'PUNCH_3': // 3. Tekken Electric Dragon Uppercut!
                this.attackDuration = 0.44;
                if (this.isGrounded) this.velocity.x = this.facing * 6.0;
                window.soundEngine.playPunchSwing();
                break;
            case 'KICK_1': // 1. Left High Roundhouse Kick
                this.attackDuration = 0.34;
                if (this.isGrounded) this.velocity.x = this.facing * 3.8;
                window.soundEngine.playKickSwing();
                break;
            case 'KICK_2': // 2. Right Heavy Thrust Kick
                this.attackDuration = 0.38;
                if (this.isGrounded) this.velocity.x = this.facing * 4.8;
                window.soundEngine.playKickSwing();
                break;
            case 'KICK_3': // 3. 360° Tornado Jumping Spin Kick!
                this.attackDuration = 0.52;
                if (this.isGrounded) {
                    this.velocity.x = this.facing * 7.2;
                    this.velocity.y = 6.5; // short acrobatic hop!
                    this.isGrounded = false;
                }
                window.soundEngine.playKickSwing();
                break;
            case 'AIR_KICK':
                this.attackDuration = 0.38;
                this.velocity.x = this.facing * 8.5;
                window.soundEngine.playKickSwing();
                break;
            case 'SPECIAL':
                this.attackDuration = 0.52;
                this.queuedAttack = null;
                window.soundEngine.playSpecialCharge();
                break;
        }

        return true;
    }

    triggerDash(direction) {
        if (this.dashCooldown > 0 || this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            return false;
        }
        this.isBlocking = false;
        this.queuedAttack = null;
        this.animState = 'DASH';
        this.animTime = 0;
        this.dashTimer = 0.22;
        this.dashCooldown = 0.48;
        this.ghostSpawnTimer = 0;
        const dashDir = direction || this.facing;
        this.velocity.x = dashDir * this.dashSpeed;

        window.soundEngine.playDash();
        this.vfx.spawnGhostTrail(this.root, this.accentColor);
        this.vfx.spawnGroundDust(this.position, 5);
        return true;
    }

    triggerJump() {
        if (!this.isGrounded || this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            return false;
        }
        this.isBlocking = false;
        this.queuedAttack = null;
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.animState = 'JUMP';
        this.animTime = 0;
        window.soundEngine.playJump();
        this.vfx.spawnGroundDust(this.position, 5);
        return true;
    }

    setBlock(isBlocking) {
        if (this.animState === 'HURT' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP' || this.animState === 'KO') {
            this.isBlocking = false;
            return;
        }
        this.isBlocking = isBlocking;
        if (isBlocking && this.animState !== 'ATTACK' && this.animState !== 'DASH') {
            this.animState = 'BLOCK';
        } else if (!isBlocking && this.animState === 'BLOCK') {
            this.animState = 'IDLE';
        }
    }

    takeDamage(amount, knockbackX = 0, knockbackY = 0, isHeavy = false, attacker = null) {
        if (this.isInvulnerable || this.animState === 'KO' || this.animState === 'KNOCKDOWN' || this.animState === 'GETUP') {
            return false;
        }

        let finalDamage = amount;
        let blocked = false;
        this.queuedAttack = null;

        if (attacker) {
            const dirToAttacker = attacker.position.x > this.position.x ? 1 : -1;
            this.setFacing(dirToAttacker);
        }

        if (this.isBlocking) {
            blocked = true;
            finalDamage = Math.max(1, Math.round(amount * 0.2));
            knockbackX *= 0.2;
            knockbackY = 0;
            window.soundEngine.playBlock();
            this.vfx.spawnHitSparks(this.getChestWorldPos(), 0x00f0ff, 8, 0.7);
            this.vfx.spawnDamageNumber(this.getChestWorldPos(), `GUARD -${finalDamage}`, 'blocked');
            this.vfx.triggerShake(0.1);
        } else {
            if (isHeavy) {
                window.soundEngine.playKickHit();
                this.vfx.triggerShake(0.42);
            } else {
                window.soundEngine.playPunchHit(false);
                this.vfx.triggerShake(0.18);
            }

            const hitPos = this.getChestWorldPos();
            this.vfx.spawnHitSparks(hitPos, 0xffea00, isHeavy ? 20 : 11, isHeavy ? 1.35 : 1.0);
            this.vfx.spawnShockwave(hitPos, isHeavy ? 0xffea00 : 0xffffff, isHeavy ? 2.3 : 1.3);
            this.vfx.spawnDamageNumber(hitPos, `-${finalDamage}`, isHeavy ? 'crit' : 'normal');
        }

        this.health = Math.max(0, this.health - finalDamage);
        this.energy = Math.min(this.maxEnergy, this.energy + 9);

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
            if (isHeavy && (Math.abs(knockbackX) >= 9 || knockbackY >= 5)) {
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
        this.energy = 50;
        this.position.set(xPos, 0, 0);
        this.root.position.copy(this.position);
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isBlocking = false;
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.attackType = null;
        this.queuedAttack = null;
        this.punchComboStep = 0;
        this.kickComboStep = 0;
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

    // Apply an interpolated pose dictionary to the skeleton
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

    // Tekken 3-Phase Attack Curve:
    // 0.00 -> 0.20: Guard to Chamber (Coil)
    // 0.20 -> 0.40: Explosive Snap from Chamber to Full Strike Extension
    // 0.40 -> 0.62: Impact Hold (Crisp Silhouette Lock!)
    // 0.62 -> 1.00: Smooth Return to Fighting Guard
    applyThreePhaseStrike(p, chamberPose, strikePose) {
        if (p < 0.20) {
            const f = p / 0.20;
            const ease = f * f;
            this.applyBlendedPose(this.GUARD_POSE, chamberPose, ease);
        } else if (p < 0.40) {
            const f = (p - 0.20) / 0.20;
            // Fast explosive snap (quartic ease-out)
            const snap = 1 - Math.pow(1 - f, 4);
            this.applyBlendedPose(chamberPose, strikePose, snap);
        } else if (p < 0.62) {
            // Hold peak extension with subtle breathing tension
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
            this.energy = Math.min(this.maxEnergy, this.energy + 4.0 * delta);
        }

        if (this.dashCooldown > 0) this.dashCooldown -= delta;
        if (this.comboResetTimer > 0) {
            this.comboResetTimer -= delta;
            if (this.comboResetTimer <= 0) {
                this.punchComboStep = 0;
                this.kickComboStep = 0;
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
                this.vfx.spawnGroundDust(this.position, 4);
            }

            if (this.animState === 'JUMP' || (this.animState === 'ATTACK' && this.attackType === 'AIR_KICK')) {
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
            if (this.isGrounded) {
                this.velocity.x *= Math.pow(0.0005, delta);
                if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
            } else {
                this.velocity.x *= Math.pow(0.35, delta);
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

    // Tekken 8 Martial Arts Attack Choreography
    updateAttackAnimation(delta) {
        this.attackTimer += delta;
        this.trailTimer += delta;
        const p = Math.min(1.0, this.attackTimer / this.attackDuration);

        // Phases: 0 = Chamber (0-20%), 1 = Active Strike & Hold (20-65%), 2 = Recovery (65-100%)
        if (p < 0.20) {
            this.attackPhase = 0;
        } else if (p < 0.65) {
            this.attackPhase = 1;
        } else {
            this.attackPhase = 2;
        }

        // Check Buffered Combo Chain right after peak strike hold (p >= 0.58)!
        if (p >= 0.58 && this.queuedAttack) {
            const nextMove = this.queuedAttack;
            this.queuedAttack = null;
            this.triggerAttack(nextMove, true);
            return;
        }

        switch (this.attackType) {
            // =========================================================================
            // 3-HIT PUNCH COMBO: 1. Left Jab -> 2. Right Cross -> 3. Electric Uppercut
            // =========================================================================
            case 'PUNCH_1': {
                const chamber = {
                    hipsY: 0.88,
                    hips: [0, -0.35, 0],
                    spine: [0.06, -0.15, 0],
                    neck: [-0.04, 0.15, 0],
                    lShoulder: [-0.45, 0.25, 0.25],
                    lElbow: -2.05, // tightly chambered at left cheek/rib
                    rShoulder: [-0.65, -0.25, -0.20],
                    rElbow: -1.85,
                    lHip: [-0.42, 0.1, 0.08],
                    lKnee: 0.62,
                    rHip: [0.28, -0.1, -0.08],
                    rKnee: 0.35
                };
                const strike = {
                    hipsY: 0.85,
                    hips: [0, 0.22, 0],
                    spine: [0.20, 0.65, 0], // left shoulder whips forward!
                    neck: [-0.14, -0.55, 0], // eyes stay locked forward!
                    lShoulder: [-1.58, -0.20, 0.0], // straight horizontal jab extension!
                    lElbow: -0.04, // elbow snaps straight!
                    rShoulder: [-0.55, -0.30, -0.25], // right hand guards jaw
                    rElbow: -1.95,
                    lHip: [-0.65, 0.1, 0.08],
                    lKnee: 0.82,
                    rHip: [0.45, -0.1, -0.08],
                    rKnee: 0.22
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.025) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getLeftHandWorldPos(), this.accentColor, 1.4);
                }
                break;
            }

            case 'PUNCH_2': {
                const chamber = {
                    hipsY: 0.86,
                    hips: [0, 0.38, 0],
                    spine: [0.10, 0.52, 0],
                    neck: [-0.06, -0.45, 0],
                    lShoulder: [-1.15, 0, 0.15], // lead hand retracting from jab
                    lElbow: -0.75,
                    rShoulder: [0.22, -0.30, -0.35], // right fist cocked way back!
                    rElbow: -2.05,
                    lHip: [-0.55, 0.1, 0.08],
                    lKnee: 0.72,
                    rHip: [0.35, -0.1, -0.08],
                    rKnee: 0.45
                };
                const strike = {
                    hipsY: 0.82,
                    hips: [0, -0.45, 0], // deep hip pivot!
                    spine: [0.28, -0.78, 0], // right shoulder drives through target!
                    neck: [-0.18, 0.68, 0],
                    lShoulder: [-0.55, 0.28, 0.28], // left hand tucked to cheek guard
                    lElbow: -1.95,
                    rShoulder: [-1.62, 0.22, 0.0], // full power right cross extension!
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

            case 'PUNCH_3': {
                // Tekken Electric Wind God Fist (Crouch Wave-Dash -> Sky-Ripping Uppercut!)
                const chamber = {
                    hipsY: 0.68, // deep Mishima crouch!
                    hips: [0.15, 0.45, 0],
                    spine: [0.45, 0.65, 0], // torso coiled low & forward
                    neck: [-0.35, -0.55, 0],
                    lShoulder: [-0.35, 0.35, 0.40],
                    lElbow: -1.45,
                    rShoulder: [0.38, -0.25, -0.35], // right arm loaded low at hip!
                    rElbow: -1.75,
                    lHip: [-0.95, 0, 0.1],
                    lKnee: 1.45,
                    rHip: [0.35, 0, -0.1],
                    rKnee: 1.15
                };
                const strike = {
                    hipsY: 1.06, // explosive upward rise!
                    hips: [-0.12, -0.52, 0],
                    spine: [-0.28, -0.78, 0], // chest arches skyward!
                    neck: [0.15, 0.60, 0],
                    lShoulder: [0.42, 0.2, 0.48], // left arm counter-pulled back
                    lElbow: -1.55,
                    rShoulder: [-2.35, 0.18, -0.08], // right fist rips high overhead!
                    rElbow: -0.52, // classic bent-arm uppercut lock!
                    lHip: [-0.22, 0, 0.08],
                    lKnee: 0.30,
                    rHip: [-0.88, 0, -0.08], // rising right knee drive!
                    rKnee: 1.35
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.018) {
                    this.trailTimer = 0;
                    const rHand = this.getRightHandWorldPos();
                    this.vfx.spawnStrikeTrail(rHand, 0xffea00, 2.1);
                    this.vfx.spawnHitSparks(rHand, this.accentColor, 1, 0.6);
                }
                break;
            }

            // =========================================================================
            // 3-HIT KICK COMBO: 1. Left High Kick -> 2. Right Heavy Kick -> 3. 360 Tornado Kick
            // =========================================================================
            case 'KICK_1': {
                // 1. Left High Roundhouse Kick (Kaki Kiri)
                const chamber = {
                    hipsY: 0.90,
                    hips: [-0.10, -0.25, 0],
                    spine: [-0.15, -0.20, 0],
                    neck: [0.10, 0.20, 0],
                    lShoulder: [-0.70, 0.2, 0.3],
                    lElbow: -1.65,
                    rShoulder: [-0.70, -0.2, -0.3],
                    rElbow: -1.75,
                    lHip: [-1.45, 0.25, 0.35], // left knee lifted high & chambered!
                    lKnee: 1.68, // tightly folded knee before snap!
                    rHip: [0.05, 0, 0],
                    rKnee: 0.25
                };
                const strike = {
                    hipsY: 0.92,
                    hips: [-0.28, 0.55, -0.18], // hips whip around & tilt!
                    spine: [-0.34, 0.35, 0.12], // torso leans back to counterbalance high kick!
                    neck: [0.22, -0.45, 0],
                    lShoulder: [0.45, 0, 0.50], // left arm counter-swings
                    lElbow: -0.85,
                    rShoulder: [-0.95, 0.25, -0.20], // right hand guards face
                    rElbow: -1.65,
                    lHip: [-1.64, -0.15, 0.24], // left leg extended high!
                    lKnee: 0.04, // knee snaps razor-straight!
                    rHip: [0.24, 0, -0.08],
                    rKnee: 0.18
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.022) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getLeftFootWorldPos(), this.accentColor, 1.7);
                }
                break;
            }

            case 'KICK_2': {
                // 2. Right Heavy Thrust/Roundhouse Kick (Kaki Kanan)
                const chamber = {
                    hipsY: 0.90,
                    hips: [-0.12, 0.35, 0],
                    spine: [-0.18, 0.25, 0],
                    neck: [0.12, -0.25, 0],
                    lShoulder: [-0.80, -0.2, 0.25],
                    lElbow: -1.65,
                    rShoulder: [-0.60, 0.2, -0.35],
                    rElbow: -1.55,
                    lHip: [0.08, 0, 0], // left foot steps down as support pivot!
                    lKnee: 0.25,
                    rHip: [-1.52, -0.25, -0.35], // right knee chambers high!
                    rKnee: 1.68
                };
                const strike = {
                    hipsY: 0.93,
                    hips: [-0.32, -0.65, 0.20], // full opposite hip whip!
                    spine: [-0.38, -0.45, -0.15], // dramatic martial arts lean-back!
                    neck: [0.25, 0.50, 0],
                    lShoulder: [-0.95, -0.25, 0.20], // left hand guards chin
                    lElbow: -1.65,
                    rShoulder: [0.55, 0, -0.50], // right arm counter-swings
                    rElbow: -0.75,
                    lHip: [0.28, 0, 0.08],
                    lKnee: 0.18,
                    rHip: [-1.70, 0.18, -0.24], // right leg snaps razor-straight at head/chest height!
                    rKnee: 0.04
                };
                this.applyThreePhaseStrike(p, chamber, strike);
                if (this.attackPhase === 1 && this.trailTimer >= 0.020) {
                    this.trailTimer = 0;
                    this.vfx.spawnStrikeTrail(this.getRightFootWorldPos(), this.accentColor, 1.9);
                }
                break;
            }

            case 'KICK_3': {
                // 3. 360° Jumping Tornado Spin Kick Finisher! (Tendangan Berputar)
                const chamber = {
                    hipsY: 1.05,
                    hips: [-0.15, Math.PI * 0.85, 0], // mid-spin windup!
                    spine: [-0.15, 0.25, 0],
                    neck: [0.10, 0, 0],
                    lShoulder: [-0.85, 0.3, 0.3],
                    lElbow: -1.65,
                    rShoulder: [-0.85, -0.3, -0.3],
                    rElbow: -1.65,
                    lHip: [-1.15, 0, 0.18], // left knee tucked in air!
                    lKnee: 1.55,
                    rHip: [-1.35, 0, -0.28], // right leg chambered mid-spin!
                    rKnee: 1.60
                };
                const strike = {
                    hipsY: 1.12,
                    hips: [-0.36, Math.PI * 2.0 - 0.55, 0.22], // completes full 360° tornado rotation!
                    spine: [-0.36, -0.45, -0.15],
                    neck: [0.22, 0.45, 0],
                    lShoulder: [-0.95, -0.2, 0.45],
                    lElbow: -1.35,
                    rShoulder: [0.65, 0, -0.58],
                    rElbow: -0.55,
                    lHip: [-0.80, 0, 0.20], // left leg tucked in air
                    lKnee: 1.48,
                    rHip: [-1.76, 0.18, -0.30], // right leg whips out 100% straight!
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
                    lHip: [-1.45, 0, 0.1], // flying side kick extension!
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
        }
    }
}
