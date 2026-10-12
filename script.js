"use strict";

// Instrument settings. MIC_THRESHOLD is the minimum high-passed mic RMS required for a tap.
const MIC_THRESHOLD = 0.012;
const MIC_COOLDOWN = 230; // milliseconds
const MIN_FREQUENCY = 50;
const MAX_FREQUENCY = 1500;
const INITIAL_FREQUENCY = 164;
const MIN_CUTOFF = 250;
const MAX_CUTOFF = 6000;
const INITIAL_CUTOFF = 1200;
const ATTACK = 0.055; // seconds
const RELEASE = 0.24; // seconds
const MASTER_VOLUME = 0.42;
const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.voice = null;
    this.startPending = false;
    this.desiredDrone = false;
    this.waveforms = ["triangle", "sawtooth"];
    this.synthBus = null;
    this.drumBus = null;
    this.noiseBuffer = null;
    this.frequency = INITIAL_FREQUENCY;
    this.timbre = Math.log(INITIAL_CUTOFF / MIN_CUTOFF) / Math.log(MAX_CUTOFF / MIN_CUTOFF);
  }

  get cutoff() {
    return MIN_CUTOFF * Math.pow(MAX_CUTOFF / MIN_CUTOFF, this.timbre);
  }

  async initialize() {
    if (this.context) {
      if (this.context.state !== "running") await this.context.resume();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is unavailable in this browser.");

    this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    this.synthBus = this.context.createGain();
    this.synthBus.gain.value = 0.9;
    const drive = this.context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index += 1) {
      const value = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(value * 1.45) / Math.tanh(1.45);
    }
    drive.curve = curve;
    drive.oversample = "2x";
    this.drumBus = this.context.createGain();
    const delay = this.context.createDelay(0.5);
    const feedback = this.context.createGain();
    const delayWet = this.context.createGain();
    delay.delayTime.value = 0.125;
    feedback.gain.value = 0.14;
    delayWet.gain.value = 0.08;

    // Synth 1/2 -> separate filters -> synth bus -> soft drive -> master.
    this.synthBus.connect(drive).connect(this.master);
    // Percussion -> drum bus -> dry master + a short, quiet feedback delay.
    this.drumBus.connect(this.master);
    this.drumBus.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(delayWet).connect(this.master);
    // Filter, drive, delay and compressor are the four effect stages.
    this.master.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    this.noiseBuffer = this.makeNoiseBuffer();
    await this.context.resume();
  }

  makeNoiseBuffer() {
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.22), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    return buffer;
  }

  async startDrone() {
    if (!this.context) return;
    this.desiredDrone = true;
    if (this.voice || this.startPending) return;
    this.startPending = true;
    try {
      if (this.context.state !== "running") await this.context.resume();
    } catch {
      this.desiredDrone = false;
      return;
    } finally {
      this.startPending = false;
    }
    if (!this.desiredDrone || this.voice) return;

    const now = this.context.currentTime;
    const fundamental = this.context.createOscillator();
    const color = this.context.createOscillator();
    const fundamentalGain = this.context.createGain();
    const colorGain = this.context.createGain();
    const filter1 = this.context.createBiquadFilter();
    const filter2 = this.context.createBiquadFilter();
    const gate1 = this.context.createGain();
    const gate2 = this.context.createGain();

    fundamental.type = this.waveforms[0];
    color.type = this.waveforms[1];
    fundamental.frequency.value = this.frequency;
    color.frequency.value = this.frequency;
    color.detune.value = 7;
    fundamentalGain.gain.value = 0.76;
    colorGain.gain.value = 0.16 + this.timbre * 0.52;
    filter1.type = "lowpass";
    filter2.type = "lowpass";
    filter1.frequency.value = this.cutoff;
    filter2.frequency.value = Math.min(MAX_CUTOFF, this.cutoff * 1.4);
    filter1.Q.value = 0.8;
    filter2.Q.value = 0.65;
    gate1.gain.setValueAtTime(0, now);
    gate2.gain.setValueAtTime(0, now);
    gate1.gain.linearRampToValueAtTime(0.22, now + ATTACK);
    gate2.gain.linearRampToValueAtTime(0.16, now + ATTACK);

    // Each selectable oscillator has its own channel, filter and envelope.
    fundamental.connect(fundamentalGain).connect(filter1).connect(gate1).connect(this.synthBus);
    color.connect(colorGain).connect(filter2).connect(gate2).connect(this.synthBus);
    fundamental.start(now);
    color.start(now);

    this.voice = { fundamental, color, fundamentalGain, colorGain, filter1, filter2, gate1, gate2, startedAt: now };
  }

  stopDrone() {
    this.desiredDrone = false;
    if (!this.context || !this.voice) return;
    const voice = this.voice;
    this.voice = null;
    const now = this.context.currentTime;
    for (const [gate, level] of [[voice.gate1, 0.22], [voice.gate2, 0.16]]) {
      const parameter = gate.gain;
      if (typeof parameter.cancelAndHoldAtTime === "function") {
        parameter.cancelAndHoldAtTime(now);
      } else {
        const current = level * clamp((now - voice.startedAt) / ATTACK, 0, 1);
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(current, now);
      }
      parameter.linearRampToValueAtTime(0, now + RELEASE);
    }
    voice.fundamental.stop(now + RELEASE + 0.02);
    voice.color.stop(now + RELEASE + 0.02);
    voice.color.onended = () => {
      voice.fundamental.disconnect();
      voice.color.disconnect();
      voice.fundamentalGain.disconnect();
      voice.colorGain.disconnect();
      voice.filter1.disconnect();
      voice.filter2.disconnect();
      voice.gate1.disconnect();
      voice.gate2.disconnect();
    };
  }

  cycleWave(channel) {
    const index = channel - 1;
    const current = WAVEFORMS.indexOf(this.waveforms[index]);
    this.waveforms[index] = WAVEFORMS[(current + 1) % WAVEFORMS.length];
    if (this.voice) (index === 0 ? this.voice.fundamental : this.voice.color).type = this.waveforms[index];
    return this.waveforms[index];
  }

  setParameters(frequency, timbre) {
    this.frequency = clamp(frequency, MIN_FREQUENCY, MAX_FREQUENCY);
    this.timbre = clamp(timbre, 0, 1);
    if (!this.voice || !this.context) return;

    const now = this.context.currentTime;
    const voice = this.voice;
    voice.fundamental.frequency.setTargetAtTime(this.frequency, now, 0.025);
    voice.color.frequency.setTargetAtTime(this.frequency, now, 0.025);
    voice.filter1.frequency.setTargetAtTime(this.cutoff, now, 0.035);
    voice.filter2.frequency.setTargetAtTime(Math.min(MAX_CUTOFF, this.cutoff * 1.4), now, 0.035);
    voice.colorGain.gain.setTargetAtTime(0.16 + this.timbre * 0.52, now, 0.035);
  }

  playHit(strength) {
    if (!this.context || this.context.state !== "running") return;
    const velocity = clamp(strength, 0, 1);
    const now = this.context.currentTime;
    const duration = 0.075 + velocity * 0.09;
    const output = this.context.createGain();
    const body = this.context.createOscillator();
    const metal = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    const metalGain = this.context.createGain();
    const noise = this.context.createBufferSource();
    const noiseFilter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();

    output.gain.value = 0.1 + velocity * 0.12;
    output.connect(this.drumBus);
    body.type = "sine";
    metal.type = "sine";
    const startFrequency = 430 + velocity * 700;
    body.frequency.setValueAtTime(startFrequency, now);
    body.frequency.exponentialRampToValueAtTime(startFrequency * 0.48, now + duration);
    metal.frequency.value = startFrequency * 1.59;
    bodyGain.gain.setValueAtTime(0.65, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    metalGain.gain.setValueAtTime(0.2 + velocity * 0.2, now);
    metalGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.72);

    noise.buffer = this.noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 2200 + velocity * 4600;
    noiseFilter.Q.value = 0.8;
    noiseGain.gain.setValueAtTime(0.12 + velocity * 0.23, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.57);

    // A pitched digital strike and a short band-passed noise burst bypass the drone filter.
    body.connect(bodyGain).connect(output);
    metal.connect(metalGain).connect(output);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    body.start(now);
    metal.start(now);
    noise.start(now);
    body.stop(now + duration + 0.01);
    metal.stop(now + duration + 0.01);
    noise.stop(now + duration + 0.01);
    noise.onended = () => {
      body.disconnect();
      metal.disconnect();
      noise.disconnect();
      bodyGain.disconnect();
      metalGain.disconnect();
      noiseFilter.disconnect();
      noiseGain.disconnect();
      output.disconnect();
    };
  }
}

