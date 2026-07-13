/**
 * Metronome Hero Web - Main Application
 */

import { AudioEngine } from './audio.js';
import { Metronome } from './metronome.js';
import { ScoringService, DIFFICULTIES } from './scoring.js';
import { InputManager } from './input.js';
import { VisualizationManager } from './visualizations.js';

class MetronomeHeroApp {
    constructor() {
        this.audio = new AudioEngine();
        this.metronome = new Metronome(this.audio);
        this.scoring = new ScoringService();
        this.input = new InputManager();
        this.viz = null;

        this.isPlaying = false;

        this.init();
    }

    init() {
        // Initialize visualization
        const canvas = document.getElementById('viz-canvas');
        this.viz = new VisualizationManager(canvas);

        // Set up callbacks
        this.metronome.onTick = (state) => this.onTick(state);
        this.metronome.onBeat = (beatIndex, isDownbeat) => this.onBeat(beatIndex, isDownbeat);

        this.input.onTap = (timestamp, source) => this.onTap(timestamp, source);

        this.scoring.onHitScored = (hit) => this.onHitScored(hit);
        this.scoring.onStreakBroken = (streak) => this.onStreakBroken(streak);
        this.scoring.onLevelUp = (streak) => this.onLevelUp(streak);

        // Bind UI controls
        this.bindControls();

        // Start render loop (even when not playing)
        this.renderLoop();

        // Load saved settings
        this.loadSettings();

        // Ensure difficulty display is set
        this.updateDifficultyDisplay();
    }

