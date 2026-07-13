/**
 * Scoring module - Hit detection and accuracy tracking
 */

// Difficulty settings with timing windows as fractions of minNoteLength
export const DIFFICULTIES = {
    beginner: {
        perfectEarly: 0.25,
        perfectLate: 0.50,
        goodEarly: 0.80,
        goodLate: 0.80,
        accuracyWindow: 16,
        accuracyUpThreshold: 0.50,
        accuracyDownThreshold: 0.30
    },
    easy: {
        perfectEarly: 0.20,
        perfectLate: 0.40,
        goodEarly: 0.65,
        goodLate: 0.65,
        accuracyWindow: 12,
        accuracyUpThreshold: 0.60,
        accuracyDownThreshold: 0.35
    },
    moderate: {
        perfectEarly: 0.15,
        perfectLate: 0.30,
        goodEarly: 0.40,
        goodLate: 0.50,
        accuracyWindow: 10,
        accuracyUpThreshold: 0.70,
        accuracyDownThreshold: 0.40
    },
    hard: {
        perfectEarly: 0.10,
        perfectLate: 0.20,
        goodEarly: 0.25,
        goodLate: 0.35,
        accuracyWindow: 8,
        accuracyUpThreshold: 0.80,
        accuracyDownThreshold: 0.45
    },
    expert: {
        perfectEarly: 0.05,
        perfectLate: 0.10,
        goodEarly: 0.10,
        goodLate: 0.20,
        accuracyWindow: 8,
        accuracyUpThreshold: 0.90,
        accuracyDownThreshold: 0.50
    }
};

// Rating definitions
export const RATINGS = {
    perfect: { label: 'PERFECT', color: '#22c55e', score: 100, countsToStreak: true },
    okayEarly: { label: 'OK', color: '#eab308', score: 50, countsToStreak: true },
    okayLate: { label: 'OK', color: '#3b82f6', score: 50, countsToStreak: true },
    early: { label: 'EARLY', color: '#f97316', score: 10, countsToStreak: false },
    late: { label: 'LATE', color: '#6366f1', score: 10, countsToStreak: false },
    veryEarly: { label: 'RUSHING', color: '#ef4444', score: 0, countsToStreak: false },
    veryLate: { label: 'DRAGGING', color: '#a855f7', score: 0, countsToStreak: false }
};

export class ScoringService {
    constructor() {
        this.difficulty = DIFFICULTIES.moderate;
        this.difficultyName = 'moderate';
        this.tempo = 80;
        this.subdivision = 1;
        this.swingPercent = 0;

        this.streak = 0;
        this.bestStreak = 0;
        this.scoreBuffer = [];
        this.totalHits = 0;

        this.hits = []; // All recorded hits
        this.pendingHit = null;
        this.commitGracePeriod = 0.080; // 80ms

        this.onHitScored = null;
        this.onStreakBroken = null;
        this.onLevelUp = null;
    }

    setDifficulty(name) {
        this.difficultyName = name;
        this.difficulty = DIFFICULTIES[name] || DIFFICULTIES.moderate;
    }

    setTempo(bpm) {
        this.tempo = bpm;
    }

    setSubdivision(divisions) {
        this.subdivision = divisions;
    }

    get minNoteLength() {
        return 60.0 / this.tempo / this.subdivision;
    }

    reset() {
        this.streak = 0;
        this.bestStreak = 0;
        this.scoreBuffer = [];
        this.totalHits = 0;
        this.hits = [];
        this.pendingHit = null;
    }

    /**
     * Score a hit at the given timestamp relative to the nearest grid point
     */
    scoreHit(timestamp, nearestGridTime, playheadPosition) {
        const offset = timestamp - nearestGridTime;
        const rating = this.calculateRating(offset);

        const hit = {
            timestamp,
            gridTime: nearestGridTime,
            offset,
            rating,
            playheadPosition,
            ratingInfo: RATINGS[rating]
        };

        // Handle pending hit logic (grace period for better hits)
        if (this.pendingHit && Math.abs(hit.gridTime - this.pendingHit.gridTime) < 0.001) {
            // Same grid point - keep better hit
            if (hit.ratingInfo.score > this.pendingHit.ratingInfo.score) {
                this.pendingHit = hit;
            }
        } else {
            // Different grid point - commit pending and set new
            if (this.pendingHit) {
                this.commitHit(this.pendingHit);
            }
            this.pendingHit = hit;

            // Schedule commit after grace period
            setTimeout(() => {
                if (this.pendingHit === hit) {
                    this.commitHit(hit);
                    this.pendingHit = null;
                }
            }, this.commitGracePeriod * 1000);
        }

        return hit;
    }

    commitHit(hit) {
        this.hits.push(hit);
        this.totalHits++;

        // Update score buffer
        this.scoreBuffer.push(hit.ratingInfo.score);
        if (this.scoreBuffer.length > this.difficulty.accuracyWindow) {
            this.scoreBuffer.shift();
        }

        // Update streak
        if (hit.ratingInfo.countsToStreak) {
            this.streak++;
            if (this.streak > this.bestStreak) {
                this.bestStreak = this.streak;
            }

            // Check for level up (every 16 perfect/ok hits)
            if (this.streak > 0 && this.streak % 16 === 0) {
                if (this.onLevelUp) {
                    this.onLevelUp(this.streak);
                }
            }
        } else {
            if (this.streak > 0 && this.onStreakBroken) {
                this.onStreakBroken(this.streak);
            }
            this.streak = 0;
        }

        if (this.onHitScored) {
            this.onHitScored(hit);
        }
    }

    calculateRating(offset) {
        const d = this.difficulty;
        const minNote = this.minNoteLength;

        if (offset < 0) {
            // Early hit
            const absOffset = -offset;
            const perfectZone = d.perfectEarly * minNote;

            if (absOffset <= perfectZone * 0.5) return 'perfect';
            if (absOffset <= perfectZone) return 'okayEarly';
            if (absOffset <= d.goodEarly * minNote) return 'early';
            return 'veryEarly';
        } else {
            // Late hit
            const perfectZone = d.perfectLate * minNote;

            if (offset <= perfectZone * 0.5) return 'perfect';
            if (offset <= perfectZone) return 'okayLate';
            if (offset <= d.goodLate * minNote) return 'late';
            return 'veryLate';
        }
    }

    get accuracy() {
        if (this.scoreBuffer.length === 0) return null;
        const sum = this.scoreBuffer.reduce((a, b) => a + b, 0);
        return sum / this.scoreBuffer.length;
    }

    /**
     * Get recent hits for visualization (within last N seconds)
     */
    getRecentHits(windowSeconds = 5) {
        const now = performance.now() / 1000;
        return this.hits.filter(h => (now - h.timestamp) < windowSeconds);
    }

    /**
     * Get zone edges for visualization (as fractions of minNoteLength)
     */
    getZoneEdges() {
        const d = this.difficulty;
        return {
            perfectEarly: d.perfectEarly,
            okayEarly: d.perfectEarly * 2,
            goodEarly: d.goodEarly * 2,
            perfectLate: d.perfectLate,
            okayLate: d.perfectLate * 2,
            goodLate: d.goodLate * 2
        };
    }
}