class MicTransientDetector {
  constructor(engine, onHit) {
    this.engine = engine;
    this.onHit = onHit;
    this.stream = null;
    this.source = null;
    this.highpass = null;
    this.analyser = null;
    this.worklet = null;
    this.silentOutput = null;
    this.mode = "off";
    this.samples = null;
    this.timerId = 0;
    this.noiseFloor = 0.0015;
    this.previousRms = 0.0015;
    this.lastHitAt = -Infinity;
    this.suppressedUntil = -Infinity;
    this.armed = true;
    this.quietFrames = 0;
    this.scan = this.scan.bind(this);
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    await this.preferBuiltInMicrophone();
    this.source = this.engine.context.createMediaStreamSource(this.stream);
    this.highpass = this.engine.context.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 950;
    this.analyser = this.engine.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.samples = new Float32Array(this.analyser.fftSize);

    // Input is analyzed only; the microphone is never routed to speakers.
    this.source.connect(this.highpass).connect(this.analyser);
    if (this.engine.context.audioWorklet && window.AudioWorkletNode) {
      try {
        await this.engine.context.audioWorklet.addModule("./mic-processor.js");
        this.worklet = new AudioWorkletNode(this.engine.context, "contact-tap-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { threshold: MIC_THRESHOLD, cooldownMs: MIC_COOLDOWN },
        });
        this.silentOutput = this.engine.context.createGain();
        this.silentOutput.gain.value = 0;
        this.analyser.connect(this.worklet).connect(this.silentOutput).connect(this.engine.context.destination);
        this.worklet.port.onmessage = (event) => {
          if (event.data?.type === "tap" && !document.hidden && performance.now() > this.suppressedUntil) this.emitHit(event.data.strength);
        };
        this.mode = "worklet";
        return;
      } catch {
        this.worklet?.disconnect();
        this.silentOutput?.disconnect();
        this.worklet = null;
      }
    }

