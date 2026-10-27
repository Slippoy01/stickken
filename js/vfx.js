/**
 * Stickman Shadow Showdown 3D - Procedural VFX Engine
 * Dynamic Hit Sparks, Shockwaves, Dash Afterimages, Ki Blasts & Camera Shake
 */
class VFXManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Particle Pools
        this.sparks = [];
        this.shockwaves = [];
        this.dustPuffs = [];
        this.projectiles = [];
        this.ghostTrails = [];
        this.floatingTexts = [];

        // Camera Shake
        this.shakeIntensity = 0;
        this.shakeDecay = 0.88;
        this.cameraBasePos = new THREE.Vector3(0, 2.8, 10);
        this.cameraTargetPos = new THREE.Vector3(0, 2.8, 10);

        // Pre-create shared geometries (NEVER dispose these during gameplay!)
        this.sparkGeo = new THREE.SphereGeometry(0.06, 6, 6);
        this.dustGeo = new THREE.SphereGeometry(0.14, 6, 6);
        this.ringGeo = new THREE.RingGeometry(0.12, 0.26, 24);
    }

    triggerShake(amount = 0.25) {
        this.shakeIntensity = Math.min(this.shakeIntensity + amount, 1.0);
    }

    // Spawn glowing Tekken-style strike trail node along fist/foot arc
    spawnStrikeTrail(position, colorHex = 0x00f0ff, scale = 1.8) {
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.85
        });
        const mesh = new THREE.Mesh(this.sparkGeo, mat);
        mesh.position.copy(position);
        mesh.scale.set(scale, scale, scale);

        this.scene.add(mesh);
        this.sparks.push({
            mesh,
            mat,
            velocity: new THREE.Vector3(0, 0, 0),
            noGravity: true,
            life: 1.0,
            decay: 6.5,
            size: scale
        });
    }

    // Spawn sharp particle burst on hit
    spawnHitSparks(position, colorHex = 0xffea00, count = 12, speedMult = 1.0) {
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 1.0
            });
            const mesh = new THREE.Mesh(this.sparkGeo, mat);
            mesh.position.copy(position);

            const angle = Math.random() * Math.PI * 2;
            const elevation = (Math.random() - 0.25) * Math.PI;
            const speed = (2.5 + Math.random() * 5.0) * speedMult;

            const velocity = new THREE.Vector3(
                Math.cos(angle) * Math.cos(elevation) * speed,
                Math.sin(elevation) * speed + 2.0,
                Math.sin(angle) * Math.cos(elevation) * speed * 0.35
            );

            this.scene.add(mesh);
            this.sparks.push({
                mesh,
                mat,
                velocity,
                life: 1.0,
                decay: 2.6 + Math.random() * 1.8,
                size: 0.7 + Math.random() * 0.7
            });
        }
    }

    // Expanding shockwave ring
    spawnShockwave(position, colorHex = 0xffffff, maxRadius = 2.0, duration = 0.26) {
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(this.ringGeo, mat);
        mesh.position.copy(position);
        mesh.rotation.x = (Math.random() - 0.5) * 0.35;
        mesh.rotation.y = (Math.random() - 0.5) * 0.35;

        this.scene.add(mesh);
        this.shockwaves.push({
            mesh,
            mat,
            targetScale: maxRadius * 2.8,
            duration: duration,
            age: 0
        });
    }

    // Ground dust puffs on dash/land/jump
    spawnGroundDust(position, count = 4) {
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x99aacc,
                transparent: true,
                opacity: 0.42
            });
            const mesh = new THREE.Mesh(this.dustGeo, mat);
            mesh.position.set(
                position.x + (Math.random() - 0.5) * 0.5,
                Math.max(0.08, position.y + 0.08),
                position.z + (Math.random() - 0.5) * 0.3
            );

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 1.4,
                0.6 + Math.random() * 1.0,
                (Math.random() - 0.5) * 0.6
            );

            this.scene.add(mesh);
            this.dustPuffs.push({
                mesh,
                mat,
                velocity,
                scale: 0.4 + Math.random() * 0.4,
                life: 1.0,
                decay: 2.2 + Math.random() * 1.2
            });
        }
    }

    // Ghost / Shadow clone afterimage during fast dash
    spawnGhostTrail(stickmanRoot, colorHex = 0x00f0ff) {
        if (this.ghostTrails.length > 8) return; // cap max active ghosts

        const clone = stickmanRoot.clone(true);
        clone.position.copy(stickmanRoot.position);
        clone.rotation.copy(stickmanRoot.rotation);

        const ghostMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.32,
            depthWrite: false
        });

        clone.traverse(child => {
            if (child.isMesh) {
                child.material = ghostMat;
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });

        this.scene.add(clone);
        this.ghostTrails.push({
            mesh: clone,
            mat: ghostMat,
            life: 1.0,
            decay: 5.0
        });
    }

    // Fire a glowing Ki Blast projectile
    spawnKiBlast(origin, direction, owner, colorHex = 0x00f0ff) {
        const group = new THREE.Group();
        group.position.copy(origin);

        const coreGeo = new THREE.SphereGeometry(0.24, 12, 12);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const core = new THREE.Mesh(coreGeo, coreMat);
        group.add(core);

        const glowGeo = new THREE.SphereGeometry(0.44, 12, 12);
        const glowMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.65
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        group.add(glow);

        const pLight = new THREE.PointLight(colorHex, 1.5, 6);
        group.add(pLight);

        this.scene.add(group);

        const proj = {
            group,
            coreGeo,
            coreMat,
            glowGeo,
            glowMat,
            direction: direction,
            owner: owner,
            speed: 15.5,
            life: 2.0,
            radius: 0.55,
            colorHex: colorHex,
            damage: 24,
            alive: true
        };

        this.projectiles.push(proj);
        return proj;
    }

    // Spawn floating damage numbers in HTML overlay
    spawnDamageNumber(position, text, type = 'normal') {
        const container = document.getElementById('combat-text-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `combat-number text-${type}`;
        el.textContent = text;
        container.appendChild(el);

        this.floatingTexts.push({
            el,
            pos: position.clone(),
            life: 1.0,
            decay: 1.4,
            offsetY: 0.2
        });
    }

    // Update all VFX every frame
    update(delta) {
        // 1. Update Sparks (Do NOT dispose shared sparkGeo!)
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= s.decay * delta;

            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                s.mat.dispose();
                this.sparks.splice(i, 1);
                continue;
            }

            if (!s.noGravity) {
                s.velocity.y -= 14.0 * delta;
                s.mesh.position.addScaledVector(s.velocity, delta);

                if (s.mesh.position.y < 0.05) {
                    s.mesh.position.y = 0.05;
                    s.velocity.y = -s.velocity.y * 0.4;
                    s.velocity.x *= 0.7;
                }
            }

            s.mat.opacity = Math.max(0, s.life);
            const scale = s.size * (0.3 + s.life * 0.7);
            s.mesh.scale.set(scale, scale, scale);
        }

        // 2. Update Shockwaves (Do NOT dispose shared ringGeo!)
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.age += delta;
            const progress = sw.age / sw.duration;

            if (progress >= 1.0) {
                this.scene.remove(sw.mesh);
                sw.mat.dispose();
                this.shockwaves.splice(i, 1);
                continue;
            }

            const currentScale = THREE.MathUtils.lerp(0.3, sw.targetScale, Math.sqrt(progress));
            sw.mesh.scale.set(currentScale, currentScale, currentScale);
            sw.mat.opacity = (1.0 - progress) * 0.85;
        }

        // 3. Update Dust (Do NOT dispose shared dustGeo!)
        for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
            const d = this.dustPuffs[i];
            d.life -= d.decay * delta;

            if (d.life <= 0) {
                this.scene.remove(d.mesh);
                d.mat.dispose();
                this.dustPuffs.splice(i, 1);
                continue;
            }

            d.mesh.position.addScaledVector(d.velocity, delta);
            d.velocity.multiplyScalar(0.92);

            const scale = d.scale * (1.0 + (1.0 - d.life) * 1.4);
            d.mesh.scale.set(scale, scale, scale);
            d.mat.opacity = d.life * 0.38;
        }

        // 4. Update Ghost Trails (Do NOT dispose stickman geometries!)
        for (let i = this.ghostTrails.length - 1; i >= 0; i--) {
            const gt = this.ghostTrails[i];
            gt.life -= gt.decay * delta;

            if (gt.life <= 0) {
                this.scene.remove(gt.mesh);
                gt.mat.dispose();
                this.ghostTrails.splice(i, 1);
                continue;
            }

            gt.mat.opacity = gt.life * 0.3;
        }

        // 5. Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= delta;

            if (p.life <= 0 || !p.alive) {
                this.scene.remove(p.group);
                p.coreGeo.dispose();
                p.coreMat.dispose();
                p.glowGeo.dispose();
                p.glowMat.dispose();
                this.projectiles.splice(i, 1);
                continue;
            }

            p.group.position.x += p.direction * p.speed * delta;
            p.group.rotation.z += 15.0 * delta;

            if (Math.random() < 0.35) {
                this.spawnHitSparks(p.group.position, p.colorHex, 1, 0.35);
            }
        }

        // 6. Update Floating Combat Text
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;
        const tempVec = new THREE.Vector3();

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life -= ft.decay * delta;
            ft.offsetY += 1.4 * delta;

            if (ft.life <= 0) {
                if (ft.el.parentNode) ft.el.parentNode.removeChild(ft.el);
                this.floatingTexts.splice(i, 1);
                continue;
            }

            tempVec.copy(ft.pos);
            tempVec.y += ft.offsetY;
            tempVec.project(this.camera);

            const screenX = (tempVec.x * halfWidth) + halfWidth;
            const screenY = -(tempVec.y * halfHeight) + halfHeight;

            ft.el.style.left = `${screenX}px`;
            ft.el.style.top = `${screenY}px`;
            ft.el.style.opacity = Math.min(1.0, ft.life * 1.5);
            ft.el.style.transform = `translate(-50%, -50%) scale(${0.85 + (1.0 - ft.life * 0.2)})`;
        }

        // 7. Update Camera Shake
        if (this.shakeIntensity > 0.005) {
            const angle = Math.random() * Math.PI * 2;
            const r = this.shakeIntensity * (0.7 + Math.random() * 0.3);
            this.camera.position.x = this.cameraTargetPos.x + Math.cos(angle) * r;
            this.camera.position.y = this.cameraTargetPos.y + Math.sin(angle) * r;
            this.camera.position.z = this.cameraTargetPos.z + (Math.random() - 0.5) * r * 0.4;

            this.shakeIntensity *= Math.pow(this.shakeDecay, delta * 60);
        } else {
            this.shakeIntensity = 0;
            this.camera.position.lerp(this.cameraTargetPos, Math.min(1.0, 9.0 * delta));
        }
    }

    clear() {
        this.sparks.forEach(s => { this.scene.remove(s.mesh); s.mat.dispose(); });
        this.shockwaves.forEach(sw => { this.scene.remove(sw.mesh); sw.mat.dispose(); });
        this.dustPuffs.forEach(d => { this.scene.remove(d.mesh); d.mat.dispose(); });
        this.ghostTrails.forEach(gt => { this.scene.remove(gt.mesh); gt.mat.dispose(); });
        this.projectiles.forEach(p => {
            this.scene.remove(p.group);
            p.coreGeo.dispose();
            p.coreMat.dispose();
            p.glowGeo.dispose();
            p.glowMat.dispose();
        });
        this.floatingTexts.forEach(ft => {
            if (ft.el.parentNode) ft.el.parentNode.removeChild(ft.el);
        });

        this.sparks = [];
        this.shockwaves = [];
        this.dustPuffs = [];
        this.ghostTrails = [];
        this.projectiles = [];
        this.floatingTexts = [];
    }
}
