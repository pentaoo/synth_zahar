// Runs on the Web Audio render thread so a short chassis tap is not missed
// between display frames. The output is always silent.
class ContactTapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions || {};
    this.threshold = settings.threshold || 0.012;
    this.cooldownFrames = sampleRate * (settings.cooldownMs || 230) / 1000;
    this.noiseFloor = 0.0015;
    this.previousRms = 0.0015;
    this.lastHitFrame = -Infinity;
    this.suppressedUntilFrame = -Infinity;
    this.warmupUntilFrame = currentFrame + sampleRate * 0.25;
    this.armed = true;
    this.quietBlocks = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "suppress") {
        this.suppressedUntilFrame = Math.max(this.suppressedUntilFrame, currentFrame + sampleRate * event.data.ms / 1000);
      }
      if (event.data?.type === "threshold") this.threshold = event.data.value;
    };
  }

  process(inputs, outputs) {
    for (const output of outputs[0] || []) output.fill(0);
    const samples = inputs[0]?.[0];
    if (!samples?.length) return true;

    let peak = 0;
    let squareSum = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const value = Math.abs(samples[index]);
      if (value > peak) peak = value;
      squareSum += value * value;
    }
    const rms = Math.sqrt(squareSum / samples.length);
    const threshold = Math.max(this.threshold, this.noiseFloor * 3.5);
    const sharpRise = rms > Math.max(this.previousRms * 1.55, this.noiseFloor * 2.4);
    const impulsive = peak > Math.max(0.04, threshold * 2.1) && peak / Math.max(rms, 0.00001) > 2.15;

    if (this.armed && currentFrame > this.warmupUntilFrame && currentFrame > this.suppressedUntilFrame && currentFrame - this.lastHitFrame > this.cooldownFrames && rms > threshold && sharpRise && impulsive) {
      const strength = Math.min(1, Math.max(0.08, (peak - 0.04) / 0.42));
      this.port.postMessage({ type: "tap", strength });
      this.lastHitFrame = currentFrame;
      this.armed = false;
      this.quietBlocks = 0;
    }

    if (!this.armed) {
      this.quietBlocks = rms < threshold * 0.72 ? this.quietBlocks + 1 : 0;
      if (this.quietBlocks >= 4) this.armed = true;
    }

    // A steady loud room is learned slowly; a sharp attack never becomes baseline.
    if (rms < threshold || (!sharpRise && rms < threshold * 4)) {
      const speed = rms < this.noiseFloor ? 0.025 : 0.0015;
      this.noiseFloor += (rms - this.noiseFloor) * speed;
    }
    this.previousRms = rms;
    return true;
  }
}

registerProcessor("contact-tap-processor", ContactTapProcessor);
