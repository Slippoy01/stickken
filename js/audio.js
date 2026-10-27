/**
 * Stickman Shadow Showdown 3D - Procedural Web Audio Engine
 * 100% synthesized sound effects & dynamic synthwave battle music
 * Zero external audio files required!
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.isMuted = false;
        this.isMusicMuted = false;
        this.initialized = false;
        this.musicInterval = null;
        this.musicStep = 0;
    }

    init() {
        if (this.initialized && this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.8;
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.9;
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.35;
            this.musicGain.connect(this.masterGain);

            this.initialized = true;
            this.startBattleMusic();
        } catch (e) {
            console.warn("Web Audio not supported or blocked:", e);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime, 0.05);
        }
        return this.isMuted;
    }

    toggleMusic() {
        this.isMusicMuted = !this.isMusicMuted;
        if (this.musicGain) {
            this.musicGain.gain.setTargetAtTime(this.isMusicMuted ? 0 : 0.35, this.ctx.currentTime, 0.05);
        }
        return this.isMusicMuted;
    }

    // White noise generator buffer
    createNoiseBuffer(duration = 0.3) {
        if (!this.ctx) return null;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // Whoosh swing for fast punches
    playPunchSwing() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.18);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(250, now + 0.15);
        filter.Q.setValueAtTime(3, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(now);
        noise.stop(now + 0.18);
    }

    // Heavier whoosh for kicks
    playKickSwing() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.25);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(150, now + 0.22);
        filter.Q.setValueAtTime(2.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(now);
        noise.stop(now + 0.25);
    }

    // Punch impact: crisp transient smack + solid chest thump
    playPunchHit(isHeavy = false) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Sub bass thump
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = isHeavy ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(isHeavy ? 180 : 150, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + (isHeavy ? 0.22 : 0.14));

        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.22 : 0.14));

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + (isHeavy ? 0.25 : 0.16));

        // High transient smack
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.08);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.08);
    }

    // Heavy Kick impact: bone-crushing boom
    playKickHit(isAirKick = false) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.28);

        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

        oscGain.gain.setValueAtTime(0.85, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.3);

        // Crack transient
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.1);
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(1800, now);
        nFilter.Q.setValueAtTime(2, now);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.6, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.1);
    }

    // Metallic block sound (deflection)
    playBlock() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        [950, 1620, 2400].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.3 / (i + 1), now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.18);
        });

        // Small thud
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.frequency.setValueAtTime(120, now);
        thud.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        thudGain.gain.setValueAtTime(0.4, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        thud.connect(thudGain);
        thudGain.connect(this.sfxGain);
        thud.start(now);
        thud.stop(now + 0.13);
    }

    // Jump sound
    playJump() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(460, now + 0.14);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // Dash sound (air burst)
    playDash() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.2);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.18);
        filter.Q.setValueAtTime(1.8, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.2);
    }

    // Special move charge
    playSpecialCharge() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.4);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.linearRampToValueAtTime(1800, now + 0.4);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.45);
    }

    // Special Ki Blast fire (plasma laser)
    playSpecialBlast() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.36);
    }

    // Ki Blast Explosion impact
    playBlastExplode() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Rumble
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.6);

        oscGain.gain.setValueAtTime(0.9, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.65);

        // Explosion noise
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.5);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.45);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.7, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.5);
    }

    // K.O. Final blow sound + slow motion echo
    playKOBlow() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Sub bass earthquake
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 1.25);

        // Metallic bell chime
        [523.25, 783.99, 1046.5].forEach((f, i) => {
            const bell = this.ctx.createOscillator();
            const bGain = this.ctx.createGain();
            bell.type = 'sine';
            bell.frequency.setValueAtTime(f, now);
            bGain.gain.setValueAtTime(0.3 / (i + 1), now);
            bGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            bell.connect(bGain);
            bGain.connect(this.sfxGain);
            bell.start(now);
            bell.stop(now + 1.5);
        });
    }

    // Round Start Gong/Bell
    playFightBell() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        [440, 880, 1320].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.35 / (i + 1), now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 1.2);
        });
    }

    // Combo escalation sound
    playComboSound(comboCount) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const baseFreq = 300 + Math.min(comboCount * 60, 600);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.16);
    }

    // Procedural battle synth loop (cyberpunk 128 BPM pulse)
    startBattleMusic() {
        if (this.musicInterval) return;

        const bpm = 125;
        const stepTime = (60 / bpm) / 4; // 16th notes
        const bassNotes = [55, 55, 55, 65.4, 55, 55, 73.4, 65.4, 49, 49, 49, 58.2, 49, 49, 65.4, 58.2]; // A minor progression

        this.musicStep = 0;
        this.musicInterval = setInterval(() => {
            if (!this.ctx || this.isMuted || this.isMusicMuted) return;
            const now = this.ctx.currentTime;
            const step = this.musicStep % 16;
            this.musicStep++;

            // Kick drum on 1, 5, 9, 13
            if (step % 4 === 0) {
                const kick = this.ctx.createOscillator();
                const kGain = this.ctx.createGain();
                kick.frequency.setValueAtTime(130, now);
                kick.frequency.exponentialRampToValueAtTime(35, now + 0.12);
                kGain.gain.setValueAtTime(0.35, now);
                kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                kick.connect(kGain);
                kGain.connect(this.musicGain);
                kick.start(now);
                kick.stop(now + 0.13);
            }

            // Snare on 4, 12
            if (step === 4 || step === 12) {
                const snare = this.ctx.createBufferSource();
                snare.buffer = this.createNoiseBuffer(0.15);
                const sFilter = this.ctx.createBiquadFilter();
                sFilter.type = 'highpass';
                sFilter.frequency.setValueAtTime(1000, now);
                const sGain = this.ctx.createGain();
                sGain.gain.setValueAtTime(0.18, now);
                sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                snare.connect(sFilter);
                sFilter.connect(sGain);
                sGain.connect(this.musicGain);
                snare.start(now);
                snare.stop(now + 0.15);
            }

            // Hi-hat on offbeats
            if (step % 2 === 1) {
                const hat = this.ctx.createBufferSource();
                hat.buffer = this.createNoiseBuffer(0.04);
                const hFilter = this.ctx.createBiquadFilter();
                hFilter.type = 'highpass';
                hFilter.frequency.setValueAtTime(7000, now);
                const hGain = this.ctx.createGain();
                hGain.gain.setValueAtTime(0.08, now);
                hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                hat.connect(hFilter);
                hFilter.connect(hGain);
                hGain.connect(this.musicGain);
                hat.start(now);
                hat.stop(now + 0.05);
            }

            // Synth bass line
            const bassFreq = bassNotes[step];
            const bass = this.ctx.createOscillator();
            const bFilter = this.ctx.createBiquadFilter();
            const bGain = this.ctx.createGain();

            bass.type = 'sawtooth';
            bass.frequency.setValueAtTime(bassFreq, now);

            bFilter.type = 'lowpass';
            bFilter.frequency.setValueAtTime(380, now);
            bFilter.Q.setValueAtTime(4, now);

            bGain.gain.setValueAtTime(0.2, now);
            bGain.gain.exponentialRampToValueAtTime(0.001, now + stepTime * 0.9);

            bass.connect(bFilter);
            bFilter.connect(bGain);
            bGain.connect(this.musicGain);

            bass.start(now);
            bass.stop(now + stepTime * 0.95);

        }, stepTime * 1000);
    }
}

// Global singleton instance
window.soundEngine = new SoundEngine();

