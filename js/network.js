/**
 * Stickman Shadow Showdown 3D - WebRTC P2P Network Manager
 * Powered by PeerJS (Free Cloud Signaling + Direct WebRTC DataChannel)
 * Zero server cost, zero lag, direct browser-to-browser communication.
 */

class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomCode = null;
        this.isConnected = false;
        this.ping = 0;
        this.pingTimer = null;
        this.reconnectTimer = null;

        // PeerJS app prefix to prevent global room collisions on public PeerJS cloud
        this.peerPrefix = 'stk8-';

        // Event callbacks
        this.onStatusChange = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onRemoteData = null;
        this.onPingUpdate = null;
        this.onError = null;
    }

    /**
     * Generate a 4-char friendly code (e.g. "TK88" or "TK45")
     */
    generateCode() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = 'TK';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Normalize user-entered code or URL
     */
    cleanCode(raw) {
        if (!raw) return '';
        // If user pasted a full URL like https://codemir.my.id/stickken/?room=TK88
        const urlMatch = raw.match(/[?&]room=([A-Za-z0-9_-]+)/);
        if (urlMatch) {
            return urlMatch[1].toUpperCase().trim();
        }
        return raw.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().trim();
    }

    /**
     * Initialize PeerJS client with fallback
     */
    initPeer(customId = null, onReady = null) {
        if (typeof Peer === 'undefined') {
            console.error('PeerJS library not loaded!');
            if (this.onError) this.onError('PeerJS library gagal dimuat dari CDN. Periksa koneksi internet Anda.');
            return;
        }

        // Clean up previous peer if existing
        if (this.peer && !this.peer.destroyed) {
            this.peer.destroy();
            this.peer = null;
        }

        try {
            // Using standard public PeerJS cloud server (free, no credentials required)
            const options = {
                debug: 1
            };

            this.peer = customId ? new Peer(customId, options) : new Peer(options);

            this.peer.on('open', (id) => {
                console.log('[Network] Peer open with ID:', id);
                if (onReady) onReady(id);
            });

            this.peer.on('error', (err) => {
                console.warn('[Network] Peer error:', err.type, err);
                let userMsg = 'Terjadi kesalahan koneksi P2P.';
                if (err.type === 'unavailable-id') {
                    userMsg = 'Kode Room ini sedang aktif digunakan oleh pemain lain. Silakan coba kode lain.';
                } else if (err.type === 'peer-unavailable') {
                    userMsg = 'Room tidak ditemukan! Pastikan Host sudah membuat room dan kodenya benar.';
                } else if (err.type === 'network') {
                    userMsg = 'Gagal terhubung ke server perantara WebRTC. Periksa internet Anda.';
                }
                if (this.onError) this.onError(userMsg, err);
            });

            this.peer.on('disconnected', () => {
                console.log('[Network] Peer disconnected from cloud server, attempting reconnect...');
                if (this.peer && !this.peer.destroyed) {
                    try { this.peer.reconnect(); } catch (_) {}
                }
            });

        } catch (e) {
            console.error('[Network] Init peer exception:', e);
            if (this.onError) this.onError('Gagal menginisialisasi modul WebRTC.');
        }
    }

    /**
     * Host creates a room with friendly room code
     */
    createRoom(customCode = null) {
        this.isHost = true;
        this.roomCode = customCode ? this.cleanCode(customCode) : this.generateCode();
        const peerId = this.peerPrefix + this.roomCode.toLowerCase();

        this.updateStatus('Mempersiapkan Room...');

        this.initPeer(peerId, () => {
            this.updateStatus('Menunggu Lawan Bergabung...');
            if (this.onStatusChange) {
                this.onStatusChange({
                    status: 'WAITING',
                    code: this.roomCode,
                    isHost: true
                });
            }

            // Listen for incoming connection from guest player
            this.peer.on('connection', (conn) => {
                console.log('[Network] Guest connected to room!');
                this.setupConnection(conn);
            });
        });
    }

    /**
     * Guest joins an existing room by code
     */
    joinRoom(targetCode) {
        this.isHost = false;
        this.roomCode = this.cleanCode(targetCode);

        if (!this.roomCode) {
            if (this.onError) this.onError('Silakan masukkan Kode Room yang valid!');
            return;
        }

        const targetPeerId = this.peerPrefix + this.roomCode.toLowerCase();
        this.updateStatus('Menghubungkan ke Peer Server...');

        // Guest gets an auto-generated random Peer ID
        this.initPeer(null, () => {
            this.updateStatus(`Menghubungkan ke Host (${this.roomCode})...`);

            const conn = this.peer.connect(targetPeerId, {
                reliable: true
            });

            this.setupConnection(conn);
        });
    }

    /**
     * Setup DataConnection listeners
     */
    setupConnection(conn) {
        this.conn = conn;

        this.conn.on('open', () => {
            console.log('[Network] P2P DataChannel OPEN!');
            this.isConnected = true;
            this.updateStatus('Terhubung! Menyiapkan Pertarungan...');

            // Start ping measuring loop
            this.startPingLoop();

            if (this.onConnected) {
                this.onConnected({
                    isHost: this.isHost,
                    roomCode: this.roomCode
                });
            }
        });

        this.conn.on('data', (data) => {
            // Handle internal protocol packets
            if (data && data.type === '__PING__') {
                this.send({ type: '__PONG__', t: data.t });
                return;
            }
            if (data && data.type === '__PONG__') {
                const rtt = Date.now() - data.t;
                this.ping = Math.max(1, Math.round(rtt / 2));
                if (this.onPingUpdate) this.onPingUpdate(this.ping);
                return;
            }

            // Dispatch gameplay packet to game engine
            if (this.onRemoteData) {
                this.onRemoteData(data);
            }
        });

        this.conn.on('close', () => {
            console.warn('[Network] Connection closed by peer');
            this.handleDisconnect('Koneksi terputus dari lawan.');
        });

        this.conn.on('error', (err) => {
            console.error('[Network] Connection error:', err);
            this.handleDisconnect('Terjadi kesalahan pada jalur WebRTC.');
        });
    }

    /**
     * Send arbitrary JSON data over WebRTC DataChannel
     */
    send(data) {
        if (this.conn && this.conn.open) {
            try {
                this.conn.send(data);
            } catch (err) {
                console.error('[Network] Failed to send packet:', err);
            }
        }
    }

    /**
     * Measure ping latency every 2 seconds
     */
    startPingLoop() {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            if (this.isConnected && this.conn && this.conn.open) {
                this.send({ type: '__PING__', t: Date.now() });
            }
        }, 2000);
    }

    updateStatus(text) {
        if (this.onStatusChange) {
            this.onStatusChange({
                status: this.isConnected ? 'CONNECTED' : (this.isHost ? 'WAITING' : 'CONNECTING'),
                text: text,
                code: this.roomCode,
                isHost: this.isHost
            });
        }
    }

    handleDisconnect(reason = 'Koneksi terputus.') {
        this.isConnected = false;
        clearInterval(this.pingTimer);
        if (this.onDisconnected) {
            this.onDisconnected(reason);
        }
    }

    /**
     * Clean disconnect and reset
     */
    disconnect() {
        clearInterval(this.pingTimer);
        this.isConnected = false;
        if (this.conn) {
            try { this.conn.close(); } catch (_) {}
            this.conn = null;
        }
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (_) {}
            this.peer = null;
        }
        this.roomCode = null;
        this.isHost = false;
        this.ping = 0;
    }
}

// Global Network Manager instance
window.networkManager = new NetworkManager();

