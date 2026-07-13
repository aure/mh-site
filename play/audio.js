/**
 * Audio module - Web Audio API click sound generation
 */

export class AudioEngine {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.volume = 0.7;
        this.soundType = 'click';
    }

    async init() {
        if (this.context) return;

        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.setVolume(this.volume);

        // Resume context on user interaction (required by browsers)
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    setVolume(value) {
        this.volume = value;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(value, this.context.currentTime);
        }
    }

    setSoundType(type) {
        this.soundType = type;
    }

    /**
     * Schedule a click at the given audio context time
     */
    scheduleClick(time, isDownbeat = false) {
        if (!this.context) return;

        const velocity = isDownbeat ? 1.0 : 0.6;

        switch (this.soundType) {
            case 'click':
                this.playClick(time, velocity);
                break;
            case 'woodblock':
                this.playWoodblock(time, velocity);
                break;
            case 'hihat':
                this.playHihat(time, velocity);
                break;
            case 'cowbell':
                this.playCowbell(time, velocity);
                break;
            case 'claves':
                this.playClaves(time, velocity);
                break;
            default:
                this.playClick(time, velocity);
        }
    }

    playClick(time, velocity) {
        // Sharp click using short noise burst
        const duration = 0.02;
        const gain = this.context.createGain();
        gain.connect(this.masterGain);

        // Use oscillator for click
        const osc = this.context.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, time);
        osc.frequency.exponentialRampToValueAtTime(200, time + duration);

        gain.gain.setValueAtTime(velocity * 0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        osc.start(time);
        osc.stop(time + duration);
    }

    playWoodblock(time, velocity) {
        const duration = 0.08;
        const gain = this.context.createGain();
        gain.connect(this.masterGain);

        const osc = this.context.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, time);
        osc.frequency.exponentialRampToValueAtTime(400, time + duration);

        gain.gain.setValueAtTime(velocity * 0.6, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        osc.start(time);
        osc.stop(time + duration);
    }

    playHihat(time, velocity) {
        const duration = 0.05;

        // Use noise for hi-hat
        const bufferSize = this.context.sampleRate * duration;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        // High-pass filter for hi-hat character
        const filter = this.context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(velocity * 0.4, time);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(time);
    }

    playCowbell(time, velocity) {
        const duration = 0.15;
        const gain = this.context.createGain();
        gain.connect(this.masterGain);

        // Two detuned oscillators for cowbell character
        const osc1 = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        osc1.type = 'square';
        osc2.type = 'square';
        osc1.frequency.value = 560;
        osc2.frequency.value = 845;

        const oscGain1 = this.context.createGain();
        const oscGain2 = this.context.createGain();
        oscGain1.gain.value = 0.5;
        oscGain2.gain.value = 0.5;

        gain.gain.setValueAtTime(velocity * 0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc1.connect(oscGain1);
        osc2.connect(oscGain2);
        oscGain1.connect(gain);
        oscGain2.connect(gain);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
    }

    playClaves(time, velocity) {
        const duration = 0.03;
        const gain = this.context.createGain();
        gain.connect(this.masterGain);

        const osc = this.context.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2500, time);
        osc.frequency.exponentialRampToValueAtTime(1500, time + duration);

        gain.gain.setValueAtTime(velocity * 0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        osc.start(time);
        osc.stop(time + duration);
    }

    /**
     * Play a tap sound for user hits
     */
    playTapSound(rating) {
        if (!this.context) return;

        const time = this.context.currentTime;
        const duration = 0.1;
        const gain = this.context.createGain();
        gain.connect(this.masterGain);

        const osc = this.context.createOscillator();
        osc.type = 'sine';

        // Pitch based on rating
        const pitches = {
            perfect: 880,
            okayEarly: 660,
            okayLate: 660,
            early: 440,
            late: 440,
            veryEarly: 330,
            veryLate: 330
        };

        osc.frequency.value = pitches[rating] || 440;
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        osc.start(time);
        osc.stop(time + duration);
    }

    getCurrentTime() {
        return this.context ? this.context.currentTime : 0;
    }
}
