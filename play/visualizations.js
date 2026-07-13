/**
 * Visualizations module - Canvas-based metronome visualizations
 * Ported from Swift iOS implementations
 */

import { RATINGS } from './scoring.js';

// Zone colors matching iOS app
const COLORS = {
    perfect: '#22c55e',
    okayEarly: '#eab308',
    okayLate: '#3b82f6',
    early: '#f97316',
    late: '#6366f1',
    veryEarly: '#ef4444',
    veryLate: '#a855f7',
    accent: '#4a9eff'
};

export class VisualizationManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.type = 'playhead';

        this.hits = [];
        this.maxHitAge = 20; // Keep hits for up to 20 seconds

        // Metronome state
        this.originTime = 0;
        this.sweepProgress = 0;
        this.currentBeat = 0;
        this.tempo = 80;
        this.beatsPerBar = 4;
        this.subdivision = 1;
        this.beatInterval = 0.75;
        this.audioTime = 0; // Current audio context time

        // Difficulty zones
        this.difficulty = null;
        this.minNoteLength = 0.5;

        // Animation constants
        this.hitLandingDuration = 0.3;
        this.hitLandingScale = 4.0;
        this.wiperFadeFraction = 0.08;

        // History view settings
        this.historyBeats = 8;
        this.lookaheadBeats = 1;

        // Resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    setType(type) {
        this.type = type;
    }

    setDifficulty(difficulty, minNoteLength) {
        this.difficulty = difficulty;
        this.minNoteLength = minNoteLength;
    }

    addHit(hit) {
        this.hits.push({
            ...hit,
            audioTime: hit.timestamp, // Store the audio context time for positioning
            scale: this.hitLandingScale,
            opacity: 1
        });
    }

    update(state) {
        this.sweepProgress = state.sweepProgress;
        this.currentBeat = state.currentBeat;
        this.tempo = state.tempo;
        this.beatsPerBar = state.beatsPerBar;
        this.beatInterval = 60 / state.tempo;
        this.originTime = state.originTime || this.originTime;
        this.audioTime = state.currentTime || this.audioTime;
        if (state.subdivision) this.subdivision = state.subdivision;

        const now = this.audioTime;

        // Clean up old hits and update animations
        this.hits = this.hits.filter(hit => {
            const age = now - hit.audioTime;
            if (age > this.maxHitAge) return false;

            // Landing animation (scale from 4 to 1 over 0.3s)
            hit.scale = Math.max(1, this.hitLandingScale - (age / this.hitLandingDuration) * (this.hitLandingScale - 1));

            return true;
        });
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        switch (this.type) {
            case 'playhead':
                this.renderPlayhead();
                break;
            case 'scrolling':
                this.renderScrolling();
                break;
            case 'tubular':
                this.renderTubular();
                break;
            case 'highway':
                this.renderHighway();
                break;
            default:
                this.renderPlayhead();
        }
    }

    // === PLAYHEAD VIEW ===
    // Sweep-based: playhead moves left-to-right, hits persist across sweeps
    renderPlayhead() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const midY = h / 2;
        const now = this.audioTime;

        const sweepDuration = this.beatInterval * this.beatsPerBar;
        const maxOffset = Math.max(0.01, this.minNoteLength * 0.5);

        // Label strip on right edge
        const labelStripWidth = 24;
        const roadW = w - labelStripWidth;
        const playheadX = this.sweepProgress * roadW;

        // Draw zone backgrounds
        this.drawZoneLanes(ctx, roadW, h, midY, maxOffset, playheadX);

        // Draw grid lines
        this.drawPlayheadGrid(ctx, roadW, h);

        // Draw hits with wiper fade
        const currentSweep = Math.floor((now - this.originTime) / sweepDuration);

        for (const hit of this.hits) {
            const hitSweep = Math.floor((hit.audioTime - this.originTime) / sweepDuration);
            const sweepAge = currentSweep - hitSweep;

            // Only show hits from current and previous sweep
            if (sweepAge >= 2) continue;

            // Calculate wiper fade for previous sweep hits
            let wiperFade = 1.0;
            if (sweepAge >= 1) {
                const distance = hit.playheadPosition - this.sweepProgress;
                if (distance < 0) continue;
                if (distance < this.wiperFadeFraction) {
                    wiperFade = distance / this.wiperFadeFraction;
                }
            }

            const hitX = hit.playheadPosition * roadW;
            const normalizedOffset = Math.max(-1, Math.min(1, hit.offset / maxOffset));
            const y = midY + normalizedOffset * midY * 0.9;

            const age = now - hit.audioTime;
            const landing = 1 + Math.max(0, 1 - age / this.hitLandingDuration) * (this.hitLandingScale - 1);
            const barHeight = 8 * landing * wiperFade;
            const barWidth = Math.max(6, 20 * landing);

            this.drawHitBar(ctx, hitX, y, barWidth, barHeight, hit.ratingInfo?.color || COLORS.perfect, wiperFade);
        }

        // Draw playhead line
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, h);
        ctx.stroke();

        // Draw zone labels
        this.drawZoneLabels(ctx, roadW, labelStripWidth, h, midY, maxOffset);
    }

    // === SCROLLING HISTORY VIEW ===
    // Time-based: most recent at right, scrolling left
    renderScrolling() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const midY = h / 2;
        const now = this.audioTime;

        const window = this.beatInterval * this.historyBeats;
        const lookahead = this.beatInterval * this.lookaheadBeats;
        const totalWindow = window + lookahead;
        const windowStart = now - window;
        const maxOffset = Math.max(0.01, this.minNoteLength * 0.5);

        // Label strip
        const labelStripWidth = 24;
        const roadW = w - labelStripWidth;
        const nowX = (window / totalWindow) * roadW;

        // Draw zone backgrounds
        this.drawZoneLanes(ctx, roadW, h, midY, maxOffset, nowX);

        // Draw scrolling grid lines
        this.drawScrollingGrid(ctx, roadW, h, now, windowStart, totalWindow);

        // Draw "Now" line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nowX, 0);
        ctx.lineTo(nowX, h);
        ctx.stroke();

        // Draw hits scrolling left
        for (const hit of this.hits) {
            if (hit.audioTime > now) continue;
            if (hit.audioTime < windowStart) continue;

            const x = ((hit.audioTime - windowStart) / totalWindow) * roadW;
            const normalizedOffset = Math.max(-1, Math.min(1, hit.offset / maxOffset));
            const y = midY + normalizedOffset * midY * 0.9;

            const age = now - hit.audioTime;
            const landing = 1 + Math.max(0, 1 - age / this.hitLandingDuration) * (this.hitLandingScale - 1);
            const barHeight = 8 * landing;
            const barWidth = Math.max(6, 20 * landing);

            this.drawHitBar(ctx, x, y, barWidth, barHeight, hit.ratingInfo?.color || COLORS.perfect, 1);
        }

        // Draw zone labels
        this.drawZoneLabels(ctx, roadW, labelStripWidth, h, midY, maxOffset);
    }

    // === TUBULAR (POLAR) VIEW ===
    // Radius = time (outer = now), Angle = timing offset
    renderTubular() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const centerX = w / 2;
        const centerY = h / 2;
        const now = this.audioTime;

        const side = Math.min(w, h);
        const outerRadius = side / 2 - 10;
        const innerRadius = outerRadius * 0.15;
        const radiusRange = outerRadius - innerRadius;

        const window = this.beatInterval * 4; // 4 beats of history
        const lookahead = this.beatInterval * 0.5;
        const totalWindow = window + lookahead;
        const windowStart = now - window;

        const maxOffset = Math.max(0.01, this.minNoteLength * 0.5);

        // Map timestamp to radius
        const timeToRadius = (t) => {
            const linear = Math.max(0, (t - windowStart) / totalWindow);
            const perspective = Math.pow(linear, 1.4);
            return innerRadius + perspective * radiusRange;
        };

        // Map timing offset to angle (north = perfect)
        const timingAngle = (offset) => {
            const clamped = Math.max(-maxOffset, Math.min(maxOffset, offset));
            return (clamped / maxOffset) * Math.PI - Math.PI / 2;
        };

        const point = (angle, radius) => ({
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        });

        const nowRadius = timeToRadius(now);

        // Draw zone wedges
        this.drawTubularZones(ctx, centerX, centerY, outerRadius, nowRadius, maxOffset);

        // Draw concentric grid circles (beat timestamps)
        this.drawTubularGrid(ctx, centerX, centerY, innerRadius, outerRadius, now, windowStart, totalWindow, timeToRadius);

        // Draw "Now" circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, nowRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw hits as arc segments scrolling inward
        const minBarLength = 8; // Fixed bar length for taps

        for (const hit of this.hits) {
            if (hit.audioTime > now) continue;
            if (hit.audioTime < windowStart) continue;

            const rOn = timeToRadius(hit.audioTime);
            if (rOn < innerRadius) continue;

            // Fixed short bar, not extending to now
            const rOuter = rOn;
            const rInner = Math.max(innerRadius, rOn - minBarLength);

            const angle = timingAngle(hit.offset);
            const age = now - hit.audioTime;
            const landing = 1 + Math.max(0, 1 - age / this.hitLandingDuration) * (this.hitLandingScale - 1);
            const halfAngle = (6 * landing) / outerRadius;

            ctx.fillStyle = hit.ratingInfo?.color || COLORS.perfect;
            ctx.beginPath();
            ctx.moveTo(point(angle - halfAngle, rOuter).x, point(angle - halfAngle, rOuter).y);
            ctx.lineTo(point(angle - halfAngle, rInner).x, point(angle - halfAngle, rInner).y);
            ctx.lineTo(point(angle + halfAngle, rInner).x, point(angle + halfAngle, rInner).y);
            ctx.lineTo(point(angle + halfAngle, rOuter).x, point(angle + halfAngle, rOuter).y);
            ctx.closePath();
            ctx.fill();
        }

        // Dark center overlay for depth effect
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius * 0.35);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    }

    // === NOTE HIGHWAY VIEW ===
    // Perspective: bottom = now, hits recede toward vanishing point at top
    renderHighway() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const centerX = w / 2;
        const now = this.audioTime;

        const perspectiveStrength = 5;
        const window = this.beatInterval * this.historyBeats;
        const lookahead = this.beatInterval * this.lookaheadBeats;
        const maxOffset = Math.max(0.01, this.minNoteLength * 0.5);

        const vanishingY = h * 0.03;
        const labelAreaHeight = 28;
        const fullBottomY = h - labelAreaHeight;
        const roadHalfWidth = w * 0.45;

        // "Now" position calculation (matching Swift)
        const pOneBeat = 1 / (1 + perspectiveStrength / this.historyBeats);
        const oneBeatFraction = 1 - pOneBeat;
        const nowY = vanishingY + (fullBottomY - vanishingY) / (1 + oneBeatFraction * this.lookaheadBeats);
        const nowRoadFrac = (nowY - vanishingY) / (fullBottomY - vanishingY);

        // Perspective function: t is 0 (now) to 1+ (oldest/top)
        // Returns y position and scale factor
        const perspective = (t) => {
            const p = 1 / (1 + t * perspectiveStrength);
            // When t=0, p=1, y=nowY; when t->inf, p->0, y->vanishingY
            const y = vanishingY + (nowY - vanishingY) * p;
            return { y, scale: p };
        };

        // Draw zone triangles converging at vanishing point
        this.drawHighwayZones(ctx, centerX, vanishingY, fullBottomY, roadHalfWidth, nowY, nowRoadFrac, maxOffset);

        // Draw road edge lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        for (const sign of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(centerX + sign * roadHalfWidth, fullBottomY);
            ctx.lineTo(centerX, vanishingY);
            ctx.stroke();
        }

        // Draw scrolling grid lines with perspective
        this.drawHighwayGrid(ctx, centerX, vanishingY, fullBottomY, roadHalfWidth, nowY, now, window, lookahead, perspectiveStrength, perspective);

        // Draw "Now" line
        const nowHalfW = roadHalfWidth * nowRoadFrac;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - nowHalfW, nowY);
        ctx.lineTo(centerX + nowHalfW, nowY);
        ctx.stroke();

        // Draw hits receding into distance
        const minHitDuration = 0.05; // Fixed short duration for taps (50ms)

        for (const hit of this.hits) {
            if (hit.audioTime > now) continue;

            const onAge = now - hit.audioTime;
            const tOn = onAge / window;
            if (tOn > 1.5) continue;

            // Fixed short bar duration, not extending to now
            const offAge = Math.max(0, onAge - minHitDuration);
            const tOff = offAge / window;

            const { y: yOn } = perspective(Math.max(0, tOn));
            const { y: yOff } = perspective(Math.max(0, tOff));

            // Road scale: how wide the road is at each y (0 at vanishing point, 1 at bottom)
            const roadScaleOn = Math.max(0, (yOn - vanishingY) / (fullBottomY - vanishingY));
            const roadScaleOff = Math.max(0, (yOff - vanishingY) / (fullBottomY - vanishingY));

            const normalizedOffset = Math.max(-1, Math.min(1, hit.offset / maxOffset));
            const xOn = centerX + normalizedOffset * roadHalfWidth * roadScaleOn;
            const xOff = centerX + normalizedOffset * roadHalfWidth * roadScaleOff;

            const age = now - hit.audioTime;
            const landing = 1 + Math.max(0, 1 - age / this.hitLandingDuration) * (this.hitLandingScale - 1);
            const halfWidthOn = Math.max(3, 6 * roadScaleOn * landing);
            const halfWidthOff = Math.max(3, 6 * roadScaleOff * landing);

            const avgScale = (roadScaleOn + roadScaleOff) / 2;
            const color = hit.ratingInfo?.color || COLORS.perfect;

            ctx.fillStyle = color;
            ctx.globalAlpha = Math.max(0.5, avgScale);
            ctx.beginPath();
            ctx.moveTo(xOff - halfWidthOff, yOff);
            ctx.lineTo(xOn - halfWidthOn, yOn);
            ctx.lineTo(xOn + halfWidthOn, yOn);
            ctx.lineTo(xOff + halfWidthOff, yOff);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Draw zone labels at bottom
        this.drawHighwayLabels(ctx, centerX, fullBottomY, labelAreaHeight, roadHalfWidth, maxOffset);
    }

    // === HELPER METHODS ===

    drawHitBar(ctx, x, y, width, height, color, opacity) {
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;

        // Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;

        // Draw rounded rectangle
        const radius = height / 2;
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
    }

    drawZoneLanes(ctx, roadW, h, midY, maxOffset, flashX) {
        if (!this.difficulty) return;

        const d = this.difficulty;

        // Define zones from top to bottom
        const zones = [
            { edge: 1.0, color: COLORS.veryEarly },
            { edge: d.goodEarly * 2, color: COLORS.early },
            { edge: d.perfectEarly * 2, color: COLORS.okayEarly },
            { edge: d.perfectEarly, color: COLORS.perfect },
            { edge: 0, center: true },
            { edge: d.perfectLate, color: COLORS.perfect },
            { edge: d.perfectLate * 2, color: COLORS.okayLate },
            { edge: d.goodLate * 2, color: COLORS.late },
            { edge: 1.0, color: COLORS.veryLate },
        ];

        // Draw zone backgrounds
        // Early zones (above center)
        ctx.fillStyle = COLORS.veryEarly + '1a';
        ctx.fillRect(0, 0, roadW, midY * (1 - d.goodEarly * 2));

        ctx.fillStyle = COLORS.early + '1a';
        ctx.fillRect(0, midY * (1 - d.goodEarly * 2), roadW, midY * (d.goodEarly * 2 - d.perfectEarly * 2));

        ctx.fillStyle = COLORS.okayEarly + '1a';
        ctx.fillRect(0, midY * (1 - d.perfectEarly * 2), roadW, midY * (d.perfectEarly * 2 - d.perfectEarly));

        ctx.fillStyle = COLORS.perfect + '33';
        ctx.fillRect(0, midY * (1 - d.perfectEarly), roadW, midY * (d.perfectEarly + d.perfectLate));

        ctx.fillStyle = COLORS.okayLate + '1a';
        ctx.fillRect(0, midY * (1 + d.perfectLate), roadW, midY * (d.perfectLate * 2 - d.perfectLate));

        ctx.fillStyle = COLORS.late + '1a';
        ctx.fillRect(0, midY * (1 + d.perfectLate * 2), roadW, midY * (d.goodLate * 2 - d.perfectLate * 2));

        ctx.fillStyle = COLORS.veryLate + '1a';
        ctx.fillRect(0, midY * (1 + d.goodLate * 2), roadW, h - midY * (1 + d.goodLate * 2));

        // Center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(roadW, midY);
        ctx.stroke();
    }

    drawZoneLabels(ctx, roadW, labelWidth, h, midY, maxOffset) {
        if (!this.difficulty) return;

        const d = this.difficulty;
        const stripX = roadW;

        const labels = [
            { y: midY * 0.15, text: 'RUSHING', color: COLORS.veryEarly },
            { y: midY * (1 - d.goodEarly), text: 'EARLY', color: COLORS.early },
            { y: midY * (1 - d.perfectEarly * 1.5), text: 'OK', color: COLORS.okayEarly },
            { y: midY, text: 'POCKET', color: COLORS.perfect },
            { y: midY * (1 + d.perfectLate * 1.5), text: 'OK', color: COLORS.okayLate },
            { y: midY * (1 + d.goodLate), text: 'LATE', color: COLORS.late },
            { y: h - midY * 0.15, text: 'DRAGGING', color: COLORS.veryLate },
        ];

        ctx.save();
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const label of labels) {
            ctx.fillStyle = label.color + '80';
            ctx.save();
            ctx.translate(stripX + labelWidth / 2, label.y);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(label.text, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }

    drawPlayheadGrid(ctx, roadW, h) {
        const totalDivisions = this.beatsPerBar * this.subdivision;

        for (let k = 0; k < totalDivisions; k++) {
            // Shift grid so k=0 maps to first beat center
            let frac = (k + this.subdivision * 0.5) / totalDivisions;
            if (frac >= 1) frac -= 1;

            const x = frac * roadW;
            const isBeat = k % this.subdivision === 0;

            ctx.strokeStyle = isBeat ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = isBeat ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }

    drawScrollingGrid(ctx, roadW, h, now, windowStart, totalWindow) {
        const gridOrigin = this.originTime + this.beatInterval * 0.5;
        const subInterval = this.beatInterval / this.subdivision;
        const firstIndex = Math.ceil((windowStart - gridOrigin) / subInterval);
        const lastIndex = Math.floor((now + this.beatInterval - gridOrigin) / subInterval);

        for (let i = firstIndex; i <= lastIndex; i++) {
            const lineTime = gridOrigin + i * subInterval;
            const x = ((lineTime - windowStart) / totalWindow) * roadW;

            if (x < 0 || x > roadW) continue;

            const isBeat = i % this.subdivision === 0;
            const isDownbeat = i % (this.subdivision * this.beatsPerBar) === 0;

            ctx.strokeStyle = isDownbeat ? 'rgba(255, 255, 255, 0.35)' : isBeat ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.07)';
            ctx.lineWidth = isDownbeat ? 2 : isBeat ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }

    drawTubularZones(ctx, centerX, centerY, outerRadius, nowRadius, maxOffset) {
        if (!this.difficulty) return;

        const d = this.difficulty;

        const slices = [
            { start: -1.0, end: -d.goodEarly * 2, color: COLORS.veryEarly },
            { start: -d.goodEarly * 2, end: -d.perfectEarly * 2, color: COLORS.early },
            { start: -d.perfectEarly * 2, end: -d.perfectEarly, color: COLORS.okayEarly },
            { start: -d.perfectEarly, end: d.perfectLate, color: COLORS.perfect },
            { start: d.perfectLate, end: d.perfectLate * 2, color: COLORS.okayLate },
            { start: d.perfectLate * 2, end: d.goodLate * 2, color: COLORS.late },
            { start: d.goodLate * 2, end: 1.0, color: COLORS.veryLate },
        ];

        for (const slice of slices) {
            const a1 = slice.start * Math.PI - Math.PI / 2;
            const a2 = slice.end * Math.PI - Math.PI / 2;

            ctx.fillStyle = slice.color + '1a';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, outerRadius, a1, a2);
            ctx.closePath();
            ctx.fill();
        }
    }

    drawTubularGrid(ctx, centerX, centerY, innerRadius, outerRadius, now, windowStart, totalWindow, timeToRadius) {
        const gridOrigin = this.originTime + this.beatInterval * 0.5;
        const subInterval = this.beatInterval / this.subdivision;
        const firstIndex = Math.ceil((windowStart - gridOrigin) / subInterval);
        const lastIndex = Math.floor((now + this.beatInterval * 0.5 - gridOrigin) / subInterval);

        for (let i = firstIndex; i <= lastIndex; i++) {
            const lineTime = gridOrigin + i * subInterval;
            const r = timeToRadius(lineTime);

            if (r < innerRadius || r > outerRadius) continue;

            const isBeat = i % this.subdivision === 0;
            const depth = (r - innerRadius) / (outerRadius - innerRadius);
            const fade = 0.15 + 0.85 * depth;

            ctx.strokeStyle = `rgba(255, 255, 255, ${(isBeat ? 0.2 : 0.1) * fade})`;
            ctx.lineWidth = (isBeat ? 1 : 0.5) * fade;
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    drawHighwayZones(ctx, centerX, vanishingY, fullBottomY, roadHalfWidth, nowY, nowRoadFrac, maxOffset) {
        if (!this.difficulty) return;

        const d = this.difficulty;

        const lanes = [
            { frac: -1.0, color: COLORS.veryEarly },
            { frac: -d.goodEarly * 2, color: COLORS.early },
            { frac: -d.perfectEarly * 2, color: COLORS.okayEarly },
            { frac: -d.perfectEarly, color: COLORS.perfect },
            { frac: d.perfectLate, color: COLORS.okayLate },
            { frac: d.perfectLate * 2, color: COLORS.late },
            { frac: d.goodLate * 2, color: COLORS.veryLate },
            { frac: 1.0, color: null },
        ];

        for (let i = 0; i < lanes.length - 1; i++) {
            const leftFrac = lanes[i].frac;
            const rightFrac = lanes[i + 1].frac;
            const color = lanes[i].color;

            ctx.fillStyle = color + '1a';
            ctx.beginPath();
            ctx.moveTo(centerX + leftFrac * roadHalfWidth, fullBottomY);
            ctx.lineTo(centerX, vanishingY);
            ctx.lineTo(centerX + rightFrac * roadHalfWidth, fullBottomY);
            ctx.closePath();
            ctx.fill();
        }
    }

    drawHighwayGrid(ctx, centerX, vanishingY, fullBottomY, roadHalfWidth, nowY, now, window, lookahead, perspectiveStrength, perspective) {
        const gridOrigin = this.originTime + this.beatInterval * 0.5;
        const subInterval = this.beatInterval / this.subdivision;
        const firstIndex = Math.ceil(((now - window) - gridOrigin) / subInterval);
        const lastIndex = Math.floor((now + lookahead - gridOrigin) / subInterval);

        for (let i = firstIndex; i <= lastIndex; i++) {
            const lineTime = gridOrigin + i * subInterval;
            const age = now - lineTime;
            const t = age / window;

            let y;
            if (t >= 0) {
                if (t > 1) continue;
                y = perspective(t).y;
            } else {
                // Future beats (lookahead)
                y = perspective(t).y;
                if (y > fullBottomY) y = fullBottomY;
            }

            const roadFraction = Math.max(0, (y - vanishingY) / (fullBottomY - vanishingY));
            const halfW = roadHalfWidth * roadFraction;

            const isBeat = i % this.subdivision === 0;
            const isDownbeat = i % (this.subdivision * this.beatsPerBar) === 0;

            ctx.strokeStyle = `rgba(255, 255, 255, ${(isDownbeat ? 0.35 : isBeat ? 0.18 : 0.12) * roadFraction})`;
            ctx.lineWidth = Math.max(0.5, (isDownbeat ? 2.5 : isBeat ? 1.5 : 1) * roadFraction);
            ctx.beginPath();
            ctx.moveTo(centerX - halfW, y);
            ctx.lineTo(centerX + halfW, y);
            ctx.stroke();
        }
    }

    drawHighwayLabels(ctx, centerX, fullBottomY, labelAreaHeight, roadHalfWidth, maxOffset) {
        if (!this.difficulty) return;

        const d = this.difficulty;

        const labels = [
            { frac: -0.85, text: 'RUSHING', color: COLORS.veryEarly },
            { frac: -(d.goodEarly + d.perfectEarly), text: 'EARLY', color: COLORS.early },
            { frac: -d.perfectEarly * 1.5, text: 'OK', color: COLORS.okayEarly },
            { frac: 0, text: 'POCKET', color: COLORS.perfect },
            { frac: d.perfectLate * 1.5, text: 'OK', color: COLORS.okayLate },
            { frac: (d.goodLate + d.perfectLate), text: 'LATE', color: COLORS.late },
            { frac: 0.85, text: 'DRAGGING', color: COLORS.veryLate },
        ];

        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const label of labels) {
            const x = centerX + label.frac * roadHalfWidth;
            const y = fullBottomY + labelAreaHeight / 2;
            ctx.fillStyle = label.color + '60';
            ctx.fillText(label.text, x, y);
        }
    }
}