    bindControls() {
        // Play/Stop button
        const playBtn = document.getElementById('play-btn');
        playBtn.addEventListener('click', () => this.togglePlay());

        // Tempo controls
        document.getElementById('tempo-up').addEventListener('click', () => {
            this.setTempo(this.metronome.tempo + 5);
        });
        document.getElementById('tempo-down').addEventListener('click', () => {
            this.setTempo(this.metronome.tempo - 5);
        });

        // Settings
        document.getElementById('viz-select').addEventListener('change', (e) => {
            this.viz.setType(e.target.value);
            this.saveSettings();
        });

        document.getElementById('difficulty-select').addEventListener('change', (e) => {
            this.scoring.setDifficulty(e.target.value);
            this.updateDifficultyDisplay();
            this.saveSettings();
        });

        document.getElementById('subdivision-select').addEventListener('change', (e) => {
            const sub = parseInt(e.target.value);
            this.metronome.setSubdivision(sub);
            this.scoring.setSubdivision(sub);
            this.viz.subdivision = sub;
            this.updateDifficultyDisplay();
            this.saveSettings();
        });

        document.getElementById('timesig-select').addEventListener('change', (e) => {
            this.metronome.setBeatsPerBar(parseInt(e.target.value));
            this.saveSettings();
        });

        document.getElementById('sound-select').addEventListener('change', (e) => {
            this.audio.setSoundType(e.target.value);
            this.saveSettings();
        });

        document.getElementById('volume-slider').addEventListener('input', (e) => {
            this.audio.setVolume(e.target.value / 100);
            this.saveSettings();
        });

        // Input toggles
        document.getElementById('input-keyboard').addEventListener('change', (e) => {
            this.input.setKeyboardEnabled(e.target.checked);
        });

        document.getElementById('input-mouse').addEventListener('change', (e) => {
            this.input.setMouseEnabled(e.target.checked);
        });

        // Keyboard shortcuts for tempo
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.setTempo(this.metronome.tempo + 1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.setTempo(this.metronome.tempo - 1);
            } else if (e.key === 'Escape') {
                if (this.isPlaying) this.stop();
            }
        });
    }

    async togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            await this.audio.init();
            this.scoring.reset();
            this.metronome.start();
            this.isPlaying = true;

            document.getElementById('play-btn').classList.add('playing');
            this.updateStats();
        } catch (err) {
            console.error('Failed to start:', err);
            alert('Failed to start audio. Please interact with the page first.');
        }
    }

    stop() {
        this.metronome.stop();
        this.isPlaying = false;
        document.getElementById('play-btn').classList.remove('playing');
    }

    setTempo(bpm) {
        bpm = Math.max(20, Math.min(300, bpm));
        this.metronome.setTempo(bpm);
        this.scoring.setTempo(bpm);
        document.getElementById('tempo-value').textContent = bpm;
        this.updateDifficultyDisplay(); // Update timing zones for new tempo
        this.saveSettings();
    }

    onTick(state) {
        this.viz.update(state);
    }

    onBeat(beatIndex, isDownbeat) {
        // Visual feedback could go here
    }

    onTap(timestamp, source) {
        if (!this.isPlaying) return;

        // Use audio context time for consistent timing with metronome
        const audioTime = this.audio.getCurrentTime();
        const nearestGrid = this.metronome.nearestGridTime(audioTime);
        const sweepProgress = this.metronome.sweepProgress(audioTime);

        const hit = this.scoring.scoreHit(audioTime, nearestGrid, sweepProgress);

        // Add hit to visualization immediately for visual feedback
        this.viz.addHit(hit);

        // Play tap sound
        this.audio.playTapSound(hit.rating);

        // Update stats immediately
        this.updateStats();
    }

    onHitScored(hit) {
        // Add to visualization
        this.viz.addHit(hit);

        // Update stats display
        this.updateStats();
    }

    onStreakBroken(streak) {
        // Could add visual feedback
    }

    onLevelUp(streak) {
        // Web version: no-op. Dynamic tempo adjustment is app-only.
    }

    updateStats() {
        document.getElementById('streak-value').textContent = this.scoring.streak;

        const accuracy = this.scoring.accuracy;
        document.getElementById('accuracy-value').textContent =
            accuracy !== null ? Math.round(accuracy) + '%' : '--%';
    }

    updateDifficultyDisplay() {
        const diff = DIFFICULTIES[this.scoring.difficultyName];
        const minNote = 60 / this.metronome.tempo / this.metronome.subdivision;
        this.viz.setDifficulty(diff, minNote);
    }

    renderLoop() {
        this.viz.render();
        requestAnimationFrame(() => this.renderLoop());
    }

    saveSettings() {
        const settings = {
            tempo: this.metronome.tempo,
            beatsPerBar: this.metronome.beatsPerBar,
            subdivision: this.metronome.subdivision,
            difficulty: this.scoring.difficultyName,
            soundType: this.audio.soundType,
            volume: this.audio.volume,
            vizType: this.viz.type
        };
        localStorage.setItem('metronomehero_settings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('metronomehero_settings');
            if (!saved) return;

            const settings = JSON.parse(saved);

            if (settings.tempo) {
                this.setTempo(settings.tempo);
            }
            if (settings.beatsPerBar) {
                this.metronome.setBeatsPerBar(settings.beatsPerBar);
                document.getElementById('timesig-select').value = settings.beatsPerBar;
            }
            if (settings.subdivision) {
                this.metronome.setSubdivision(settings.subdivision);
                this.scoring.setSubdivision(settings.subdivision);
                document.getElementById('subdivision-select').value = settings.subdivision;
            }
            if (settings.difficulty) {
                this.scoring.setDifficulty(settings.difficulty);
                document.getElementById('difficulty-select').value = settings.difficulty;
            }
            if (settings.soundType) {
                this.audio.setSoundType(settings.soundType);
                document.getElementById('sound-select').value = settings.soundType;
            }
            if (settings.volume !== undefined) {
                this.audio.setVolume(settings.volume);
                document.getElementById('volume-slider').value = settings.volume * 100;
            }
            if (settings.vizType) {
                this.viz.setType(settings.vizType);
                document.getElementById('viz-select').value = settings.vizType;
            }

            this.updateDifficultyDisplay();
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MetronomeHeroApp();
});
