/**
 * Stickman Shadow Showdown 3D - AI Fighter Engine
 * Dynamic decision-tree combat AI with multi-difficulty behavior,
 * combos, defensive blocking, smart wakeup spacing, and projectile usage.
 */
class FighterAI {
    constructor(fighter, target, difficulty = 'normal') {
        this.fighter = fighter;
        this.target = target;
        this.difficulty = difficulty; // 'easy', 'normal', 'brutal'

        this.decisionTimer = 0;
        this.decisionInterval = 0.2;
        this.comboQueue = [];
        this.currentAction = 'IDLE'; // IDLE, MOVE_LEFT, MOVE_RIGHT
        this.actionTimer = 0;

        this.configureDifficulty();
    }

    setDifficulty(diff) {
        this.difficulty = diff;
        this.configureDifficulty();
    }

    configureDifficulty() {
        switch (this.difficulty) {
            case 'easy':
                this.decisionInterval = 0.36;
                this.blockChance = 0.18;
                this.aggression = 0.42;
                this.comboTendency = 0.30;
                break;
            case 'normal':
                this.decisionInterval = 0.20;
                this.blockChance = 0.45;
                this.aggression = 0.68;
                this.comboTendency = 0.60;
                break;
            case 'brutal':
                this.decisionInterval = 0.10;
                this.blockChance = 0.78;
                this.aggression = 0.88;
                this.comboTendency = 0.85;
                break;
        }
    }

    update(delta) {
        if (!this.fighter || !this.target) return;
        if (this.fighter.animState === 'KO' || this.target.animState === 'KO') {
            this.fighter.setBlock(false);
            this.comboQueue = [];
            return;
        }

        this.decisionTimer -= delta;
        this.actionTimer -= delta;

        const dirToTarget = this.target.position.x >= this.fighter.position.x ? 1 : -1;

        // Process queued combo attacks when ready
        if (this.comboQueue.length > 0) {
            if (this.fighter.animState === 'HURT' || this.fighter.animState === 'KNOCKDOWN') {
                this.comboQueue = [];
            } else if (this.fighter.animState === 'IDLE' || (this.fighter.animState === 'ATTACK' && this.fighter.attackPhase === 2)) {
                const dist = Math.abs(this.fighter.position.x - this.target.position.x);
                if (dist < 2.2) {
                    const nextAttack = this.comboQueue.shift();
                    this.fighter.setFacing(dirToTarget);
                    this.fighter.triggerAttack(nextAttack, true);
                } else {
                    this.comboQueue = [];
                }
            }
        }

        // Periodic decision making
        if (this.decisionTimer <= 0) {
            this.decisionTimer = this.decisionInterval * (0.85 + Math.random() * 0.3);
            this.makeDecision();
        }

        // Execute active continuous movement
        this.executeAction(delta, dirToTarget);
    }