    // Older Safari versions use the same analyser with a short foreground poll.
    this.timerId = window.setInterval(this.scan, 8);
    this.mode = "analyser";
  }

  async preferBuiltInMicrophone() {
    if (!navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const builtIn = devices.find((device) => device.kind === "audioinput" && /macbook|built.in microphone|internal microphone/i.test(device.label));
      const selectedId = this.stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (!builtIn || !builtIn.deviceId || builtIn.deviceId === selectedId) return;
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: builtIn.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = replacement;
    } catch {
      // A renamed or inaccessible built-in input must not disable the instrument.
    }
  }

  suppressFor(milliseconds) {
    this.suppressedUntil = Math.max(this.suppressedUntil, performance.now() + milliseconds);
    this.worklet?.port.postMessage({ type: "suppress", ms: milliseconds });
  }

  emitHit(strength) {
    this.engine.playHit(strength);
    this.onHit(strength);
  }

  scan() {
    if (document.hidden || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    let peak = 0;
    let squareSum = 0;
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = Math.abs(this.samples[index]);
      peak = Math.max(peak, sample);
      squareSum += sample * sample;
    }
    const rms = Math.sqrt(squareSum / this.samples.length);
    const threshold = Math.max(MIC_THRESHOLD, this.noiseFloor * 3.5);
    const sharpRise = rms > Math.max(this.previousRms * 1.28, this.noiseFloor * 2.2);
    const impulsive = peak > Math.max(0.04, threshold * 2.1) && peak / Math.max(rms, 0.0001) > 2.15;
    const now = performance.now();

    if (this.armed && now > this.suppressedUntil && now - this.lastHitAt > MIC_COOLDOWN && rms > threshold && sharpRise && impulsive) {
      const strength = clamp((peak - 0.04) / 0.42, 0.08, 1);
      this.emitHit(strength);
      this.lastHitAt = now;
      this.armed = false;
      this.quietFrames = 0;
    }

    if (!this.armed) {
      this.quietFrames = rms < threshold * 0.72 ? this.quietFrames + 1 : 0;
      if (this.quietFrames >= 3) this.armed = true;
    }

    // Steady room sound is learned slowly, while sharp onsets never become baseline.
    if (rms < threshold || (!sharpRise && rms < threshold * 4)) {
      this.noiseFloor = lerp(this.noiseFloor, rms, rms < this.noiseFloor ? 0.04 : 0.002);
    }
    this.previousRms = lerp(this.previousRms, rms, 0.5);
  }

  stop() {
    clearInterval(this.timerId);
    this.source?.disconnect();
    this.highpass?.disconnect();
    this.analyser?.disconnect();
    this.worklet?.disconnect();
    this.silentOutput?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}

