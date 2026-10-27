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
        const targetIsDown = (this.target.animState === 'KNOCKDOWN' || this.target.animState === 'GETUP');

        if (this.fighter.animState !== 'DASH') {
            this.fighter.setFacing(dirToTarget);
        }

        // 0. If target is knocked down, back off slightly to respectful distance (~2.4 units)
        if (targetIsDown) {
            this.fighter.setBlock(false);
            this.comboQueue = [];
            if (dist < 2.2) {
                this.currentAction = dirToTarget > 0 ? 'MOVE_LEFT' : 'MOVE_RIGHT';
                this.actionTimer = 0.25;
            } else {
                this.currentAction = 'IDLE';
            }
            return;
        }

        // 1. DEFENSIVE REACTION: If player is attacking in close range
        if (targetIsAttacking && dist < 2.4) {
            if (Math.random() < this.blockChance) {
                this.fighter.setBlock(true);
                this.currentAction = 'IDLE';
                this.actionTimer = 0.30;
                return;
            } else if (Math.random() < 0.35 && this.fighter.dashCooldown <= 0) {
                this.fighter.triggerDash(-dirToTarget);
                return;
            }
        } else if (this.fighter.isBlocking && Math.random() < 0.85) {
            this.fighter.setBlock(false);
        }

        // 2. LONG RANGE (dist > 6.5 units)
        if (dist > 6.5) {
            if (this.fighter.energy >= 40 && Math.random() < 0.55) {
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

        // 3. MID RANGE (2.0 <= dist <= 6.5 units)
        if (dist >= 2.0 && dist <= 6.5) {
            const roll = Math.random();

            if (roll < 0.28 && this.fighter.isGrounded && dist < 4.5) {
                this.fighter.triggerJump();
                setTimeout(() => {
                    if (this.fighter && this.fighter.animState === 'JUMP') {
                        this.fighter.triggerAttack('AIR_KICK');
                    }
                }, 150);
            } else if (roll < 0.55 && this.fighter.dashCooldown <= 0 && dist > 3.0) {
                this.fighter.triggerDash(dirToTarget);
            } else {
                this.currentAction = dirToTarget > 0 ? 'MOVE_RIGHT' : 'MOVE_LEFT';
                this.actionTimer = 0.30;
            }
            return;
        }

        // 4. CLOSE RANGE (dist < 2.0 units) - COMBAT ENGAGEMENT!
        if (dist < 2.0) {
            this.currentAction = 'IDLE';
            const attackRoll = Math.random();

            if (attackRoll < this.aggression) {
                this.fighter.setBlock(false);

                if (Math.random() < this.comboTendency) {
                    const comboType = Math.floor(Math.random() * 3);
                    if (comboType === 0) {
                        this.fighter.triggerAttack('PUNCH_1');
                        this.comboQueue = ['PUNCH_2', 'PUNCH_3'];
                    } else if (comboType === 1) {
                        this.fighter.triggerAttack('KICK_1');
                        this.comboQueue = ['KICK_2', 'KICK_3'];
                    } else {
                        this.fighter.triggerAttack('PUNCH_1');
                        this.comboQueue = ['PUNCH_2', 'KICK_3'];
                    }
                } else {
                    const attacks = ['PUNCH_1', 'PUNCH_2', 'KICK_1', 'KICK_2'];
                    const picked = attacks[Math.floor(Math.random() * attacks.length)];
                    this.fighter.triggerAttack(picked);
                }
            } else {
                if (Math.random() < 0.45) {
                    this.fighter.setBlock(true);
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
