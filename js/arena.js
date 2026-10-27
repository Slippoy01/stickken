/**
 * Stickman Shadow Showdown 3D - Procedural 3D Arenas
 * 100% Procedural Environments: Cyber Neon Dojo & Sunset Skyscraper Rooftop
 */
class ArenaManager {
    constructor(scene) {
        this.scene = scene;
        this.currentArenaGroup = new THREE.Group();
        this.scene.add(this.currentArenaGroup);

        this.lights = [];
        this.animatedElements = [];
        this.currentType = 'cyber'; // 'cyber' or 'sunset'

        this.bounds = 16.0; // Left & Right arena boundaries
    }

    buildArena(type = 'cyber') {
        this.currentType = type;

        // Clear previous arena
        while (this.currentArenaGroup.children.length > 0) {
            const obj = this.currentArenaGroup.children[0];
            this.currentArenaGroup.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }

        this.lights.forEach(l => this.scene.remove(l));
        this.lights = [];
        this.animatedElements = [];

        if (type === 'cyber') {
            this.buildCyberDojo();
        } else {
            this.buildSunsetRooftop();
        }
    }

    // ARENA 1: Cyber Neon Dojo
    buildCyberDojo() {
        this.scene.fog = new THREE.FogExp2(0x0a0c16, 0.035);

        // Lighting
        const ambient = new THREE.AmbientLight(0x223355, 1.2);
        this.scene.add(ambient);
        this.lights.push(ambient);

        const dirLight = new THREE.DirectionalLight(0xddeeff, 1.8);
        dirLight.position.set(5, 12, 8);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 25;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -5;
        dirLight.shadow.bias = -0.001;
        this.scene.add(dirLight);
        this.lights.push(dirLight);

        // Neon Accent Spotlights
        const spotCyan = new THREE.PointLight(0x00f0ff, 2.5, 18);
        spotCyan.position.set(-10, 5, 2);
        this.scene.add(spotCyan);
        this.lights.push(spotCyan);

        const spotPink = new THREE.PointLight(0xff0077, 2.5, 18);
        spotPink.position.set(10, 5, 2);
        this.scene.add(spotPink);
        this.lights.push(spotPink);

        // Procedural Grid Texture on Dark Metal Floor
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f111a';
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = '#1e2438';
        ctx.lineWidth = 3;
        const step = 64;
        for (let x = 0; x <= 512; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 512);
            ctx.stroke();
        }
        for (let y = 0; y <= 512; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(512, y);
            ctx.stroke();
        }

        const floorTexture = new THREE.CanvasTexture(canvas);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(12, 6);

        // Floor Plane
        const floorGeo = new THREE.PlaneGeometry(48, 24);
        const floorMat = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.25,
            metalness: 0.7
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.currentArenaGroup.add(floor);

        // Glowing Arena Ring Boundary (Border Lines)
        const ringGeo = new THREE.BoxGeometry(36, 0.08, 0.2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const ringFront = new THREE.Mesh(ringGeo, ringMat);
        ringFront.position.set(0, 0.04, 4);
        this.currentArenaGroup.add(ringFront);

        const ringBack = new THREE.Mesh(ringGeo, ringMat);
        ringBack.position.set(0, 0.04, -4);
        this.currentArenaGroup.add(ringBack);

        // Cyber Pillars / Torii Gates on background
        for (let i = -3; i <= 3; i++) {
            if (i === 0) continue;
            const x = i * 6.5;

            // Pillar
            const pGeo = new THREE.BoxGeometry(0.8, 8, 0.8);
            const pMat = new THREE.MeshStandardMaterial({ color: 0x151824, roughness: 0.5 });
            const pillar = new THREE.Mesh(pGeo, pMat);
            pillar.position.set(x, 4, -5.5);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.currentArenaGroup.add(pillar);

            // Glowing Neon Strip on Pillar
            const stripGeo = new THREE.BoxGeometry(0.12, 7.8, 0.82);
            const stripMat = new THREE.MeshBasicMaterial({ color: (i > 0 ? 0xff0066 : 0x00e5ff) });
            const strip = new THREE.Mesh(stripGeo, stripMat);
            strip.position.set(x, 4, -5.5);
            this.currentArenaGroup.add(strip);
            this.animatedElements.push(strip);
        }

        // Horizontal connecting neon beams
        const beamGeo = new THREE.BoxGeometry(42, 0.3, 0.3);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x334466 });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(0, 7.5, -5.5);
        this.currentArenaGroup.add(beam);

        // Arena boundary energy posts (Left and Right ends)
        [-17, 17].forEach(x => {
            const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 6, 12);
            const postMat = new THREE.MeshStandardMaterial({ color: 0x222530 });
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(x, 3, 0);
            this.currentArenaGroup.add(post);

            const beaconGeo = new THREE.SphereGeometry(0.35, 12, 12);
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            beacon.position.set(x, 6, 0);
            this.currentArenaGroup.add(beacon);
            this.animatedElements.push(beacon);
        });
    }

    // ARENA 2: Sunset Skyscraper Rooftop
    buildSunsetRooftop() {
        this.scene.fog = new THREE.FogExp2(0x442233, 0.02);

        // Lighting
        const ambient = new THREE.AmbientLight(0xff8866, 1.3);
        this.scene.add(ambient);
        this.lights.push(ambient);

        const sunLight = new THREE.DirectionalLight(0xffaa55, 2.2);
        sunLight.position.set(-15, 10, 10);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        this.scene.add(sunLight);
        this.lights.push(sunLight);

        // Concrete Helipad Floor Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#44464c';
        ctx.fillRect(0, 0, 512, 512);

        // Yellow Helipad Ring and "H"
        ctx.strokeStyle = '#f5c518';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(256, 256, 160, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f5c518';
        ctx.font = 'bold 160px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', 256, 256);

        const roofTexture = new THREE.CanvasTexture(canvas);
        const roofGeo = new THREE.BoxGeometry(36, 10, 16);
        const roofMat = new THREE.MeshStandardMaterial({
            map: roofTexture,
            roughness: 0.7,
            metalness: 0.2
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, -5, 0);
        roof.receiveShadow = true;
        this.currentArenaGroup.add(roof);

        // Low-poly City Skyline Buildings in background
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x181226, roughness: 0.9 });
        for (let b = 0; b < 22; b++) {
            const bw = 2 + Math.random() * 4;
            const bh = 8 + Math.random() * 24;
            const bd = 3 + Math.random() * 5;
            const bGeo = new THREE.BoxGeometry(bw, bh, bd);
            const building = new THREE.Mesh(bGeo, buildingMat);

            const bx = (b - 11) * 4.5 + (Math.random() - 0.5) * 2;
            const bz = -12 - Math.random() * 16;
            building.position.set(bx, bh / 2 - 12, bz);
            this.currentArenaGroup.add(building);

            // Random lit windows
            if (Math.random() < 0.75) {
                const winGeo = new THREE.BoxGeometry(bw * 0.8, 0.4, 0.1);
                const winMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
                const win = new THREE.Mesh(winGeo, winMat);
                win.position.set(bx, bh * 0.6 - 12, bz + bd / 2 + 0.05);
                this.currentArenaGroup.add(win);
            }
        }
    }

    update(time) {
        // Animate glowing energy strips
        if (this.currentType === 'cyber') {
            this.animatedElements.forEach((el, index) => {
                const pulse = 0.75 + Math.sin(time * 3 + index) * 0.25;
                if (el.material && el.material.color) {
                    // Slight brightness modulation
                }
            });
        }
    }
}