class PointerController {
  constructor(surface, engine, ui, mic) {
    this.surface = surface;
    this.engine = engine;
    this.ui = ui;
    this.mic = mic;
    this.activePointer = null;
    this.keyboardHeld = false;
    surface.addEventListener("pointerdown", (event) => this.onDown(event));
    window.addEventListener("pointermove", (event) => this.onMove(event));
    window.addEventListener("pointerup", (event) => this.onUp(event));
    window.addEventListener("pointercancel", (event) => this.onUp(event));
    window.addEventListener("mouseup", () => this.releasePointer());
    window.addEventListener("blur", () => this.releaseAll());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.releaseAll(); });
    document.addEventListener("keydown", (event) => this.onKeyDown(event));
    document.addEventListener("keyup", (event) => this.onKeyUp(event));
  }

  onDown(event) {
    if (event.target.closest(".speaker") || event.button !== 0 || !event.isPrimary || this.activePointer !== null) return;
    this.activePointer = event.pointerId;
    if (event.target === this.surface) this.surface.focus({ preventScroll: true });
    try { this.surface.setPointerCapture(event.pointerId); } catch { /* Window release remains a fallback. */ }
    this.mic.suppressFor(160); // Ignore the mechanical click that started the drone.
    this.engine.startDrone();
    this.ui.setHeld(true);
    this.ui.setTrackpadPosition(event.clientX, event.clientY);
  }

  onUp(event) {
    if (this.activePointer === event.pointerId) this.releasePointer();
  }

  onMove(event) {
    if (this.activePointer === event.pointerId) this.ui.setTrackpadPosition(event.clientX, event.clientY);
  }

  onKeyDown(event) {
    if (!this.surface.contains(event.target) || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === "Digit1" || event.code === "Digit2") {
      const channel = event.code === "Digit1" ? 1 : 2;
      const waveform = this.engine.cycleWave(channel);
      document.getElementById("announcement").textContent = `Synth ${channel}: ${waveform} wave.`;
      return;
    }
    if (event.code !== "Space" || event.target.closest(".speaker")) return;
    event.preventDefault();
    this.keyboardHeld = true;
    if (this.activePointer === null) {
      this.mic.suppressFor(160);
      this.engine.startDrone();
    }
    this.ui.setHeld(true);
  }

  onKeyUp(event) {
    if (event.code !== "Space" || !this.keyboardHeld) return;
    event.preventDefault();
    this.keyboardHeld = false;
    if (this.activePointer === null) {
      this.engine.stopDrone();
      this.ui.setHeld(false);
    }
  }

  releasePointer() {
    if (this.activePointer !== null) {
      try { this.surface.releasePointerCapture(this.activePointer); } catch { /* Capture may already be gone. */ }
      this.activePointer = null;
    }
    if (!this.keyboardHeld) {
      this.engine.stopDrone();
      this.ui.setHeld(false);
    }
  }

  releaseAll() {
    this.keyboardHeld = false;
    this.releasePointer();
  }
}

class ScrollController {
  constructor(engine, ui) {
    this.engine = engine;
    this.ui = ui;
    this.logFrequency = Math.log2(engine.frequency);
    window.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
  }

  onWheel(event) {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const deltaX = clamp(event.deltaX * unit, -180, 180);
    const deltaY = clamp(event.deltaY * unit, -180, 180);
    this.logFrequency = clamp(this.logFrequency - deltaY * 0.0025, Math.log2(MIN_FREQUENCY), Math.log2(MAX_FREQUENCY));
    const timbre = clamp(this.engine.timbre + deltaX * 0.0019, 0, 1);
    this.engine.setParameters(Math.pow(2, this.logFrequency), timbre);
    this.ui.setParameters(this.engine.frequency, this.engine.cutoff, this.engine.timbre);
    this.ui.onWheel(deltaX, deltaY);
  }
}

