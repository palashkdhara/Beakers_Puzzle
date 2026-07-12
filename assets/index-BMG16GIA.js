//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/engine/State.ts
var DEFAULT_SETTINGS = {
	mute: false,
	reduceMotion: false,
	highContrast: false
};
var STORAGE_KEY = "dharas_beaker_challenge_state";
var StateManager = class {
	state;
	timerInterval = null;
	onStateChangeCallbacks = [];
	constructor() {
		this.state = this.loadState() || this.createInitialState();
		this.startTimer();
	}
	createInitialState() {
		return {
			amounts: [
				10,
				0,
				0
			],
			capacities: [
				10,
				4,
				3
			],
			goal: 5,
			currentLevel: 1,
			moves: 0,
			time: 0,
			isWon: false,
			history: [],
			redoHistory: [],
			settings: { ...DEFAULT_SETTINGS }
		};
	}
	subscribe(callback) {
		this.onStateChangeCallbacks.push(callback);
		callback();
	}
	notify() {
		this.onStateChangeCallbacks.forEach((cb) => cb());
	}
	getGameState() {
		return this.state;
	}
	setAmounts(newAmounts, recordMove = true) {
		if (this.state.isWon) return;
		if (recordMove) {
			this.state.history.push([...this.state.amounts]);
			this.state.redoHistory = [];
			this.state.moves += 1;
		}
		this.state.amounts = [...newAmounts];
		this.checkWinCondition();
		this.saveState();
		this.notify();
	}
	undo() {
		if (this.state.history.length === 0 || this.state.isWon) return false;
		const previousAmounts = this.state.history.pop();
		this.state.redoHistory.push([...this.state.amounts]);
		this.state.amounts = previousAmounts;
		this.state.moves = Math.max(0, this.state.moves - 1);
		this.checkWinCondition();
		this.saveState();
		this.notify();
		return true;
	}
	redo() {
		if (this.state.redoHistory.length === 0 || this.state.isWon) return false;
		const nextAmounts = this.state.redoHistory.pop();
		this.state.history.push([...this.state.amounts]);
		this.state.amounts = nextAmounts;
		this.state.moves += 1;
		this.checkWinCondition();
		this.saveState();
		this.notify();
		return true;
	}
	resetPuzzle() {
		this.state.history = [];
		this.state.redoHistory = [];
		this.state.amounts = new Array(this.state.capacities.length).fill(0);
		this.state.amounts[0] = this.state.capacities[0];
		this.state.moves = 0;
		this.state.time = 0;
		this.state.isWon = false;
		this.startTimer();
		this.saveState();
		this.notify();
	}
	restartEntireGame() {
		this.state.currentLevel = 1;
		this.state.capacities = [
			10,
			4,
			3
		];
		this.state.goal = 5;
		this.resetPuzzle();
	}
	startNextLevel(newCapacities, newGoal) {
		if (this.state.currentLevel >= 5) {
			this.restartEntireGame();
			return;
		}
		this.state.currentLevel += 1;
		this.state.capacities = [...newCapacities];
		this.state.goal = newGoal;
		this.state.amounts = new Array(newCapacities.length).fill(0);
		this.state.amounts[0] = newCapacities[0];
		this.state.moves = 0;
		this.state.time = 0;
		this.state.isWon = false;
		this.state.history = [];
		this.state.redoHistory = [];
		this.startTimer();
		this.saveState();
		this.notify();
	}
	checkWinCondition() {
		if (this.state.amounts.some((amount) => amount === this.state.goal) && !this.state.isWon) {
			this.state.isWon = true;
			this.stopTimer();
		}
	}
	toggleMute() {
		this.state.settings.mute = !this.state.settings.mute;
		this.saveState();
		this.notify();
	}
	toggleReduceMotion() {
		this.state.settings.reduceMotion = !this.state.settings.reduceMotion;
		this.saveState();
		this.notify();
	}
	toggleHighContrast() {
		this.state.settings.highContrast = !this.state.settings.highContrast;
		this.saveState();
		this.notify();
	}
	startTimer() {
		this.stopTimer();
		this.timerInterval = setInterval(() => {
			if (!this.state.isWon) {
				this.state.time += 1;
				this.notify();
			}
		}, 1e3);
	}
	stopTimer() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}
	saveState() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({
				amounts: this.state.amounts,
				capacities: this.state.capacities,
				goal: this.state.goal,
				currentLevel: this.state.currentLevel,
				moves: this.state.moves,
				time: this.state.time,
				isWon: this.state.isWon,
				history: this.state.history,
				redoHistory: this.state.redoHistory,
				settings: this.state.settings
			}));
		} catch (e) {
			console.error("Failed to save state to localStorage:", e);
		}
	}
	loadState() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (!stored) return null;
			const parsed = JSON.parse(stored);
			if (parsed.amounts && Array.isArray(parsed.amounts) && typeof parsed.moves === "number" && typeof parsed.time === "number" && typeof parsed.isWon === "boolean") return {
				amounts: parsed.amounts,
				capacities: parsed.capacities || [
					10,
					4,
					3
				],
				goal: typeof parsed.goal === "number" ? parsed.goal : 5,
				currentLevel: typeof parsed.currentLevel === "number" ? parsed.currentLevel : 1,
				moves: parsed.moves,
				time: parsed.time,
				isWon: parsed.isWon,
				history: parsed.history || [],
				redoHistory: parsed.redoHistory || [],
				settings: {
					...DEFAULT_SETTINGS,
					...parsed.settings
				}
			};
		} catch (e) {
			console.error("Failed to parse stored state:", e);
		}
		return null;
	}
	destroy() {
		this.stopTimer();
		this.onStateChangeCallbacks = [];
	}
};
//#endregion
//#region src/engine/SoundSynth.ts
var SoundSynth = class {
	ctx = null;
	isMuted = false;
	masterGain = null;
	windSource = null;
	windGain = null;
	windFilter = null;
	windLFO = null;
	pianoInterval = null;
	pourSource = null;
	pourGain = null;
	pourFilter = null;
	dragSource = null;
	dragGain = null;
	dragFilter = null;
	noiseBuffer = null;
	constructor() {}
	setMute(mute) {
		this.isMuted = mute;
		if (this.masterGain && this.ctx) {
			const targetVolume = mute ? 0 : 1;
			this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
			this.masterGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + .2);
		}
	}
	init() {
		if (this.ctx) return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			this.ctx = new AudioContextClass();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
			this.masterGain.connect(this.ctx.destination);
			this.createNoiseBuffer();
			this.startWindAmbience();
			this.startAmbientPiano();
		} catch (e) {
			console.error("Web Audio API not supported or blocked:", e);
		}
	}
	resumeContext() {
		if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
	}
	createNoiseBuffer() {
		if (!this.ctx) return;
		const bufferSize = 2 * this.ctx.sampleRate;
		const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
		const output = noiseBuffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
		this.noiseBuffer = noiseBuffer;
	}
	startWindAmbience() {
		if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;
		this.windSource = this.ctx.createBufferSource();
		this.windSource.buffer = this.noiseBuffer;
		this.windSource.loop = true;
		this.windFilter = this.ctx.createBiquadFilter();
		this.windFilter.type = "bandpass";
		this.windFilter.frequency.setValueAtTime(200, this.ctx.currentTime);
		this.windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);
		this.windGain = this.ctx.createGain();
		this.windGain.gain.setValueAtTime(.04, this.ctx.currentTime);
		this.windLFO = this.ctx.createOscillator();
		this.windLFO.type = "sine";
		this.windLFO.frequency.setValueAtTime(.05, this.ctx.currentTime);
		const lfoGain = this.ctx.createGain();
		lfoGain.gain.setValueAtTime(100, this.ctx.currentTime);
		this.windLFO.connect(lfoGain);
		lfoGain.connect(this.windFilter.frequency);
		this.windLFO.start();
		this.windSource.connect(this.windFilter);
		this.windFilter.connect(this.windGain);
		this.windGain.connect(this.masterGain);
		this.windSource.start();
	}
	startAmbientPiano() {
		if (this.pianoInterval) return;
		const playAmbientChord = () => {
			if (this.isMuted || !this.ctx) return;
			const chords = [
				[
					261.63,
					329.63,
					392,
					493.88
				],
				[
					293.66,
					349.23,
					440,
					523.25
				],
				[
					349.23,
					440,
					523.25,
					659.25
				],
				[
					392,
					493.88,
					587.33,
					698.46
				],
				[
					220,
					261.63,
					329.63,
					392
				]
			];
			chords[Math.floor(Math.random() * chords.length)].forEach((freq, idx) => {
				const noteDelay = idx * .15 + Math.random() * .1;
				this.playPianoNote(freq, noteDelay);
			});
		};
		const scheduleNext = () => {
			const delay = 12e3 + Math.random() * 6e3;
			this.pianoInterval = setTimeout(() => {
				playAmbientChord();
				scheduleNext();
			}, delay);
		};
		scheduleNext();
	}
	playPianoNote(freq, delaySec) {
		if (!this.ctx || !this.masterGain) return;
		const osc1 = this.ctx.createOscillator();
		const osc2 = this.ctx.createOscillator();
		const gainNode = this.ctx.createGain();
		const filter = this.ctx.createBiquadFilter();
		osc1.type = "triangle";
		osc1.frequency.setValueAtTime(freq, this.ctx.currentTime + delaySec);
		osc2.type = "sine";
		osc2.frequency.setValueAtTime(freq * .998, this.ctx.currentTime + delaySec);
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(1e3, this.ctx.currentTime + delaySec);
		filter.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + delaySec + 4);
		gainNode.gain.setValueAtTime(0, this.ctx.currentTime + delaySec);
		gainNode.gain.linearRampToValueAtTime(.04, this.ctx.currentTime + delaySec + .2);
		gainNode.gain.exponentialRampToValueAtTime(1e-4, this.ctx.currentTime + delaySec + 6);
		const delay = this.ctx.createDelay(1);
		delay.delayTime.setValueAtTime(.5, this.ctx.currentTime + delaySec);
		const delayGain = this.ctx.createGain();
		delayGain.gain.setValueAtTime(.3, this.ctx.currentTime + delaySec);
		osc1.connect(filter);
		osc2.connect(filter);
		filter.connect(gainNode);
		gainNode.connect(this.masterGain);
		gainNode.connect(delay);
		delay.connect(delayGain);
		delayGain.connect(delay);
		delayGain.connect(this.masterGain);
		osc1.start(this.ctx.currentTime + delaySec);
		osc2.start(this.ctx.currentTime + delaySec);
		osc1.stop(this.ctx.currentTime + delaySec + 7);
		osc2.stop(this.ctx.currentTime + delaySec + 7);
	}
	playLift() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.masterGain) return;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(120, this.ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + .15);
		gain.gain.setValueAtTime(0, this.ctx.currentTime);
		gain.gain.linearRampToValueAtTime(.06, this.ctx.currentTime + .03);
		gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + .2);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start();
		osc.stop(this.ctx.currentTime + .25);
	}
	playDrop() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.masterGain) return;
		const osc = this.ctx.createOscillator();
		const noise = this.ctx.createBufferSource();
		const noiseFilter = this.ctx.createBiquadFilter();
		const gain = this.ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(100, this.ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + .1);
		if (this.noiseBuffer) {
			noise.buffer = this.noiseBuffer;
			noiseFilter.type = "lowpass";
			noiseFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
			noise.connect(noiseFilter);
			noiseFilter.connect(gain);
			noise.start();
			noise.stop(this.ctx.currentTime + .15);
		}
		gain.gain.setValueAtTime(.12, this.ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + .15);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start();
		osc.stop(this.ctx.currentTime + .2);
	}
	startDrag() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.noiseBuffer || !this.masterGain || this.dragSource) return;
		this.dragSource = this.ctx.createBufferSource();
		this.dragSource.buffer = this.noiseBuffer;
		this.dragSource.loop = true;
		this.dragFilter = this.ctx.createBiquadFilter();
		this.dragFilter.type = "lowpass";
		this.dragFilter.frequency.setValueAtTime(150, this.ctx.currentTime);
		this.dragGain = this.ctx.createGain();
		this.dragGain.gain.setValueAtTime(0, this.ctx.currentTime);
		this.dragSource.connect(this.dragFilter);
		this.dragFilter.connect(this.dragGain);
		this.dragGain.connect(this.masterGain);
		this.dragSource.start();
	}
	updateDrag(speed) {
		if (!this.ctx || !this.dragGain || !this.dragFilter) return;
		const clampedSpeed = Math.min(speed, 15);
		const targetVolume = clampedSpeed / 15 * .05;
		const targetFreq = 100 + clampedSpeed / 15 * 120;
		this.dragGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, .05);
		this.dragFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, .05);
	}
	stopDrag() {
		if (!this.ctx || !this.dragGain || !this.dragSource) return;
		const currentSource = this.dragSource;
		const currentGain = this.dragGain;
		currentGain.gain.setValueAtTime(currentGain.gain.value, this.ctx.currentTime);
		currentGain.gain.exponentialRampToValueAtTime(1e-4, this.ctx.currentTime + .15);
		setTimeout(() => {
			try {
				currentSource.stop();
			} catch (e) {}
		}, 200);
		this.dragSource = null;
		this.dragGain = null;
		this.dragFilter = null;
	}
	startPour() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.noiseBuffer || !this.masterGain || this.pourSource) return;
		this.pourSource = this.ctx.createBufferSource();
		this.pourSource.buffer = this.noiseBuffer;
		this.pourSource.loop = true;
		this.pourFilter = this.ctx.createBiquadFilter();
		this.pourFilter.type = "bandpass";
		this.pourFilter.frequency.setValueAtTime(600, this.ctx.currentTime);
		this.pourFilter.Q.setValueAtTime(2, this.ctx.currentTime);
		this.pourGain = this.ctx.createGain();
		this.pourGain.gain.setValueAtTime(0, this.ctx.currentTime);
		this.pourSource.connect(this.pourFilter);
		this.pourFilter.connect(this.pourGain);
		this.pourGain.connect(this.masterGain);
		this.pourSource.start();
		this.pourGain.gain.linearRampToValueAtTime(.12, this.ctx.currentTime + .15);
	}
	/**
	* Updates pouring sound dynamic pitch shifting based on fill levels.
	*/
	updatePour(flowRate, targetFillPercent) {
		if (!this.ctx || !this.pourGain || !this.pourFilter) return;
		const targetFreq = 500 + targetFillPercent * 700;
		const targetVolume = Math.min(flowRate * .15, .15);
		this.pourFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, .1);
		this.pourGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, .1);
	}
	stopPour() {
		if (!this.ctx || !this.pourGain || !this.pourSource) return;
		const currentSource = this.pourSource;
		const currentGain = this.pourGain;
		currentGain.gain.setValueAtTime(currentGain.gain.value, this.ctx.currentTime);
		currentGain.gain.exponentialRampToValueAtTime(1e-4, this.ctx.currentTime + .25);
		setTimeout(() => {
			try {
				currentSource.stop();
			} catch (e) {}
		}, 300);
		this.pourSource = null;
		this.pourGain = null;
		this.pourFilter = null;
	}
	playChime() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.masterGain) return;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(880, this.ctx.currentTime);
		gain.gain.setValueAtTime(0, this.ctx.currentTime);
		gain.gain.linearRampToValueAtTime(.05, this.ctx.currentTime + .05);
		gain.gain.exponentialRampToValueAtTime(1e-4, this.ctx.currentTime + .6);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start();
		osc.stop(this.ctx.currentTime + .7);
	}
	playSuccess() {
		this.resumeContext();
		if (this.isMuted || !this.ctx || !this.masterGain) return;
		const context = this.ctx;
		const master = this.masterGain;
		[
			523.25,
			659.25,
			783.99,
			880,
			1046.5
		].forEach((freq, idx) => {
			const delay = idx * .08;
			const osc = context.createOscillator();
			const gain = context.createGain();
			const filter = context.createBiquadFilter();
			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, context.currentTime + delay);
			filter.type = "lowpass";
			filter.frequency.setValueAtTime(2e3, context.currentTime + delay);
			gain.gain.setValueAtTime(0, context.currentTime + delay);
			gain.gain.linearRampToValueAtTime(.05, context.currentTime + delay + .02);
			gain.gain.exponentialRampToValueAtTime(1e-4, context.currentTime + delay + 1.2);
			osc.connect(filter);
			filter.connect(gain);
			gain.connect(master);
			osc.start(context.currentTime + delay);
			osc.stop(context.currentTime + delay + 1.5);
		});
	}
	destroy() {
		if (this.pianoInterval) {
			clearTimeout(this.pianoInterval);
			this.pianoInterval = null;
		}
		if (this.windLFO) {
			try {
				this.windLFO.stop();
			} catch (e) {}
			this.windLFO = null;
		}
		if (this.windSource) {
			try {
				this.windSource.stop();
			} catch (e) {}
			this.windSource = null;
		}
		if (this.pourSource) {
			try {
				this.pourSource.stop();
			} catch (e) {}
			this.pourSource = null;
		}
		if (this.dragSource) {
			try {
				this.dragSource.stop();
			} catch (e) {}
			this.dragSource = null;
		}
		if (this.ctx) {
			this.ctx.close();
			this.ctx = null;
		}
	}
};
//#endregion
//#region src/engine/Physics.ts
var DRAG_SPEED = 15;
var RESTORE_SPEED = 12;
var ROTATION_SPEED = 8;
var BOUNCE_DAMP = .85;
var WOBBLE_DAMP = .92;
var PhysicsEngine = class {
	soundSynth;
	activeDragBucket = null;
	isPointerDown = false;
	constructor(soundSynth) {
		this.soundSynth = soundSynth;
	}
	/**
	* Performs hit-testing to see if the user clicked inside a bucket.
	* Checks a generous touch target area around the bucket.
	*/
	getBucketAtPoint(buckets, px, py) {
		for (let i = buckets.length - 1; i >= 0; i--) {
			const b = buckets[i];
			if (b.isPouring || b.pourTargetId !== null) continue;
			const halfW = b.width / 2 + 15;
			const halfH = b.height / 2 + 15;
			if (px >= b.x - halfW && px <= b.x + halfW && py >= b.y - halfH && py <= b.y + halfH) return b;
		}
		return null;
	}
	handlePointerDown(buckets, px, py) {
		this.isPointerDown = true;
		const bucket = this.getBucketAtPoint(buckets, px, py);
		if (bucket) {
			this.activeDragBucket = bucket;
			bucket.isDragged = true;
			bucket.dragOffsetX = bucket.x - px;
			bucket.dragOffsetY = bucket.y - py;
			bucket.onTable = false;
			bucket.scaleX = .92;
			bucket.scaleY = 1.08;
			this.soundSynth.playLift();
			this.soundSynth.startDrag();
			return true;
		}
		return false;
	}
	handlePointerMove(px, py, speed) {
		if (this.activeDragBucket && this.isPointerDown) {
			const targetX = px + this.activeDragBucket.dragOffsetX;
			const targetY = py + this.activeDragBucket.dragOffsetY;
			this.soundSynth.updateDrag(speed);
			this.activeDragBucket.startX = targetX;
			this.activeDragBucket.startY = targetY;
		}
	}
	handlePointerUp(buckets, onPourTrigger) {
		this.isPointerDown = false;
		this.soundSynth.stopDrag();
		if (!this.activeDragBucket) return;
		const source = this.activeDragBucket;
		source.isDragged = false;
		this.activeDragBucket = null;
		let poured = false;
		for (let i = 0; i < buckets.length; i++) {
			const dest = buckets[i];
			if (dest.id === source.id) continue;
			const dx = source.x - dest.x;
			const dy = source.y - (dest.y - dest.height / 2 - 50);
			if (Math.sqrt(dx * dx + dy * dy) < 150 && source.amount > 0 && dest.amount < dest.capacity) {
				const isLeft = source.x < dest.x;
				source.pourDirection = isLeft ? 1 : -1;
				const offset = dest.width * .55;
				source.startX = dest.x + (isLeft ? -offset : offset);
				source.startY = dest.y - dest.height * .75;
				source.isPouring = true;
				source.pourTargetId = dest.id;
				source.targetAngle = isLeft ? 1.3 : -1.3;
				onPourTrigger(source.id, dest.id);
				poured = true;
				break;
			}
		}
		if (!poured) {
			source.targetAngle = 0;
			source.pourTargetId = null;
			source.isPouring = false;
			source.scaleX = 1.08;
			source.scaleY = .92;
		}
	}
	/**
	* Main physics frame step
	*/
	update(buckets, dt, originalSlots) {
		const timeScale = Math.min(dt * 60, 2);
		buckets.forEach((bucket) => {
			const originalSlot = originalSlots[bucket.id];
			if (bucket.isDragged) {
				const prevX = bucket.x;
				const dx = bucket.startX - bucket.x;
				const dy = bucket.startY - bucket.y;
				bucket.velocity.x = dx * DRAG_SPEED;
				bucket.velocity.y = dy * DRAG_SPEED;
				bucket.x += bucket.velocity.x * dt;
				bucket.y += bucket.velocity.y * dt;
				const deltaX = bucket.x - prevX;
				bucket.targetAngle = Math.max(-.25, Math.min(.25, deltaX * .05));
			} else if (bucket.isPouring) {
				bucket.x += (bucket.startX - bucket.x) * RESTORE_SPEED * dt;
				bucket.y += (bucket.startY - bucket.y) * RESTORE_SPEED * dt;
			} else {
				const dx = originalSlot.x - bucket.x;
				const dy = originalSlot.y - bucket.y;
				bucket.velocity.x = dx * RESTORE_SPEED;
				bucket.velocity.y = dy * RESTORE_SPEED;
				const prevY = bucket.y;
				bucket.x += bucket.velocity.x * dt;
				bucket.y += bucket.velocity.y * dt;
				if (prevY < originalSlot.y && bucket.y >= originalSlot.y) {
					bucket.y = originalSlot.y;
					bucket.velocity.y = 0;
					if (!bucket.onTable) {
						bucket.onTable = true;
						this.soundSynth.playDrop();
						bucket.bounceVelocity = 4;
						bucket.scaleX = 1.12;
						bucket.scaleY = .88;
					}
				}
			}
			bucket.angle += (bucket.targetAngle - bucket.angle) * ROTATION_SPEED * dt;
			const wobbleForce = -(bucket.velocity.x * dt) * .005;
			const wobbleAccel = -.18 * bucket.wobbleAngle - WOBBLE_DAMP * bucket.wobbleVelocity + wobbleForce;
			bucket.wobbleVelocity += wobbleAccel * timeScale;
			bucket.wobbleAngle += bucket.wobbleVelocity * timeScale;
			const forceX = -.15 * (bucket.scaleX - 1);
			bucket.bounceOffset += forceX;
			bucket.scaleX += (1 - bucket.scaleX) * .12 * timeScale;
			bucket.scaleY += (1 - bucket.scaleY) * .12 * timeScale;
			if (bucket.onTable && Math.abs(bucket.bounceVelocity) > .01) {
				const bounceForce = -.25 * bucket.bounceOffset - BOUNCE_DAMP * bucket.bounceVelocity;
				bucket.bounceVelocity += bounceForce * timeScale;
				bucket.bounceOffset += bucket.bounceVelocity * timeScale;
				if (Math.abs(bucket.bounceVelocity) < .05) {
					bucket.bounceVelocity = 0;
					bucket.bounceOffset = 0;
				}
			}
		});
	}
};
//#endregion
//#region src/engine/WaterSim.ts
var SPRING_CONSTANT = .12;
var DAMPING = .06;
var SPREAD = .2;
var NUM_NODES = 12;
var WaterSim = class {
	waveNodes = /* @__PURE__ */ new Map();
	flowRate = 3;
	splashTimer = 0;
	constructor() {}
	initBucketNodes(bucketId) {
		const nodes = [];
		for (let i = 0; i < NUM_NODES; i++) nodes.push({
			y: 0,
			velocity: 0
		});
		this.waveNodes.set(bucketId, nodes);
	}
	getNodes(bucketId) {
		if (!this.waveNodes.has(bucketId)) this.initBucketNodes(bucketId);
		return this.waveNodes.get(bucketId);
	}
	/**
	* Applies a ripple force at a specific point on the bucket's water surface
	* @param bucketId Target bucket
	* @param index Point index (0 to NUM_NODES - 1)
	* @param force Force amount (negative is downward displacement/velocity)
	*/
	triggerRipple(bucketId, index, force) {
		const nodes = this.getNodes(bucketId);
		const clampedIndex = Math.max(0, Math.min(NUM_NODES - 1, index));
		nodes[clampedIndex].velocity += force;
	}
	/**
	* Triggers a slosh wave when a bucket is accelerated horizontally.
	*/
	triggerSlosh(bucketId, velocityX) {
		const nodes = this.getNodes(bucketId);
		const force = velocityX * .15;
		nodes[0].velocity += force;
		nodes[1].velocity += force * .5;
		nodes[NUM_NODES - 1].velocity -= force;
		nodes[NUM_NODES - 2].velocity -= force * .5;
	}
	/**
	* Main simulation frame step.
	* Updates spring-mass systems, handles active pouring transitions, and spawns water/ambient particles.
	*/
	update(buckets, waterParticles, ambientParticles, dt, onPourStep, onPourComplete, reduceMotion) {
		this.updateWaterSurfaces(buckets, dt, reduceMotion);
		this.updatePouringState(buckets, waterParticles, dt, onPourStep, onPourComplete);
		this.updateParticles(waterParticles, ambientParticles, dt);
	}
	/**
	* Updates the surface wave equation for all buckets
	*/
	updateWaterSurfaces(buckets, dt, reduceMotion) {
		const k = reduceMotion ? .3 : SPRING_CONSTANT;
		const d = reduceMotion ? .2 : DAMPING;
		const s = reduceMotion ? .05 : SPREAD;
		const timeScale = Math.min(dt * 60, 2);
		buckets.forEach((bucket) => {
			const nodes = this.getNodes(bucket.id);
			for (let i = 0; i < NUM_NODES; i++) {
				const node = nodes[i];
				const displacement = node.y;
				const force = -k * displacement - d * node.velocity;
				node.velocity += force * timeScale;
				node.y += node.velocity * timeScale;
			}
			const leftDeltas = new Array(NUM_NODES).fill(0);
			const rightDeltas = new Array(NUM_NODES).fill(0);
			for (let i = 0; i < NUM_NODES; i++) {
				if (i > 0) {
					leftDeltas[i] = s * (nodes[i].y - nodes[i - 1].y);
					nodes[i - 1].velocity += leftDeltas[i] * timeScale;
				}
				if (i < NUM_NODES - 1) {
					rightDeltas[i] = s * (nodes[i].y - nodes[i + 1].y);
					nodes[i + 1].velocity += rightDeltas[i] * timeScale;
				}
			}
			for (let i = 0; i < NUM_NODES; i++) {
				if (i > 0) nodes[i - 1].y += leftDeltas[i] * timeScale;
				if (i < NUM_NODES - 1) nodes[i + 1].y += rightDeltas[i] * timeScale;
			}
			if (!reduceMotion && Math.random() < .02) {
				const randIndex = Math.floor(Math.random() * NUM_NODES);
				nodes[randIndex].velocity += Math.random() * .4 - .2;
			}
		});
	}
	/**
	* Updates active pours, adjusts volumes, and spawns pouring stream elements
	*/
	updatePouringState(buckets, waterParticles, dt, onPourStep, onPourComplete) {
		this.splashTimer += dt;
		buckets.forEach((source) => {
			if (!source.isPouring || source.pourTargetId === null) return;
			const dest = buckets.find((b) => b.id === source.pourTargetId);
			if (!dest) return;
			const remainingSource = source.amount;
			const remainingDestSpace = dest.capacity - dest.amount;
			const maxTransfer = Math.min(remainingSource, remainingDestSpace);
			if (maxTransfer <= .001) {
				source.isPouring = false;
				source.pourTargetId = null;
				source.targetAngle = 0;
				onPourComplete(source.id, dest.id);
				return;
			}
			const transferStep = Math.min(this.flowRate * dt, maxTransfer);
			source.amount -= transferStep;
			dest.amount += transferStep;
			source.targetAmount = source.amount;
			dest.targetAmount = dest.amount;
			onPourStep(source.id, dest.id, transferStep);
			const lip = this.getBucketLipPoint(source);
			const targetWaterLevelPercent = dest.amount / dest.capacity;
			const targetWaterY = dest.y + dest.height / 2 - targetWaterLevelPercent * dest.height;
			const hitX = dest.x;
			const hitY = Math.min(targetWaterY, dest.y + dest.height / 2 - 10);
			this.spawnStreamParticles(lip.x, lip.y, hitX, hitY, transferStep, waterParticles);
			if (this.splashTimer > .05) {
				this.splashTimer = 0;
				const hitIndex = Math.floor(NUM_NODES / 2);
				const splashForce = -3.5 - Math.min(transferStep * 15, 6);
				this.triggerRipple(dest.id, hitIndex, splashForce);
				this.triggerRipple(dest.id, hitIndex - 1, splashForce * .5);
				this.triggerRipple(dest.id, 7, splashForce * .5);
				const splashCount = Math.floor(3 + Math.random() * 4);
				for (let k = 0; k < splashCount; k++) {
					const vx = (Math.random() * 4 - 2) * 50;
					const vy = -(100 + Math.random() * 150);
					waterParticles.push({
						x: hitX + (Math.random() * 10 - 5),
						y: hitY - 5,
						vx,
						vy,
						color: "#4FA9FF",
						size: 2 + Math.random() * 3,
						life: 0,
						maxLife: .4 + Math.random() * .3,
						opacity: .8
					});
				}
			}
		});
	}
	/**
	* Spawns flowing particles along a Bezier path from source lip to dest surface
	*/
	spawnStreamParticles(startX, startY, endX, endY, transferStep, waterParticles) {
		const particleCount = Math.floor(2 + transferStep * 120);
		const controlX = (startX + endX) / 2;
		const controlY = Math.min(startY, endY) - 50;
		for (let i = 0; i < particleCount; i++) {
			const t = Math.random();
			const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
			const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY;
			const dx = 2 * (1 - t) * (controlX - startX) + 2 * t * (endX - controlX);
			const dy = 2 * (1 - t) * (controlY - startY) + 2 * t * (endY - controlY);
			const len = Math.sqrt(dx * dx + dy * dy);
			const speed = 300 + Math.random() * 100;
			waterParticles.push({
				x: bx + (Math.random() * 6 - 3),
				y: by + (Math.random() * 6 - 3),
				vx: dx / len * speed + (Math.random() * 10 - 5),
				vy: dy / len * speed + (Math.random() * 10 - 5),
				color: "#4FA9FF",
				size: 3 + Math.random() * 4,
				life: 0,
				maxLife: .15,
				opacity: .9
			});
		}
	}
	/**
	* Computes the pouring lip point of a tilted bucket
	*/
	getBucketLipPoint(bucket) {
		const isPouringRight = bucket.pourDirection > 0;
		const halfWidth = bucket.width / 2;
		const halfHeight = bucket.height / 2;
		const localLipX = isPouringRight ? halfWidth : -halfWidth;
		const localLipY = -halfHeight;
		const cosA = Math.cos(bucket.angle);
		const sinA = Math.sin(bucket.angle);
		const rotatedLipX = localLipX * cosA - localLipY * sinA;
		const rotatedLipY = localLipX * sinA + localLipY * cosA;
		return {
			x: bucket.x + rotatedLipX,
			y: bucket.y + rotatedLipY
		};
	}
	/**
	* Updates all active particle physics
	*/
	updateParticles(waterParticles, ambientParticles, dt) {
		for (let i = waterParticles.length - 1; i >= 0; i--) {
			const p = waterParticles[i];
			p.life += dt;
			if (p.life >= p.maxLife) {
				waterParticles.splice(i, 1);
				continue;
			}
			p.vy += 650 * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.opacity = 1 - p.life / p.maxLife;
		}
		ambientParticles.forEach((p) => {
			p.offset += dt * p.frequency;
			const driftX = Math.sin(p.offset) * p.amplitude * dt;
			p.x += (p.vx + driftX) * dt;
			p.y += p.vy * dt;
			if (p.y < -10) {
				p.y = window.innerHeight + 10;
				p.x = Math.random() * window.innerWidth;
			}
			if (p.x < -10) p.x = window.innerWidth + 10;
			if (p.x > window.innerWidth + 10) p.x = -10;
		});
	}
};
//#endregion
//#region src/engine/Solver.ts
var Solver = class Solver {
	capacities;
	constructor(capacities = [
		10,
		4,
		3
	]) {
		this.capacities = capacities;
	}
	/**
	* Performs BFS to find the shortest sequence of pours to reach the target amount.
	* By default, searches for any bucket having exactly `targetAmount` (5L).
	*/
	solve(startAmounts, targetAmount = 5) {
		const queue = [];
		const visited = /* @__PURE__ */ new Set();
		const stateKey = (state) => state.join(",");
		queue.push({
			state: [...startAmounts],
			path: []
		});
		visited.add(stateKey(startAmounts));
		while (queue.length > 0) {
			const { state, path } = queue.shift();
			if (state.some((val) => val === targetAmount)) return path;
			for (let i = 0; i < this.capacities.length; i++) for (let j = 0; j < this.capacities.length; j++) {
				if (i === j) continue;
				const sourceAmount = state[i];
				const destSpace = this.capacities[j] - state[j];
				const amountToPour = Math.min(sourceAmount, destSpace);
				if (amountToPour > 0) {
					const nextState = [...state];
					nextState[i] -= amountToPour;
					nextState[j] += amountToPour;
					const key = stateKey(nextState);
					if (!visited.has(key)) {
						visited.add(key);
						const moveDescription = `Pour Bucket ${String.fromCharCode(65 + i)} (${this.capacities[i]}L) into Bucket ${String.fromCharCode(65 + j)} (${this.capacities[j]}L)`;
						const newMove = {
							from: i,
							to: j,
							description: moveDescription
						};
						queue.push({
							state: nextState,
							path: [...path, newMove]
						});
					}
				}
			}
		}
		return null;
	}
	/**
	* Generates a 3-level hint sequence based on the current state.
	*/
	getHint(currentAmounts, hintStage, targetAmount = 5) {
		const solution = this.solve(currentAmounts, targetAmount);
		if (!solution || solution.length === 0) return "The current state cannot be solved directly. Try resetting or undoing a few steps!";
		const nextMove = solution[0];
		const bucketName = (index) => {
			return `${this.capacities[index]}L Bucket`;
		};
		switch (hintStage) {
			case 1: return `Hint 1/3: Consider starting the sequence by using the ${bucketName(nextMove.from)} to fill or adjust another bucket.`;
			case 2: return `Hint 2/3: Try pouring water from the ${bucketName(nextMove.from)} into the ${bucketName(nextMove.to)}.`;
			default: return `Hint 3/3: Drag the ${bucketName(nextMove.from)} over the ${bucketName(nextMove.to)} and release to pour.`;
		}
	}
	/**
	* Generates a solvable, distinct beaker puzzle based on level
	*/
	static generatePuzzle(level) {
		if (level === 1) return {
			capacities: [
				10,
				4,
				3
			],
			goal: 5
		};
		const numBeakers = level <= 2 ? 3 : level <= 4 ? 4 : 5;
		const minMoves = 3 + level;
		const maxMoves = 6 + level;
		const maxCapMin = 8 + level;
		const maxCapMax = 12 + level;
		for (let attempt = 0; attempt < 300; attempt++) {
			const capA = Math.floor(maxCapMin + Math.random() * (maxCapMax - maxCapMin + 1));
			const otherCaps = [];
			const used = /* @__PURE__ */ new Set();
			used.add(capA);
			while (otherCaps.length < numBeakers - 1) {
				const cap = Math.floor(2 + Math.random() * (capA - 2));
				if (!used.has(cap) && cap > 1) {
					used.add(cap);
					otherCaps.push(cap);
				}
			}
			const capacities = [capA, ...otherCaps].sort((x, y) => y - x);
			const solver = new Solver(capacities);
			const goalCandidates = [];
			for (let g = 2; g < capA; g++) if (!capacities.includes(g)) goalCandidates.push(g);
			if (goalCandidates.length === 0) continue;
			const goal = goalCandidates[Math.floor(Math.random() * goalCandidates.length)];
			const startAmounts = new Array(numBeakers).fill(0);
			startAmounts[0] = capA;
			const path = solver.solve(startAmounts, goal);
			if (path && path.length >= minMoves && path.length <= maxMoves) return {
				capacities,
				goal
			};
		}
		if (level === 2) return {
			capacities: [
				9,
				5,
				4
			],
			goal: 6
		};
		if (level === 3) return {
			capacities: [
				12,
				7,
				5,
				3
			],
			goal: 6
		};
		if (level === 4) return {
			capacities: [
				14,
				9,
				6,
				4
			],
			goal: 7
		};
		return {
			capacities: [
				16,
				11,
				7,
				4,
				3
			],
			goal: 8
		};
	}
};
//#endregion
//#region src/engine/CanvasRenderer.ts
var CanvasRenderer = class {
	canvas;
	ctx;
	waterSim;
	confetti = [];
	constructor(canvas, waterSim) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.waterSim = waterSim;
	}
	/**
	* Resizes the canvas to match display size, adjusting for High-DPI screens.
	*/
	resize(width, height) {
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;
		this.ctx.scale(dpr, dpr);
		return { scale: dpr };
	}
	/**
	* Main render method
	*/
	draw(state, buckets, waterParticles, ambientParticles, hoveredButtonId, hintText) {
		const w = this.canvas.width / (window.devicePixelRatio || 1);
		const h = this.canvas.height / (window.devicePixelRatio || 1);
		this.ctx.clearRect(0, 0, w, h);
		this.drawBackground(w, h, state.settings.highContrast);
		this.drawAmbientParticles(ambientParticles);
		const tableY = h * .72;
		this.drawTable(w, h, tableY, state.settings.highContrast);
		this.drawBucketShadows(buckets, tableY);
		this.drawBuckets(buckets, state.settings.highContrast);
		this.drawWaterParticles(waterParticles);
		this.drawHUD(state, hoveredButtonId, hintText, w, h);
		if (state.isWon) this.drawVictoryOverlay(state, hoveredButtonId, w, h);
	}
	drawBackground(w, h, highContrast) {
		const grad = this.ctx.createLinearGradient(0, 0, 0, h);
		if (highContrast) {
			grad.addColorStop(0, "#FFFFFF");
			grad.addColorStop(1, "#E6E1D5");
		} else {
			grad.addColorStop(0, "#F7F4ED");
			grad.addColorStop(1, "#ECE7DC");
		}
		this.ctx.fillStyle = grad;
		this.ctx.fillRect(0, 0, w, h);
	}
	drawAmbientParticles(particles) {
		this.ctx.save();
		particles.forEach((p) => {
			this.ctx.fillStyle = `rgba(213, 196, 161, ${p.opacity})`;
			this.ctx.beginPath();
			this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			this.ctx.fill();
		});
		this.ctx.restore();
	}
	drawTable(w, h, tableY, highContrast) {
		this.ctx.save();
		this.ctx.fillStyle = "rgba(40, 36, 32, 0.05)";
		this.ctx.beginPath();
		this.ctx.moveTo(0, tableY);
		this.ctx.lineTo(w, tableY);
		this.ctx.lineTo(w, tableY + 25);
		this.ctx.lineTo(0, tableY + 25);
		this.ctx.fill();
		const tableGrad = this.ctx.createLinearGradient(0, tableY, 0, h);
		if (highContrast) {
			tableGrad.addColorStop(0, "#D1C2A3");
			tableGrad.addColorStop(1, "#8C7E62");
		} else {
			tableGrad.addColorStop(0, "#EAE4D8");
			tableGrad.addColorStop(1, "#D8CFBE");
		}
		this.ctx.fillStyle = tableGrad;
		this.ctx.beginPath();
		this.ctx.moveTo(0, tableY);
		this.ctx.lineTo(w, tableY);
		this.ctx.lineTo(w, h);
		this.ctx.lineTo(0, h);
		this.ctx.fill();
		this.ctx.strokeStyle = highContrast ? "#8C7E62" : "rgba(213, 196, 161, 0.6)";
		this.ctx.lineWidth = 2;
		this.ctx.beginPath();
		this.ctx.moveTo(0, tableY);
		this.ctx.lineTo(w, tableY);
		this.ctx.stroke();
		this.ctx.restore();
	}
	drawBucketShadows(buckets, tableY) {
		this.ctx.save();
		buckets.forEach((b) => {
			const hoverHeight = Math.max(0, tableY - (b.y + b.height / 2));
			const liftScale = 1 + hoverHeight * .003;
			const shadowW = b.width * .8 * liftScale;
			const shadowH = 14 / liftScale;
			const shadowOpacity = Math.max(.02, .15 - hoverHeight * 8e-4);
			const shadowX = b.x;
			const shadowY = tableY + 5 + hoverHeight * .1;
			const shadowGrad = this.ctx.createRadialGradient(shadowX, shadowY, 0, shadowX, shadowY, shadowW / 2);
			shadowGrad.addColorStop(0, `rgba(40, 36, 32, ${shadowOpacity})`);
			shadowGrad.addColorStop(.5, `rgba(40, 36, 32, ${shadowOpacity * .5})`);
			shadowGrad.addColorStop(1, "rgba(40, 36, 32, 0)");
			this.ctx.fillStyle = shadowGrad;
			this.ctx.beginPath();
			this.ctx.ellipse(shadowX, shadowY, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
			this.ctx.fill();
		});
		this.ctx.restore();
	}
	drawBuckets(buckets, highContrast) {
		buckets.forEach((b) => {
			this.ctx.save();
			this.ctx.translate(b.x, b.y);
			this.ctx.rotate(b.angle);
			this.ctx.scale(b.scaleX, b.scaleY);
			this.drawBucketInterior(b, highContrast);
			this.drawWaterInside(b, highContrast);
			this.drawBucketBody(b, highContrast);
			this.drawBucketMarkingsAndText(b, highContrast);
			this.ctx.restore();
		});
	}
	drawBucketInterior(b, highContrast) {
		const halfW = b.width / 2;
		const halfH = b.height / 2;
		const r = 16;
		this.ctx.fillStyle = highContrast ? "#E8E4D9" : "rgba(230, 225, 215, 0.7)";
		this.ctx.beginPath();
		this.ctx.moveTo(-halfW, -halfH);
		this.ctx.lineTo(halfW, -halfH);
		this.ctx.lineTo(halfW, halfH - r);
		this.ctx.arcTo(halfW, halfH, halfW - r, halfH, r);
		this.ctx.lineTo(-halfW + r, halfH);
		this.ctx.arcTo(-halfW, halfH, -halfW, halfH - r, r);
		this.ctx.closePath();
		this.ctx.fill();
	}
	drawWaterInside(b, highContrast) {
		if (b.amount <= .001) return;
		const halfW = b.width / 2;
		const halfH = b.height / 2;
		const r = 16;
		this.ctx.save();
		this.ctx.beginPath();
		this.ctx.moveTo(-halfW + 1, -halfH + 1);
		this.ctx.lineTo(halfW - 1, -halfH + 1);
		this.ctx.lineTo(halfW - 1, halfH - r);
		this.ctx.arcTo(halfW - 1, halfH - 1, halfW - r, halfH - 1, r);
		this.ctx.lineTo(-halfW + r, halfH - 1);
		this.ctx.arcTo(-halfW + 1, halfH - 1, -halfW + 1, halfH - r, r);
		this.ctx.closePath();
		this.ctx.clip();
		const fillPercent = b.amount / b.capacity;
		const waterBaseY = halfH - b.height * fillPercent;
		const nodes = this.waterSim.getNodes(b.id);
		const nodeCount = nodes.length;
		this.ctx.beginPath();
		this.ctx.lineTo(halfW, halfH);
		this.ctx.lineTo(-halfW, halfH);
		const startX = -halfW;
		const startY = waterBaseY + nodes[0].y;
		this.ctx.lineTo(startX, startY);
		for (let i = 1; i < nodeCount; i++) {
			const nodeX = -halfW + b.width * i / (nodeCount - 1);
			const wobbleOffset = Math.sin(b.wobbleAngle) * (nodeX / halfW) * 12;
			const nodeY = waterBaseY + nodes[i].y + wobbleOffset;
			const prevX = -halfW + b.width * (i - 1) / (nodeCount - 1);
			const prevWobble = Math.sin(b.wobbleAngle) * (prevX / halfW) * 12;
			const prevY = waterBaseY + nodes[i - 1].y + prevWobble;
			const cpX = (prevX + nodeX) / 2;
			this.ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + nodeY) / 2);
		}
		const endX = halfW;
		const endY = waterBaseY + nodes[nodeCount - 1].y + Math.sin(b.wobbleAngle) * 12;
		this.ctx.lineTo(endX, endY);
		this.ctx.closePath();
		const waterGrad = this.ctx.createLinearGradient(0, waterBaseY, 0, halfH);
		if (highContrast) {
			waterGrad.addColorStop(0, "#005DFF");
			waterGrad.addColorStop(1, "#002C9E");
		} else {
			waterGrad.addColorStop(0, "rgba(79, 169, 255, 0.85)");
			waterGrad.addColorStop(.5, "rgba(64, 150, 240, 0.85)");
			waterGrad.addColorStop(1, "rgba(40, 110, 210, 0.9)");
		}
		this.ctx.fillStyle = waterGrad;
		this.ctx.fill();
		this.ctx.strokeStyle = highContrast ? "#FFFFFF" : "rgba(255, 255, 255, 0.6)";
		this.ctx.lineWidth = 2.5;
		this.ctx.beginPath();
		this.ctx.moveTo(startX, startY);
		for (let i = 1; i < nodeCount; i++) {
			const nodeX = -halfW + b.width * i / (nodeCount - 1);
			const wobbleOffset = Math.sin(b.wobbleAngle) * (nodeX / halfW) * 12;
			const nodeY = waterBaseY + nodes[i].y + wobbleOffset;
			const prevX = -halfW + b.width * (i - 1) / (nodeCount - 1);
			const prevWobble = Math.sin(b.wobbleAngle) * (prevX / halfW) * 12;
			const prevY = waterBaseY + nodes[i - 1].y + prevWobble;
			const cpX = (prevX + nodeX) / 2;
			this.ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + nodeY) / 2);
		}
		this.ctx.lineTo(endX, endY);
		this.ctx.stroke();
		this.ctx.restore();
	}
	drawBucketBody(b, highContrast) {
		const halfW = b.width / 2;
		const halfH = b.height / 2;
		const r = 16;
		this.ctx.beginPath();
		this.ctx.moveTo(-halfW, -halfH);
		this.ctx.lineTo(halfW, -halfH);
		this.ctx.lineTo(halfW, halfH - r);
		this.ctx.arcTo(halfW, halfH, halfW - r, halfH, r);
		this.ctx.lineTo(-halfW + r, halfH);
		this.ctx.arcTo(-halfW, halfH, -halfW, halfH - r, r);
		this.ctx.closePath();
		const bodyGrad = this.ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
		if (highContrast) {
			this.ctx.strokeStyle = "#333333";
			this.ctx.lineWidth = 4;
			this.ctx.stroke();
		} else {
			bodyGrad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
			bodyGrad.addColorStop(.3, "rgba(255, 255, 255, 0.15)");
			bodyGrad.addColorStop(1, "rgba(255, 255, 255, 0.35)");
			this.ctx.fillStyle = bodyGrad;
			this.ctx.fill();
			this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
			this.ctx.lineWidth = 3;
			this.ctx.stroke();
			this.ctx.strokeStyle = "rgba(120, 115, 105, 0.15)";
			this.ctx.lineWidth = 1;
			this.ctx.stroke();
			this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
			this.ctx.lineWidth = 2.5;
			this.ctx.beginPath();
			this.ctx.moveTo(-halfW + 6, -halfH + 10);
			this.ctx.lineTo(-halfW + 6, halfH - 20);
			this.ctx.stroke();
		}
		this.ctx.beginPath();
		this.ctx.ellipse(0, -halfH, halfW, 7, 0, 0, Math.PI * 2);
		if (highContrast) {
			this.ctx.fillStyle = "#E8E4D9";
			this.ctx.fill();
			this.ctx.strokeStyle = "#333333";
			this.ctx.lineWidth = 3;
			this.ctx.stroke();
		} else {
			this.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
			this.ctx.fill();
			this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
			this.ctx.lineWidth = 2;
			this.ctx.stroke();
		}
	}
	drawBucketMarkingsAndText(b, highContrast) {
		const halfW = b.width / 2;
		const halfH = b.height / 2;
		const tickCount = b.capacity;
		for (let i = 1; i < tickCount; i++) {
			const fillPercent = i / b.capacity;
			const tickY = halfH - b.height * fillPercent;
			this.ctx.strokeStyle = highContrast ? "#333333" : "rgba(90, 84, 74, 0.4)";
			this.ctx.lineWidth = 1.5;
			this.ctx.beginPath();
			this.ctx.moveTo(-halfW, tickY);
			this.ctx.lineTo(-halfW + 8, tickY);
			this.ctx.stroke();
		}
		const fontSize = Math.max(12, Math.min(18, Math.round(16 * (b.width / 110))));
		this.ctx.font = `700 ${fontSize}px Outfit`;
		this.ctx.textAlign = "center";
		this.ctx.fillStyle = highContrast ? "#111111" : "#2C2720";
		const textOffset = Math.max(10, Math.round(15 * (b.width / 110)));
		this.ctx.fillText(`${b.capacity}L`, 0, -halfH - textOffset);
	}
	drawWaterParticles(particles) {
		this.ctx.save();
		particles.forEach((p) => {
			this.ctx.fillStyle = p.color;
			this.ctx.globalAlpha = p.opacity;
			this.ctx.beginPath();
			this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			this.ctx.fill();
		});
		this.ctx.restore();
	}
	drawHUD(state, hoveredButtonId, hintText, w, h) {
		this.ctx.save();
		const padding = 20;
		const headerW = Math.min(380, w - padding * 2);
		const headerH = 75;
		const headerX = (w - headerW) / 2;
		const headerY = padding;
		this.drawGlassCard(headerX, headerY, headerW, headerH, state.settings.highContrast);
		this.ctx.fillStyle = state.settings.highContrast ? "#111111" : "#2C2720";
		this.ctx.font = "700 20px Outfit";
		this.ctx.textAlign = "left";
		this.ctx.fillText(`Measure exactly ${state.goal} Liters`, headerX + 20, 54);
		this.ctx.font = "500 14px Outfit";
		this.ctx.fillStyle = state.settings.highContrast ? "#333333" : "#5A544A";
		const minutes = Math.floor(state.time / 60);
		const seconds = state.time % 60;
		const timeStr = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		this.ctx.fillText(`Level ${state.currentLevel}/5    •    Moves: ${state.moves}    •    Time: ${timeStr}`, headerX + 20, 76);
		const buttonSize = 36;
		[
			{
				id: "restart",
				icon: "⟳",
				x: headerX + headerW - 40,
				label: "Restart"
			},
			{
				id: "redo",
				icon: "→",
				x: headerX + headerW - 85,
				label: "Redo",
				disabled: state.redoHistory.length === 0
			},
			{
				id: "undo",
				icon: "←",
				x: headerX + headerW - 130,
				label: "Undo",
				disabled: state.history.length === 0
			}
		].forEach((btn) => {
			this.drawHUDButton(btn.id, btn.icon, btn.x, 57.5 - buttonSize / 2, buttonSize, hoveredButtonId === btn.id, state.settings.highContrast, btn.disabled);
		});
		const footerW = Math.min(380, w - padding * 2);
		const footerH = 50;
		const footerX = (w - footerW) / 2;
		const footerY = h - footerH - padding;
		const btnSpacing = (footerW - buttonSize - 50) / 4;
		const footBtns = [
			{
				id: "mute",
				icon: state.settings.mute ? "🔇" : "🔊",
				x: footerX + 25
			},
			{
				id: "highContrast",
				icon: "◐",
				x: footerX + 25 + btnSpacing
			},
			{
				id: "reduceMotion",
				icon: "〰",
				x: footerX + 25 + btnSpacing * 2
			},
			{
				id: "autoSolve",
				icon: "🤖",
				x: footerX + 25 + btnSpacing * 3
			},
			{
				id: "hint",
				icon: "💡",
				x: footerX + footerW - 25 - buttonSize
			}
		];
		footBtns.forEach((btn) => {
			this.drawHUDButton(btn.id, btn.icon, btn.x, footerY + footerH / 2 - buttonSize / 2, buttonSize, hoveredButtonId === btn.id, state.settings.highContrast);
		});
		this.ctx.fillStyle = state.settings.highContrast ? "#333333" : "#666155";
		this.ctx.font = "600 12px Outfit";
		this.ctx.textAlign = "center";
		footBtns.forEach((btn) => {
			let label = "";
			if (btn.id === "mute") label = "Mute";
			else if (btn.id === "highContrast") label = "Contrast";
			else if (btn.id === "reduceMotion") label = "Motion";
			else if (btn.id === "autoSolve") label = "Auto";
			else if (btn.id === "hint") label = "Hint";
			this.ctx.fillText(label, btn.x + buttonSize / 2, footerY + footerH - 4);
		});
		if (hintText) {
			const hintW = Math.min(420, w - padding * 2);
			const hintH = 65;
			const hintX = (w - hintW) / 2;
			this.drawGlassCard(hintX, 110, hintW, hintH, state.settings.highContrast);
			this.ctx.fillStyle = state.settings.highContrast ? "#900000" : "#C74A2C";
			this.ctx.font = "bold 13px Outfit";
			this.ctx.textAlign = "center";
			this.ctx.fillText("HINT SOLVER", w / 2, 132);
			this.ctx.fillStyle = state.settings.highContrast ? "#111111" : "#3C372F";
			this.ctx.font = "500 14px Outfit";
			this.ctx.fillText(hintText, w / 2, 155);
		}
		this.ctx.restore();
	}
	drawHUDButton(_id, icon, x, y, size, isHovered, highContrast, disabled = false) {
		this.ctx.save();
		this.ctx.beginPath();
		this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
		if (disabled) {
			this.ctx.fillStyle = highContrast ? "#E8E4D9" : "rgba(230, 225, 215, 0.3)";
			this.ctx.strokeStyle = highContrast ? "#CCCCCC" : "rgba(255, 255, 255, 0.2)";
		} else if (isHovered) {
			this.ctx.fillStyle = highContrast ? "#333333" : "rgba(79, 169, 255, 0.15)";
			this.ctx.strokeStyle = highContrast ? "#000000" : "rgba(79, 169, 255, 0.5)";
		} else {
			this.ctx.fillStyle = highContrast ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)";
			this.ctx.strokeStyle = highContrast ? "#888888" : "rgba(255, 255, 255, 0.6)";
		}
		this.ctx.lineWidth = 1.5;
		this.ctx.fill();
		this.ctx.stroke();
		this.ctx.fillStyle = disabled ? highContrast ? "#888888" : "rgba(90, 85, 75, 0.3)" : isHovered && highContrast ? "#FFFFFF" : highContrast ? "#111111" : "#3C372F";
		this.ctx.font = "600 17px Outfit";
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		this.ctx.fillText(icon, x + size / 2, y + size / 2 + 1);
		this.ctx.restore();
	}
	drawGlassCard(x, y, w, h, highContrast) {
		this.ctx.save();
		this.ctx.beginPath();
		const r = 16;
		this.ctx.moveTo(x + r, y);
		this.ctx.lineTo(x + w - r, y);
		this.ctx.arcTo(x + w, y, x + w, y + r, r);
		this.ctx.lineTo(x + w, y + h - r);
		this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		this.ctx.lineTo(x + r, y + h);
		this.ctx.arcTo(x, y + h, x, y + h - r, r);
		this.ctx.lineTo(x, y + r);
		this.ctx.arcTo(x, y, x + r, y, r);
		this.ctx.closePath();
		if (highContrast) {
			this.ctx.fillStyle = "#FFFFFF";
			this.ctx.strokeStyle = "#000000";
			this.ctx.lineWidth = 3;
		} else {
			this.ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
			this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
			this.ctx.shadowColor = "rgba(40, 36, 32, 0.05)";
			this.ctx.shadowBlur = 15;
			this.ctx.shadowOffsetY = 4;
			this.ctx.lineWidth = 1.5;
		}
		this.ctx.fill();
		this.ctx.shadowColor = "transparent";
		this.ctx.stroke();
		this.ctx.restore();
	}
	drawVictoryOverlay(state, hoveredButtonId, w, h) {
		this.ctx.save();
		this.ctx.fillStyle = state.settings.highContrast ? "rgba(255, 255, 255, 0.95)" : "rgba(247, 244, 237, 0.8)";
		this.ctx.fillRect(0, 0, w, h);
		const cardW = Math.min(360, w - 40);
		const cardH = 340;
		const cardX = (w - cardW) / 2;
		const cardY = (h - cardH) / 2;
		this.drawGlassCard(cardX, cardY, cardW, cardH, state.settings.highContrast);
		const isGameFinished = state.currentLevel === 5;
		this.ctx.fillStyle = state.settings.highContrast ? "#008C1A" : "#1D6F2C";
		this.ctx.font = "700 28px Outfit";
		this.ctx.textAlign = "center";
		const titleText = isGameFinished ? "Grand Master!" : "Puzzle Solved!";
		this.ctx.fillText(titleText, w / 2, cardY + 50);
		this.ctx.fillStyle = state.settings.highContrast ? "#333333" : "#5A544A";
		this.ctx.font = "500 15px Outfit";
		const subtitleText = isGameFinished ? "You finished all 5 Beaker Challenges!" : `You measured exactly ${state.goal} liters.`;
		this.ctx.fillText(subtitleText, w / 2, cardY + 80);
		const capacities = state.capacities;
		const initial = new Array(capacities.length).fill(0);
		initial[0] = capacities[0];
		const solution = new Solver(capacities).solve(initial, state.goal);
		const optimalMoves = solution ? solution.length : 7;
		let stars = 1;
		if (state.moves <= optimalMoves) stars = 3;
		else if (state.moves <= optimalMoves + 3) stars = 2;
		this.drawStars(w / 2, cardY + 130, stars, state.settings.highContrast);
		this.ctx.fillStyle = state.settings.highContrast ? "#111111" : "#2C2720";
		this.ctx.font = "600 16px Outfit";
		this.ctx.fillText(`Moves Count: ${state.moves}`, w / 2, cardY + 185);
		const timeStr = `${Math.floor(state.time / 60)}m ${state.time % 60}s`;
		this.ctx.fillText(`Completion Time: ${timeStr}`, w / 2, cardY + 210);
		this.ctx.font = "italic 12.5px Outfit";
		this.ctx.fillStyle = state.settings.highContrast ? "#555555" : "#777265";
		this.ctx.fillText(`(Optimal solution requires ${optimalMoves} moves)`, w / 2, cardY + 235);
		const playAgainW = 160;
		const playAgainH = 46;
		const playAgainX = (w - playAgainW) / 2;
		const playAgainY = cardY + cardH - 75;
		const isHovered = hoveredButtonId === "playAgain";
		this.ctx.beginPath();
		const r = 23;
		this.ctx.moveTo(playAgainX + r, playAgainY);
		this.ctx.lineTo(playAgainX + playAgainW - r, playAgainY);
		this.ctx.arcTo(playAgainX + playAgainW, playAgainY, playAgainX + playAgainW, playAgainY + r, r);
		this.ctx.lineTo(playAgainX + playAgainW, playAgainY + playAgainH - r);
		this.ctx.arcTo(playAgainX + playAgainW, playAgainY + playAgainH, playAgainX + playAgainW - r, playAgainY + playAgainH, r);
		this.ctx.lineTo(playAgainX + r, playAgainY + playAgainH);
		this.ctx.arcTo(playAgainX, playAgainY + playAgainH, playAgainX, playAgainY + playAgainH - r, r);
		this.ctx.lineTo(playAgainX, playAgainY + r);
		this.ctx.arcTo(playAgainX, playAgainY, playAgainX + r, playAgainY, r);
		this.ctx.closePath();
		if (state.settings.highContrast) {
			this.ctx.fillStyle = isHovered ? "#111111" : "#FFFFFF";
			this.ctx.strokeStyle = "#000000";
			this.ctx.lineWidth = 2.5;
			this.ctx.fill();
			this.ctx.stroke();
			this.ctx.fillStyle = isHovered ? "#FFFFFF" : "#111111";
		} else {
			this.ctx.fillStyle = isHovered ? "#4FA9FF" : "#3C372F";
			this.ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
			this.ctx.shadowBlur = 10;
			this.ctx.shadowOffsetY = 3;
			this.ctx.fill();
			this.ctx.shadowColor = "transparent";
			this.ctx.fillStyle = "#FFFFFF";
		}
		this.ctx.font = "bold 15px Outfit";
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		const btnText = state.currentLevel < 5 ? "NEXT LEVEL" : "REPLAY GAME";
		this.ctx.fillText(btnText, w / 2, playAgainY + playAgainH / 2);
		this.updateConfetti(w, h, state.settings.reduceMotion);
		this.drawConfetti();
		this.ctx.restore();
	}
	drawStars(cx, cy, rating, highContrast) {
		const starSpacing = 40;
		const starCount = 3;
		for (let i = 0; i < starCount; i++) {
			const x = cx + (i - 1) * starSpacing;
			const isFilled = i < rating;
			this.drawSingleStar(x, cy, isFilled, highContrast);
		}
	}
	drawSingleStar(x, y, filled, highContrast) {
		this.ctx.save();
		const spikes = 5;
		const outerRadius = 14;
		const innerRadius = 6;
		let rot = Math.PI / 2 * 3;
		let cx = x;
		let cy = y;
		let step = Math.PI / spikes;
		this.ctx.beginPath();
		this.ctx.moveTo(cx, cy - outerRadius);
		for (let i = 0; i < spikes; i++) {
			cx = x + Math.cos(rot) * outerRadius;
			cy = y + Math.sin(rot) * outerRadius;
			this.ctx.lineTo(cx, cy);
			rot += step;
			cx = x + Math.cos(rot) * innerRadius;
			cy = y + Math.sin(rot) * innerRadius;
			this.ctx.lineTo(cx, cy);
			rot += step;
		}
		this.ctx.lineTo(x, y - outerRadius);
		this.ctx.closePath();
		if (filled) {
			this.ctx.fillStyle = highContrast ? "#000000" : "#FFD214";
			this.ctx.fill();
			this.ctx.strokeStyle = highContrast ? "#000000" : "#E6B800";
			this.ctx.lineWidth = 1.5;
			this.ctx.stroke();
		} else {
			this.ctx.fillStyle = highContrast ? "#E8E4D9" : "rgba(230, 225, 215, 0.5)";
			this.ctx.fill();
			this.ctx.strokeStyle = highContrast ? "#CCCCCC" : "rgba(90, 85, 75, 0.2)";
			this.ctx.lineWidth = 1.5;
			this.ctx.stroke();
		}
		this.ctx.restore();
	}
	initConfetti(w, _h) {
		if (this.confetti.length > 0) return;
		const colors = [
			"#4FA9FF",
			"#FF85A2",
			"#FFD214",
			"#5CD3A5",
			"#A78BFA"
		];
		for (let i = 0; i < 90; i++) this.confetti.push({
			x: Math.random() * w,
			y: -10 - Math.random() * 80,
			vx: (Math.random() * 4 - 2) * 60,
			vy: 120 + Math.random() * 150,
			color: colors[Math.floor(Math.random() * colors.length)],
			r: Math.random() * Math.PI,
			size: 5 + Math.random() * 6
		});
	}
	updateConfetti(w, h, reduceMotion) {
		if (reduceMotion) {
			this.confetti = [];
			return;
		}
		if (this.confetti.length === 0) this.initConfetti(w, h);
		const dt = 1 / 60;
		this.confetti.forEach((c) => {
			c.x += c.vx * dt;
			c.y += c.vy * dt;
			c.r += c.vx * .05 * dt;
			if (c.y > h + 10) {
				c.y = -10;
				c.x = Math.random() * w;
				c.vy = 120 + Math.random() * 150;
			}
		});
	}
	drawConfetti() {
		this.ctx.save();
		this.confetti.forEach((c) => {
			this.ctx.fillStyle = c.color;
			this.ctx.save();
			this.ctx.translate(c.x, c.y);
			this.ctx.rotate(c.r);
			this.ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
			this.ctx.restore();
		});
		this.ctx.restore();
	}
	triggerWinConfetti() {
		this.confetti = [];
	}
};
//#endregion
//#region src/engine/Game.ts
var GameOrchestrator = class {
	stateManager;
	physics;
	waterSim;
	renderer;
	soundSynth;
	solver;
	canvas;
	isRunning = false;
	lastTime = 0;
	buckets = [];
	waterParticles = [];
	ambientParticles = [];
	originalSlots = [];
	autoSolveQueue = [];
	autoSolveDelayTimer = 0;
	hoveredButtonId = null;
	activeHintText = null;
	hintStage = 0;
	hintTimeout = null;
	lastPointerX = 0;
	lastPointerY = 0;
	pointerSpeed = 0;
	constructor(canvas) {
		this.canvas = canvas;
		this.soundSynth = new SoundSynth();
		this.stateManager = new StateManager();
		this.physics = new PhysicsEngine(this.soundSynth);
		this.waterSim = new WaterSim();
		this.renderer = new CanvasRenderer(this.canvas, this.waterSim);
		const initialState = this.stateManager.getGameState();
		this.solver = new Solver(initialState.capacities);
		this.initBuckets();
		this.initAmbientParticles();
		this.setupEventListeners();
		this.stateManager.subscribe(() => {
			this.syncBucketsWithState();
			const state = this.stateManager.getGameState();
			this.soundSynth.setMute(state.settings.mute);
			this.solver = new Solver(state.capacities);
			this.clearHint();
		});
		this.isRunning = true;
		window.addEventListener("resize", this.handleResize);
		window.addEventListener("orientationchange", () => this.checkOrientation());
		this.handleResize();
		requestAnimationFrame(this.loop);
	}
	initBuckets() {
		const state = this.stateManager.getGameState();
		const capacities = state.capacities;
		const initialAmounts = state.amounts;
		this.buckets = [];
		for (let i = 0; i < capacities.length; i++) this.buckets.push({
			id: i,
			capacity: capacities[i],
			amount: initialAmounts[i],
			targetAmount: initialAmounts[i],
			x: 0,
			y: 0,
			startX: 0,
			startY: 0,
			width: 100,
			height: 150,
			angle: 0,
			targetAngle: 0,
			scaleX: 1,
			scaleY: 1,
			isDragged: false,
			dragOffsetX: 0,
			dragOffsetY: 0,
			isPouring: false,
			pourProgress: 0,
			pourTargetId: null,
			pourDirection: 1,
			wobbleAngle: 0,
			wobbleVelocity: 0,
			velocity: {
				x: 0,
				y: 0
			},
			onTable: true,
			bounceOffset: 0,
			bounceVelocity: 0
		});
	}
	initAmbientParticles() {
		const particleCount = 20;
		for (let i = 0; i < particleCount; i++) this.ambientParticles.push({
			x: Math.random() * window.innerWidth,
			y: Math.random() * window.innerHeight,
			vx: (Math.random() * 6 - 3) * 3,
			vy: -(15 + Math.random() * 20),
			size: 1 + Math.random() * 2.5,
			opacity: .1 + Math.random() * .35,
			amplitude: 5 + Math.random() * 10,
			frequency: .5 + Math.random() * 1,
			offset: Math.random() * Math.PI * 2
		});
	}
	syncBucketsWithState() {
		const state = this.stateManager.getGameState();
		if (this.buckets.length !== state.capacities.length) {
			this.initBuckets();
			this.handleResize();
			return;
		}
		this.buckets.forEach((b) => {
			if (!b.isPouring) {
				b.targetAmount = state.amounts[b.id];
				if (Math.abs(b.amount - b.targetAmount) > .05) this.waterSim.getNodes(b.id).forEach((n) => n.velocity += (Math.random() * 2 - 1) * 3);
			}
		});
	}
	setupEventListeners() {
		this.canvas.addEventListener("touchstart", this.handlePointerDown, { passive: false });
		this.canvas.addEventListener("touchmove", this.handlePointerMove, { passive: false });
		this.canvas.addEventListener("touchend", this.handlePointerUp, { passive: false });
		this.canvas.addEventListener("mousedown", this.handlePointerDown);
		this.canvas.addEventListener("mousemove", this.handlePointerMove);
		window.addEventListener("mouseup", this.handlePointerUp);
	}
	getPointerCoords(e) {
		const rect = this.canvas.getBoundingClientRect();
		let clientX = 0;
		let clientY = 0;
		if ("touches" in e) {
			if (e.touches.length > 0) {
				clientX = e.touches[0].clientX;
				clientY = e.touches[0].clientY;
			} else if (e.changedTouches.length > 0) {
				clientX = e.changedTouches[0].clientX;
				clientY = e.changedTouches[0].clientY;
			}
		} else {
			clientX = e.clientX;
			clientY = e.clientY;
		}
		return {
			x: clientX - rect.left,
			y: clientY - rect.top
		};
	}
	handlePointerDown = (e) => {
		if (e.cancelable) e.preventDefault();
		const { x, y } = this.getPointerCoords(e);
		this.lastPointerX = x;
		this.lastPointerY = y;
		this.pointerSpeed = 0;
		this.soundSynth.init();
		if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) try {
			if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
		} catch (e) {}
		this.autoSolveQueue = [];
		const state = this.stateManager.getGameState();
		const w = this.canvas.width / (window.devicePixelRatio || 1);
		const h = this.canvas.height / (window.devicePixelRatio || 1);
		if (state.isWon) {
			const playAgainW = 160;
			const playAgainH = 46;
			const playAgainX = (w - playAgainW) / 2;
			const playAgainY = (h - 340) / 2 + 340 - 75;
			if (x >= playAgainX && x <= playAgainX + playAgainW && y >= playAgainY && y <= playAgainY + playAgainH) {
				this.soundSynth.playChime();
				if (state.currentLevel < 5) {
					const nextPuzzle = Solver.generatePuzzle(state.currentLevel + 1);
					this.stateManager.startNextLevel(nextPuzzle.capacities, nextPuzzle.goal);
				} else this.stateManager.restartEntireGame();
				this.renderer.triggerWinConfetti();
				return;
			}
		}
		const clickedButton = this.getHUDButtonAtPoint(x, y, w, h);
		if (clickedButton) {
			this.handleHUDButtonClick(clickedButton);
			return;
		}
		if (!state.isWon) this.physics.handlePointerDown(this.buckets, x, y);
	};
	handlePointerMove = (e) => {
		if (e.cancelable) e.preventDefault();
		const { x, y } = this.getPointerCoords(e);
		const dx = x - this.lastPointerX;
		const dy = y - this.lastPointerY;
		const dist = Math.sqrt(dx * dx + dy * dy);
		this.pointerSpeed = dist;
		this.lastPointerX = x;
		this.lastPointerY = y;
		const w = this.canvas.width / (window.devicePixelRatio || 1);
		const h = this.canvas.height / (window.devicePixelRatio || 1);
		this.hoveredButtonId = this.getHUDButtonAtPoint(x, y, w, h);
		this.physics.handlePointerMove(x, y, this.pointerSpeed);
	};
	handlePointerUp = (_e) => {
		this.physics.handlePointerUp(this.buckets, (fromId, _toId) => {
			this.soundSynth.startPour();
			this.waterSim.getNodes(fromId).forEach((n) => n.velocity += (Math.random() * 2 - 1) * 2.5);
		});
		this.hoveredButtonId = null;
	};
	getHUDButtonAtPoint(x, y, w, h) {
		const padding = 20;
		const headerW = Math.min(380, w - padding * 2);
		const headerX = (w - headerW) / 2;
		const buttonSize = 36;
		const state = this.stateManager.getGameState();
		const headerBtns = [
			{
				id: "restart",
				x: headerX + headerW - 40
			},
			{
				id: "redo",
				x: headerX + headerW - 85,
				disabled: state.redoHistory.length === 0
			},
			{
				id: "undo",
				x: headerX + headerW - 130,
				disabled: state.history.length === 0
			}
		];
		for (let btn of headerBtns) {
			if (btn.disabled) continue;
			const bx = btn.x + buttonSize / 2;
			const by = 57.5;
			if (Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by)) <= buttonSize / 2) return btn.id;
		}
		const footerW = Math.min(380, w - padding * 2);
		const footerX = (w - footerW) / 2;
		const footerY = h - 50 - padding;
		const btnSpacing = (footerW - buttonSize - 50) / 4;
		const footerBtns = [
			{
				id: "mute",
				x: footerX + 25
			},
			{
				id: "highContrast",
				x: footerX + 25 + btnSpacing
			},
			{
				id: "reduceMotion",
				x: footerX + 25 + btnSpacing * 2
			},
			{
				id: "autoSolve",
				x: footerX + 25 + btnSpacing * 3
			},
			{
				id: "hint",
				x: footerX + footerW - 25 - buttonSize
			}
		];
		for (let btn of footerBtns) {
			const bx = btn.x + buttonSize / 2;
			const by = footerY + 50 / 2;
			if (Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by)) <= buttonSize / 2) return btn.id;
		}
		if (state.isWon) {
			const playAgainW = 160;
			const playAgainH = 46;
			const playAgainX = (w - playAgainW) / 2;
			const playAgainY = (h - 340) / 2 + 340 - 75;
			if (x >= playAgainX && x <= playAgainX + playAgainW && y >= playAgainY && y <= playAgainY + playAgainH) return "playAgain";
		}
		return null;
	}
	handleHUDButtonClick(id) {
		this.soundSynth.playChime();
		switch (id) {
			case "undo":
				this.stateManager.undo();
				break;
			case "redo":
				this.stateManager.redo();
				break;
			case "restart":
				this.stateManager.resetPuzzle();
				break;
			case "mute":
				this.stateManager.toggleMute();
				break;
			case "highContrast":
				this.stateManager.toggleHighContrast();
				break;
			case "reduceMotion":
				this.stateManager.toggleReduceMotion();
				break;
			case "autoSolve":
				this.triggerAutoSolve();
				break;
			case "hint":
				this.triggerHint();
				break;
		}
	}
	triggerAutoSolve() {
		const state = this.stateManager.getGameState();
		if (state.isWon) return;
		const solution = this.solver.solve(state.amounts);
		if (solution && solution.length > 0) {
			this.autoSolveQueue = solution.map((m) => ({
				from: m.from,
				to: m.to
			}));
			this.clearHint();
		} else {
			this.activeHintText = "No solution path found. Try resetting the puzzle!";
			if (this.hintTimeout) clearTimeout(this.hintTimeout);
			this.hintTimeout = setTimeout(() => {
				this.clearHint();
			}, 4e3);
		}
	}
	triggerHint() {
		const state = this.stateManager.getGameState();
		this.hintStage += 1;
		if (this.hintStage > 3) {
			this.clearHint();
			return;
		}
		this.activeHintText = this.solver.getHint(state.amounts, this.hintStage);
		if (this.hintTimeout) clearTimeout(this.hintTimeout);
		this.hintTimeout = setTimeout(() => {
			this.clearHint();
		}, 8e3);
	}
	clearHint() {
		this.activeHintText = null;
		this.hintStage = 0;
		if (this.hintTimeout) {
			clearTimeout(this.hintTimeout);
			this.hintTimeout = null;
		}
	}
	handleResize = () => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		this.checkOrientation();
		this.renderer.resize(w, h);
		const N = this.buckets.length;
		if (N === 0) return;
		const tableY = h * .72;
		const capMax = Math.max(...this.buckets.map((b) => b.capacity));
		const scaleMultiplier = N === 3 ? 1 : N === 4 ? .82 : .7;
		let screenScale = Math.max(.48, Math.min(1.2, w / 700)) * scaleMultiplier;
		const headerBottom = 95;
		const minClearanceY = 15;
		const maxBeakerBaseH = 185;
		if (tableY - maxBeakerBaseH * screenScale < 110) screenScale = (tableY - headerBottom - minClearanceY) / maxBeakerBaseH;
		this.buckets.forEach((b) => {
			const relativeScale = b.capacity / capMax;
			const baseW = 90 + relativeScale * 35;
			const baseH = 115 + relativeScale * 70;
			b.width = baseW * screenScale;
			b.height = baseH * screenScale;
		});
		let gap = (N === 3 ? 60 : N === 4 ? 40 : 25) * screenScale;
		const centerX = w / 2;
		let totalWidth = 0;
		this.buckets.forEach((b, idx) => {
			totalWidth += b.width;
			if (idx > 0) totalWidth += gap;
		});
		const minClearanceX = 40;
		if (totalWidth > w - minClearanceX) {
			const reduction = (w - minClearanceX) / totalWidth;
			screenScale *= reduction;
			this.buckets.forEach((b) => {
				const relativeScale = b.capacity / capMax;
				const baseW = 90 + relativeScale * 35;
				const baseH = 115 + relativeScale * 70;
				b.width = baseW * screenScale;
				b.height = baseH * screenScale;
			});
			gap *= reduction;
			totalWidth = 0;
			this.buckets.forEach((b, idx) => {
				totalWidth += b.width;
				if (idx > 0) totalWidth += gap;
			});
		}
		let currentX = centerX - totalWidth / 2;
		this.originalSlots = [];
		this.buckets.forEach((b) => {
			const beakerCenter = currentX + b.width / 2;
			this.originalSlots.push({
				x: beakerCenter,
				y: tableY - b.height / 2
			});
			currentX += b.width + gap;
		});
		this.buckets.forEach((b, idx) => {
			if (!this.isRunning || !b.isDragged && !b.isPouring) {
				b.x = this.originalSlots[idx].x;
				b.y = this.originalSlots[idx].y;
				b.startX = b.x;
				b.startY = b.y;
			}
		});
	};
	checkOrientation() {
		const prompt = document.getElementById("orientation-prompt");
		if (!prompt) return;
		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
		const isPortrait = window.innerHeight > window.innerWidth;
		if (isMobile && isPortrait) {
			prompt.style.display = "flex";
			this.isRunning = false;
		} else {
			prompt.style.display = "none";
			if (!this.isRunning) {
				this.isRunning = true;
				this.lastTime = 0;
				requestAnimationFrame(this.loop);
			}
		}
	}
	/**
	* Main game physics & animation loop
	*/
	loop = (timestamp) => {
		if (!this.isRunning) return;
		if (!this.lastTime) this.lastTime = timestamp;
		const dt = (timestamp - this.lastTime) / 1e3;
		this.lastTime = timestamp;
		if (this.autoSolveDelayTimer > 0) this.autoSolveDelayTimer -= dt;
		else if (this.autoSolveQueue.length > 0) {
			if (!this.buckets.some((b) => b.isPouring || b.pourTargetId !== null)) {
				const nextMove = this.autoSolveQueue.shift();
				const source = this.buckets[nextMove.from];
				const dest = this.buckets[nextMove.to];
				if (source.amount > 0 && dest.amount < dest.capacity) {
					const isLeft = source.x < dest.x;
					source.pourDirection = isLeft ? 1 : -1;
					const offset = dest.width * .55;
					source.startX = dest.x + (isLeft ? -offset : offset);
					source.startY = dest.y - dest.height * .75;
					source.isPouring = true;
					source.pourTargetId = dest.id;
					source.targetAngle = isLeft ? 1.3 : -1.3;
					this.soundSynth.startPour();
					this.waterSim.getNodes(source.id).forEach((n) => n.velocity += (Math.random() * 2 - 1) * 2.5);
				}
			}
		}
		const state = this.stateManager.getGameState();
		this.physics.update(this.buckets, dt, this.originalSlots);
		this.waterSim.update(this.buckets, this.waterParticles, this.ambientParticles, dt, (_fromId, toId, transferStep) => {
			const dest = this.buckets[toId];
			this.soundSynth.updatePour(transferStep, dest.amount / dest.capacity);
			this.waterSim.triggerSlosh(toId, (Math.random() * 2 - 1) * .8);
		}, (fromId, toId) => {
			this.soundSynth.stopPour();
			this.soundSynth.playChime();
			const finalAmounts = [...state.amounts];
			const dest = this.buckets[toId];
			const transfer = Math.min(state.amounts[fromId], dest.capacity - state.amounts[toId]);
			finalAmounts[fromId] -= transfer;
			finalAmounts[toId] += transfer;
			this.stateManager.setAmounts(finalAmounts, true);
			if (this.stateManager.getGameState().isWon) {
				this.soundSynth.playSuccess();
				this.renderer.triggerWinConfetti();
			}
			this.autoSolveDelayTimer = 1.3;
		}, state.settings.reduceMotion);
		this.buckets.forEach((b) => {
			if (!b.isPouring) {
				if (b.amount !== b.targetAmount) {
					const speed = state.settings.reduceMotion ? 20 : 5;
					b.amount += (b.targetAmount - b.amount) * speed * dt;
					if (Math.abs(b.amount - b.targetAmount) < .005) b.amount = b.targetAmount;
				}
			}
		});
		this.renderer.draw(state, this.buckets, this.waterParticles, this.ambientParticles, this.hoveredButtonId, this.activeHintText);
		requestAnimationFrame(this.loop);
	};
	destroy() {
		this.isRunning = false;
		this.stateManager.destroy();
		this.soundSynth.destroy();
		window.removeEventListener("resize", this.handleResize);
		this.canvas.removeEventListener("touchstart", this.handlePointerDown);
		this.canvas.removeEventListener("touchmove", this.handlePointerMove);
		this.canvas.removeEventListener("touchend", this.handlePointerUp);
		this.canvas.removeEventListener("mousedown", this.handlePointerDown);
		this.canvas.removeEventListener("mousemove", this.handlePointerMove);
		window.removeEventListener("mouseup", this.handlePointerUp);
	}
};
//#endregion
//#region src/registerSW.ts
function registerServiceWorker() {
	if ("serviceWorker" in navigator && true) window.addEventListener("load", () => {
		navigator.serviceWorker.register("./sw.js").then((registration) => {
			console.log("Service Worker registered successfully with scope:", registration.scope);
		}).catch((error) => {
			console.error("Service Worker registration failed:", error);
		});
	});
}
//#endregion
//#region src/main.ts
window.addEventListener("DOMContentLoaded", () => {
	const canvas = document.getElementById("gameCanvas");
	if (!canvas) {
		console.error("Canvas element not found!");
		return;
	}
	const game = new GameOrchestrator(canvas);
	registerServiceWorker();
	window.game = game;
});
//#endregion
