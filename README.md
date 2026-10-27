# 🥋 Stickman Shadow Showdown 3D

Game pertarungan 3D Stickman (*3D Stickman Fighting Game*) yang dibangun **100% dari kode (*All by Code*)** menggunakan **Three.js** dan **Web Audio API**, tanpa memerlukan aset 3D eksternal (`.gltf`, `.fbx`, `.obj`) maupun file audio eksternal (`.mp3`, `.wav`).

---

## 🎮 Cara Menjalankan

Game ini sudah langsung aktif dan dapat dimainkan melalui browser:
- **Lokal:** [http://localhost/testrun/](http://localhost/testrun/) atau [http://127.0.0.1/testrun/](http://127.0.0.1/testrun/)
- **Jaringan Lokal (LAN/HP/Tablet):** `http://192.168.10.142/testrun/`

---

## ✨ Fitur Utama (All by Code)

1. **Procedural 3D Stickman Rig & Skeletal Hierarchy (`js/stickman.js`):**
   - Karakter stickman dibuat murni dari geometri Three.js (`CylinderGeometry`, `SphereGeometry`, `BoxGeometry`).
   - Dilengkapi *glow materials*, mata ninja menyala, dan *cloth streamer headband* dengan simulasi fisika dinamis.
   - Posing & animasi martial arts prosedural (Idle boxing guard, run cycle, shadow dash, jump, jab, heavy cross, launch uppercut, mid kick, 360 spin kick, flying dropkick, guard/block, flinch, tumble knockdown, get-up roll, K.O. collapse, victory pump).

2. **Procedural Web Audio API (`js/audio.js`):**
   - Seluruh suara disintesis secara real-time via oscillator, noise buffers, dan biquad filters:
     - Swing woosh (pukulan & tendangan)
     - Impact hits (smack, heavy bass thud, kick crack)
     - Metallic block deflection
     - Ki charge & Plasma Ki Blast explosion
     - Round bell & K.O. chime
     - Background synthwave battle music beat

3. **Procedural VFX & Visual Polish (`js/vfx.js`):**
   - Radial hit sparks dengan simulasi gravitasi dan pantulan lantai.
   - Expanding shockwave rings (`RingGeometry`).
   - Ghost afterimages saat melakukan dash cepat.
   - Floating combat numbers (angka damage, CRITICAL, BLOCKED).
   - Dynamic camera shake proportional dengan kekuatan pukulan.
   - Hitstop (micro-freeze 45-80ms) untuk sensasi benturan khas game fighting anime/arcade.

4. **Procedural 3D Arenas (`js/arena.js`):**
   - **Cyber Neon Dojo:** Lantai grid reflektif, pilar neon bersinar, pencahayaan kontras (Cyan & Magenta spotlights), kabut atmosferik.
   - **Sunset Skyscraper:** Atap helipad gedung pencakar langit dengan siluet gedung kota dan matahari terbenam.

5. **Sistem Tempur & AI (`js/ai.js`, `js/game.js`):**
   - Deteksi hitbox 3D berdasarkan posisi dunia kepalan tangan, kaki, dan badan lawan.
   - Mode Permainan:
     - **1P vs AI Duel** (Pilihan tingkat kesulitan: Easy, Normal, Brutal).
     - **2P Local Versus** (Bermain berdua dalam 1 keyboard).
     - **Endless Survival Mode** (Melawan gelombang shadow stickman tanpa henti dengan skor & heal reward).
   - Dynamic tracking camera yang otomatis zoom-in saat adu pukul dan menjauh saat berjarak.

---

## 🕹️ Panduan Kontrol

### Player 1 (Keyboard):
| Aksi | Tombol | Keterangan |
| :--- | :--- | :--- |
| **Gerak Kiri / Kanan** | `A` / `D` atau `←` / `→` | Berlari mendekati / menjauhi lawan |
| **Lompat** | `W` atau `Space` atau `↑` | Melompat tinggi |
| **Pukulan Cepat (Punch)** | `J` | Kombo 3 pukulan: *Jab → Straight → Uppercut* |
| **Tendangan Berat (Kick)**| `K` | *Roundhouse Kick*, atau *Flying Dropkick* saat di udara |
| **Shadow Dash (Evade)** | `L` atau `Shift` | Dash kilat dengan bayangan ninja |
| **Tahan / Guard (Block)**| `I` atau `E` | Mengurangi damage sebesar 80% |
| **Jurus Spesial (Ki Blast)**| `U` atau `Q` | Tembakan bola plasma energi (butuh Ki $\ge 40\%$) |
| **Pause Menu** | `P` atau `Escape` | Menghentikan sementara pertandingan |

### Player 2 (Local 2-Player Versus):
| Aksi | Tombol |
| :--- | :--- |
| **Gerak** | Panah `←` / `→` atau `Numpad 4` / `Numpad 6` |
| **Lompat** | Panah `↑` atau `Numpad 8` |
| **Punch** | `Numpad 1` atau `B` |
| **Kick** | `Numpad 2` atau `N` |
| **Dash** | `Numpad 3` atau `M` |
| **Guard** | `Numpad 5` atau `H` |
| **Ki Blast** | `Numpad 0` atau `G` |

### Mobile / Layar Sentuh:
- D-Pad di kiri (Kiri, Kanan, Lompat, Dash).
- Tombol aksi di kanan (Punch, Kick, Guard, Ki Blast).
- Tombol ikon 📱 di kanan atas untuk memunculkan/menyembunyikan tombol sentuh kapan saja.