class UIRenderer {
  constructor() {
    this.surface = document.getElementById("surface");
    this.keyboard = document.getElementById("keyboard-display");
    this.canvas = document.getElementById("matrix-canvas");
    this.context = this.canvas.getContext("2d", { alpha: false });
    this.trackpad = document.getElementById("trackpad");
    this.leftSpeaker = document.getElementById("left-speaker");
    this.rightSpeaker = document.getElementById("right-speaker");
    this.pitchReadout = document.getElementById("pitch-readout");
    this.toneReadout = document.getElementById("tone-readout");
    this.held = false;
    this.pulses = [];
    this.frequency = INITIAL_FREQUENCY;
    this.cutoff = INITIAL_CUTOFF;
    this.timbre = Math.log(INITIAL_CUTOFF / MIN_CUTOFF) / Math.log(MAX_CUTOFF / MIN_CUTOFF);
    this.trackX = 50;
    this.trackY = 50;
    this.wheelTimer = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
    if (window.ResizeObserver) new ResizeObserver(this.resize).observe(this.keyboard);
    else window.addEventListener("resize", this.resize);
    this.resize();
    requestAnimationFrame(this.render);
  }

  resize() {
    const rect = this.keyboard.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.columns = Math.max(22, Math.floor(rect.width / 13));
    this.rows = Math.max(10, Math.floor(rect.height / 13));
  }

  setParameters(frequency, cutoff, timbre) {
    this.frequency = frequency;
    this.cutoff = cutoff;
    this.timbre = timbre;
    this.pitchReadout.textContent = `${Math.round(frequency)} HZ`;
    this.toneReadout.textContent = cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)} KHZ` : `${Math.round(cutoff)} HZ`;
  }

  setHeld(held) {
    this.held = held;
    this.surface.classList.toggle("is-held", held);
    this.trackpad.classList.toggle("is-active", held);
  }

  setTrackpadPosition(clientX, clientY) {
    const rect = this.trackpad.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    this.trackX = clamp(inside ? (clientX - rect.left) / rect.width * 100 : clientX / window.innerWidth * 100, 6, 94);
    this.trackY = clamp(inside ? (clientY - rect.top) / rect.height * 100 : clientY / window.innerHeight * 100, 8, 92);
    this.setTrackpadPoint();
  }

  setTrackpadPoint() {
    this.trackpad.style.setProperty("--track-x", `${this.trackX.toFixed(1)}%`);
    this.trackpad.style.setProperty("--track-y", `${this.trackY.toFixed(1)}%`);
  }

  onWheel(deltaX, deltaY) {
    this.trackX = clamp(this.trackX + deltaX * 0.08, 6, 94);
    this.trackY = clamp(this.trackY + deltaY * 0.08, 8, 92);
    this.setTrackpadPoint();
    this.trackpad.classList.add("is-wheel");
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => this.trackpad.classList.remove("is-wheel"), 420);
  }

  hit(strength, side = "both") {
    const now = performance.now();
    this.pulses.push({ startedAt: now, side, strength });
    const speakers = side === "both" ? [this.leftSpeaker, this.rightSpeaker] : [side === "left" ? this.leftSpeaker : this.rightSpeaker];
    for (const speaker of speakers) {
      speaker.classList.remove("is-struck");
      void speaker.offsetWidth;
      speaker.classList.add("is-struck");
      window.setTimeout(() => speaker.classList.remove("is-struck"), 260);
    }
  }

  render(time) {
    if (!this.width || !this.height) { requestAnimationFrame(this.render); return; }
    const ctx = this.context;
    ctx.fillStyle = "#05090b";
    ctx.fillRect(0, 0, this.width, this.height);
    const stepX = this.width / (this.columns + 1);
    const stepY = this.height / (this.rows + 1);
    const middle = (this.rows + 1) / 2;
    const normalizedPitch = Math.log(this.frequency / MIN_FREQUENCY) / Math.log(MAX_FREQUENCY / MIN_FREQUENCY);
    const center = middle + (0.5 - normalizedPitch) * this.rows * 0.37;
    const amplitude = 1.4 + this.timbre * this.rows * 0.16;
    const movement = this.reducedMotion.matches ? 0 : time * 0.003;
    this.pulses = this.pulses.filter((pulse) => time - pulse.startedAt < 720);

    for (let row = 1; row <= this.rows; row += 1) {
      for (let column = 1; column <= this.columns; column += 1) {
        const x = column * stepX;
        const y = row * stepY;
        let energy = 0.045;
        if (this.held) {
          const waveY = center + Math.sin(column * (0.2 + normalizedPitch * 0.16) - movement) * amplitude;
          const distance = Math.abs(row - waveY);
          if (distance < 3.4) energy += Math.pow(1 - distance / 3.4, 2) * (0.58 + this.timbre * 0.25);
        }
        for (const pulse of this.pulses) {
          const progress = (time - pulse.startedAt) / 650;
          const distanceFromEdge = pulse.side === "right" ? this.columns + 1 - column : column;
          const front = progress * (this.columns * 0.56);
          const edgeDistance = Math.abs(distanceFromEdge - front);
          if (pulse.side === "both") {
            const rightDistance = Math.abs(this.columns + 1 - column - front);
            if (Math.min(edgeDistance, rightDistance) > 4) continue;
            energy += Math.max(0, 1 - Math.min(edgeDistance, rightDistance) / 4) * pulse.strength * (0.45 + 0.5 * Math.max(0, 1 - Math.abs(row - middle) / middle));
          } else if (edgeDistance < 4) {
            energy += (1 - edgeDistance / 4) * pulse.strength * (0.45 + 0.5 * Math.max(0, 1 - Math.abs(row - middle) / middle));
          }
        }
        const alpha = clamp(energy, 0.045, 1);
        ctx.beginPath();
        ctx.arc(x, y, alpha > 0.3 ? 2.05 : 1.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(28, 225, 255, ${alpha.toFixed(3)})`;
        ctx.shadowBlur = alpha > 0.3 ? 9 : 0;
        ctx.shadowColor = "#00dfff";
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(this.render);
  }
}