    makeDecision() {
        const dist = Math.abs(this.fighter.position.x - this.target.position.x);
        const dirToTarget = this.target.position.x >= this.fighter.position.x ? 1 : -1;
        const targetIsAttacking = (this.target.animState === 'ATTACK' && this.target.attackPhase <= 1);
        const targetIsDown = (this.target.animState === 'KNOCKDOWN' || this.target.animState === 'GETUP' || this.target.animState === 'THROWN');

        if (this.fighter.animState !== 'DASH') {
            this.fighter.setFacing(dirToTarget);
        }

        // 0. If target is knocked down, back off slightly
        if (targetIsDown) {
            this.fighter.setGuardAndCrouch(false, false);
            this.comboQueue = [];
            if (dist < 2.2) {
                this.currentAction = dirToTarget > 0 ? 'MOVE_LEFT' : 'MOVE_RIGHT';
                this.actionTimer = 0.25;
            } else {
                this.currentAction = 'IDLE';
            }
            return;
        }

        // 1. DEFENSIVE REACTION (Kamen Rider Agito ✕ Guard: Stand Guard vs High, Duck Guard vs Low)
        if (targetIsAttacking && dist < 2.5) {
            if (Math.random() < this.blockChance) {
                const incomingHitLevel = Stickman.getAttackHitLevel(this.target.attackType);
                const shouldDuckGuard = (incomingHitLevel === 'LOW');
                this.fighter.setGuardAndCrouch(true, shouldDuckGuard);
                this.currentAction = 'IDLE';
                this.actionTimer = 0.30;
                return;
            } else if (Math.random() < 0.35 && this.fighter.dashCooldown <= 0) {
                this.fighter.triggerDash(-dirToTarget);
                return;
            }
        } else if ((this.fighter.isBlocking || this.fighter.isCrouchBlocking) && Math.random() < 0.85) {
            this.fighter.setGuardAndCrouch(false, false);
        }

        // 2. LONG RANGE (dist > 6.5 units): Energy Blast (○) or Dash in
        if (dist > 6.5) {
            if (this.fighter.energy >= 25 && Math.random() < 0.55) {
                this.fighter.triggerAttack('SPECIAL');
                return;
            }

            if (Math.random() < this.aggression && this.fighter.dashCooldown <= 0) {
                this.fighter.triggerDash(dirToTarget);
            } else {
                this.currentAction = dirToTarget > 0 ? 'MOVE_RIGHT' : 'MOVE_LEFT';
                this.actionTimer = 0.45;
            }
            return;
        }

        // 3. MID RANGE (2.0 <= dist <= 6.5 units): Dash Strike (Dash + □), Sleding (⬇️ + □), or Air Rider Kick (Udara + ○)
        if (dist >= 2.0 && dist <= 6.5) {
            const roll = Math.random();

            if (roll < 0.26 && this.fighter.isGrounded && dist < 4.5) {
                this.fighter.triggerJump();
                setTimeout(() => {
                    if (this.fighter && this.fighter.animState === 'JUMP') {
                        if (this.fighter.energy >= 25 && Math.random() < 0.5) {
                            this.fighter.triggerAttack('SPECIAL_DIVE', true);
                        } else {
                            this.fighter.triggerAttack('AIR_KICK', true);
                        }
                    }
                }, 150);
            } else if (roll < 0.52 && dist < 3.6 && this.fighter.isGrounded) {
                // Sleding / Sliding Kick (⬇️ + □) or Dash Attack (Dash + □)
                if (Math.random() < 0.5) {
                    this.fighter.triggerAttack('SLIDE_KICK', true);
                } else {
                    this.fighter.triggerDash(dirToTarget);
                    this.comboQueue = ['DASH_STRIKE'];
                }
            } else if (roll < 0.72 && this.fighter.dashCooldown <= 0 && dist > 3.0) {
                this.fighter.triggerDash(dirToTarget);
            } else {
                this.currentAction = dirToTarget > 0 ? 'MOVE_RIGHT' : 'MOVE_LEFT';
                this.actionTimer = 0.30;
            }
            return;
        }

        // 4. CLOSE RANGE (dist < 2.0 units) - KAMEN RIDER AGITO COMBAT!
        if (dist < 2.0) {
            this.currentAction = 'IDLE';
            const attackRoll = Math.random();

            if (attackRoll < this.aggression) {
                this.fighter.setGuardAndCrouch(false, false);

                // A. Anti-Guard: If player holds ✕ to Guard, use △ Peluk Banting or ⬇️+□ Sleding!
                if ((this.target.isBlocking || this.target.isCrouchBlocking) && Math.random() < 0.70) {
                    if (Math.random() < 0.55) {
                        this.fighter.requestTriangleThrow(this.target);
                    } else if (this.target.isBlocking) {
                        this.fighter.triggerAttack('SLIDE_KICK', true);
                    } else {
                        this.fighter.triggerAttack('DASH_STRIKE', true);
                    }
                    return;
                }

                // B. Directional Special ○ Moves in close range
                if (this.fighter.energy >= 25 && Math.random() < 0.28) {
                    const specPick = Math.random() < 0.5 ? 'SPECIAL_UPPER' : 'SPECIAL_LOW';
                    this.fighter.triggerAttack(specPick, true);
                    return;
                }

                // C. 4-Hit □ Basic Combo or Sleding Mixup
                if (Math.random() < this.comboTendency) {
                    const comboType = Math.floor(Math.random() * 3);
                    if (comboType === 0) {
                        // Full 4-Hit □-□-□-□ Agito Combo!
                        this.fighter.triggerAttack('LP');
                        this.comboQueue = ['RP', 'LK', '3_3_4_FINISHER'];
                    } else if (comboType === 1) {
                        // □-□ into Sleding (⬇️+□) Low Mixup!
                        this.fighter.triggerAttack('LP');
                        this.comboQueue = ['RP', 'SLIDE_KICK'];
                    } else {
                        // □-□-□ into Rising Uppercut (⬆️+○)
                        this.fighter.triggerAttack('LP');
                        this.comboQueue = ['RP', 'LK', 'SPECIAL_UPPER'];
                    }
                } else {
                    const attacks = ['LP', 'RP', 'LK', 'SLIDE_KICK', 'DASH_STRIKE'];
                    const picked = attacks[Math.floor(Math.random() * attacks.length)];
                    this.fighter.triggerAttack(picked);
                }
            } else {
                if (Math.random() < 0.45) {
                    this.fighter.setGuardAndCrouch(true, Math.random() < 0.35);
                    this.actionTimer = 0.25;
                } else {
                    this.currentAction = dirToTarget > 0 ? 'MOVE_LEFT' : 'MOVE_RIGHT';
                    this.actionTimer = 0.20;
                }
            }
        }
    }

    executeAction(delta, dirToTarget) {
        if (this.actionTimer <= 0) {
            this.currentAction = 'IDLE';
        }

        const st = this.fighter.animState;
        if (st === 'ATTACK' || st === 'HURT' || st === 'KNOCKDOWN' || st === 'GETUP' || st === 'KO' || st === 'DASH') {
            this.fighter.moveDir = 0;
            return;
        }

        if (this.currentAction === 'MOVE_LEFT') {
            this.fighter.position.x -= this.fighter.walkSpeed * delta;
            this.fighter.moveDir = -1;
            this.fighter.setFacing(dirToTarget);
            if (this.fighter.isGrounded && !this.fighter.isBlocking) {
                this.fighter.animState = 'RUN';
            }
        } else if (this.currentAction === 'MOVE_RIGHT') {
            this.fighter.position.x += this.fighter.walkSpeed * delta;
            this.fighter.moveDir = 1;
            this.fighter.setFacing(dirToTarget);
            if (this.fighter.isGrounded && !this.fighter.isBlocking) {
                this.fighter.animState = 'RUN';
            }
        } else {
            this.fighter.moveDir = 0;
            if (this.fighter.isGrounded && !this.fighter.isBlocking) {
                this.fighter.animState = 'IDLE';
            }
        }
    }
}
