/**
 * Metronome timing engine
 * Uses high-precision scheduling with Web Audio API time
 */

export class Metronome {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.tempo = 80;
        this.beatsPerBar = 4;
        this.subdivision = 1; // divisions per beat

        this.isPlaying = false;
        this.originTime = 0;
        this.currentBeat = 0;
        this.lastBeatTime = 0;
        this.nextBeatTime = 0;

        this.schedulerInterval = null;
        this.scheduleAheadTime = 0.1; // Schedule 100ms ahead
        this.lastScheduledBeat = -1;

        this.onBeat = null; // Callback for beat events
        this.onTick = null; // Callback for animation frame updates
    }

    get beatInterval() {
        return 60.0 / this.tempo;
    }

    get sweepDuration() {
        return this.beatInterval * this.beatsPerBar;
    }

    setTempo(bpm) {
        this.tempo = Math.max(20, Math.min(300, bpm));
    }

    setBeatsPerBar(beats) {
        this.beatsPerBar = beats;
    }

    setSubdivision(divisions) {
        this.subdivision = divisions;
    }

    async start() {
        await this.audio.init();

        this.isPlaying = true;
        this.originTime = this.audio.getCurrentTime() + 0.05; // Small delay for setup
        this.currentBeat = 0;
        this.lastScheduledBeat = -1;

        // Start the scheduler loop
        this.schedulerInterval = setInterval(() => this.scheduler(), 25);

        // Start animation loop
        this.animationLoop();
    }

    stop() {
        this.isPlaying = false;
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
    }

    scheduler() {
        if (!this.isPlaying) return;

        const currentTime = this.audio.getCurrentTime();
        const lookAhead = currentTime + this.scheduleAheadTime;

        // Schedule beats that fall within our look-ahead window
        let beatIndex = this.lastScheduledBeat + 1;
        let beatTime = this.beatTimeForIndex(beatIndex);

        while (beatTime < lookAhead) {
            // Schedule the click
            const isDownbeat = (beatIndex % this.beatsPerBar) === 0;
            this.audio.scheduleClick(beatTime, isDownbeat);

            // Fire beat callback
            if (this.onBeat) {
                // Use setTimeout to fire callback at approximately the right time
                const delay = Math.max(0, (beatTime - currentTime) * 1000);
                setTimeout(() => {
                    if (this.isPlaying) {
                        this.onBeat(beatIndex, isDownbeat);
                    }
                }, delay);
            }

            this.lastScheduledBeat = beatIndex;
            beatIndex++;
            beatTime = this.beatTimeForIndex(beatIndex);
        }
    }

    animationLoop() {
        if (!this.isPlaying) return;

        const currentTime = this.audio.getCurrentTime();
        this.updateBeatState(currentTime);

        if (this.onTick) {
            this.onTick({
                currentTime,
                sweepProgress: this.sweepProgress(currentTime),
                currentBeat: this.currentBeat,
                tempo: this.tempo,
                beatsPerBar: this.beatsPerBar,
                subdivision: this.subdivision,
                originTime: this.originTime
            });
        }

        requestAnimationFrame(() => this.animationLoop());
    }

    updateBeatState(currentTime) {
        // Calculate which beat we're currently on
        const elapsed = currentTime - this.originTime;
        if (elapsed < 0) {
            this.currentBeat = 0;
            this.lastBeatTime = this.originTime;
            this.nextBeatTime = this.originTime + this.beatInterval;
            return;
        }

        const beatFloat = elapsed / this.beatInterval;
        this.currentBeat = Math.floor(beatFloat);
        this.lastBeatTime = this.beatTimeForIndex(this.currentBeat);
        this.nextBeatTime = this.beatTimeForIndex(this.currentBeat + 1);
    }

    beatTimeForIndex(index) {
        // Clicks fire at originTime + (n + 0.5) * beatInterval
        // This offsets by half a beat so the playhead starts at left edge
        // and the click sounds when it crosses center
        return this.originTime + (index + 0.5) * this.beatInterval;
    }

    /**
     * Get playhead sweep progress (0.0 to 1.0) within current bar
     */
    sweepProgress(currentTime) {
        const elapsed = currentTime - this.originTime;
        if (elapsed < 0) return 0;

        const sweepElapsed = elapsed % this.sweepDuration;
        return sweepElapsed / this.sweepDuration;
    }

    /**
     * Find the nearest beat/grid time to a given timestamp
     */
    nearestGridTime(timestamp, swingPercent = 0) {
        // Grid is offset by half a beat (clicks at originTime + (n + 0.5) * beatInterval)
        const gridOrigin = this.originTime + this.beatInterval * 0.5;
        const elapsed = timestamp - gridOrigin;
        const gridInterval = this.beatInterval / this.subdivision;

        // Calculate grid index
        let gridIndex = Math.round(elapsed / gridInterval);

        // Apply swing offset for even subdivisions on odd indices
        let gridTime = gridOrigin + gridIndex * gridInterval;

        if (swingPercent > 0 && this.subdivision === 2) {
            // Swing applies to eighth notes (subdivision = 2)
            // Odd-indexed grid points shift forward
            if (gridIndex % 2 === 1) {
                const swingOffset = (this.beatInterval / 2) * (swingPercent / 100);
                gridTime += swingOffset;
            }
        }

        return gridTime;
    }

    /**
     * Get timing offset from nearest grid point (negative = early, positive = late)
     */
    timingOffset(timestamp, swingPercent = 0) {
        const nearestGrid = this.nearestGridTime(timestamp, swingPercent);
        return timestamp - nearestGrid;
    }

    /**
     * Get all grid times within a time window (for visualization)
     */
    getGridTimes(startTime, endTime) {
        const gridInterval = this.beatInterval / this.subdivision;
        const times = [];

        // Find first grid point after startTime
        const elapsed = startTime - this.originTime;
        let gridIndex = Math.ceil(elapsed / gridInterval);
        let gridTime = this.originTime + gridIndex * gridInterval;

        while (gridTime <= endTime) {
            const beatIndex = Math.floor((gridTime - this.originTime) / this.beatInterval);
            const isDownbeat = beatIndex % this.beatsPerBar === 0;
            const isOnBeat = Math.abs((gridTime - this.originTime) % this.beatInterval) < 0.001;

            times.push({
                time: gridTime,
                isDownbeat,
                isOnBeat,
                gridIndex
            });

            gridIndex++;
            gridTime = this.originTime + gridIndex * gridInterval;
        }

        return times;
    }
}