const audioEngine = new AudioEngine();
let instrumentStarted = false;
let instrumentStarting = false;

async function startInstrument() {
  if (instrumentStarted || instrumentStarting) return;
  instrumentStarting = true;
  const button = document.getElementById("start-button");
  const startNote = document.getElementById("start-note");
  const status = document.getElementById("mic-status");
  const announcement = document.getElementById("announcement");
  button.disabled = true;
  startNote.textContent = "OPENING AUDIO";

  try {
    await audioEngine.initialize();
  } catch (error) {
    startNote.textContent = error.message || "AUDIO COULD NOT START";
    button.disabled = false;
    instrumentStarting = false;
    return;
  }

  const ui = new UIRenderer();
  const mic = new MicTransientDetector(audioEngine, (strength) => ui.hit(strength, "both"));
  new PointerController(document.getElementById("surface"), audioEngine, ui, mic);
  new ScrollController(audioEngine, ui);
  for (const side of ["left", "right"]) {
    const speaker = document.getElementById(`${side}-speaker`);
    const strike = (strength) => {
      mic.suppressFor(280); // Avoid hearing our own percussion from the speakers.
      audioEngine.playHit(strength);
      ui.hit(strength, side);
    };
    speaker.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.stopPropagation();
      strike(clamp(0.45 + event.pressure * 0.7, 0.45, 1));
    });
    speaker.addEventListener("click", (event) => { if (event.detail === 0) strike(0.65); });
  }
  status.textContent = "MIC · CONNECTING";
  startNote.textContent = "REQUESTING MICROPHONE";

  try {
    await mic.start();
    const inputLabel = mic.stream.getAudioTracks()[0]?.label || "";
    status.textContent = /macbook|built.in microphone|internal microphone/i.test(inputLabel) ? "MIC · BUILT-IN" : "MIC · LISTENING";
    status.title = `${inputLabel || "Default microphone"} · ${mic.mode}`;
    status.dataset.detector = mic.mode;
    announcement.textContent = "Instrument ready. Microphone listening.";
  } catch {
    mic.stop();
    status.textContent = "MIC UNAVAILABLE · TOUCH ACTIVE";
    announcement.textContent = "Microphone unavailable — touch controls still active.";
  }

  instrumentStarted = true;
  instrumentStarting = false;
  document.getElementById("start-screen").classList.add("is-hidden");
  document.getElementById("start-screen").setAttribute("aria-hidden", "true");
  document.getElementById("surface").focus({ preventScroll: true });
  window.addEventListener("pagehide", () => { mic.stop(); audioEngine.stopDrone(); }, { once: true });
}

document.getElementById("start-button").addEventListener("click", startInstrument, { once: false });
