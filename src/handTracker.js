export class HandTracker {
  constructor({ onChange = () => {}, mediaDevices, workerFactory, videoFactory } = {}) {
    this.onChange = onChange;
    this.mediaDevices = mediaDevices;
    this.workerFactory = workerFactory;
    this.videoFactory = videoFactory;
    this.generation = 0;
    this.ready = false;
    this.active = false;
    this.x = 0.5;
    this.error = null;
    this.stream = null;
    this.worker = null;
    this.video = null;
    this.timer = null;
    this.busy = false;
  }

  async start() {
    this.stop();
    const generation = ++this.generation;
    this.error = null;
    this.onChange('starting');
    try {
      const devices = this.mediaDevices || navigator.mediaDevices;
      if (!devices?.getUserMedia) throw new Error('Camera controls need HTTPS and a supported browser.');
      const stream = await devices.getUserMedia({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false });
      // A permission request can resolve long after the user leaves. Never retain
      // its stream if that particular start has already been cancelled.
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const video = this.videoFactory ? this.videoFactory() : document.createElement('video');
      this.video = video;
      video.autoplay = true; video.playsInline = true; video.muted = true; video.srcObject = stream;
      await video.play();
      if (generation !== this.generation) return;
      // MediaPipe's WASM loader uses importScripts, so this is a classic worker.
      const worker = this.workerFactory ? this.workerFactory() : new Worker(new URL('./camera-worker.js', import.meta.url));
      this.worker = worker;
      const startupTimeout = setTimeout(() => this.fail('The hand model could not load. Keyboard and touch controls still work.', generation), 60000);
      this.startupTimeout = startupTimeout;
      worker.onerror = () => this.fail('Camera tracking is unavailable. Use the keyboard or touch buttons.', generation);
      worker.onmessage = event => {
        if (generation !== this.generation) return;
        if (event.data.type === 'progress') this.onChange('starting', event.data.message);
        else if (event.data.type === 'ready') {
          clearTimeout(startupTimeout);
          this.ready = true;
          this.onChange('ready');
          this.schedule(generation);
        } else if (event.data.type === 'result') {
          if (event.data.failed) { this.fail('Hand tracking is unavailable. Keyboard and touch controls still work.', generation); return; }
          this.busy = false;
          this.active = event.data.active;
          if (this.active) this.x = this.x * 0.25 + (1 - event.data.x) * 0.75;
          this.onChange(this.active ? 'tracking' : 'ready');
        } else if (event.data.type === 'error') this.fail(event.data.message, generation);
      };
      worker.postMessage({ type: 'init' });
    } catch (error) {
      if (generation === this.generation) this.fail(error.name === 'NotAllowedError' ? 'Camera permission declined. Keyboard and touch controls still work.' : 'Camera unavailable. Keyboard and touch controls still work.', generation);
    }
  }

  schedule(generation) {
    this.timer = setInterval(async () => {
      if (generation !== this.generation || this.busy || !this.ready || !this.video || this.video.readyState < 2) return;
      this.busy = true;
      try {
        const frame = await createImageBitmap(this.video);
        if (generation !== this.generation || !this.worker) { frame.close(); return; }
        this.worker.postMessage({ type: 'frame', frame, timestamp: performance.now() }, [frame]);
      } catch { this.busy = false; }
    }, 66); // Work stays off the game thread; 15 camera samples/sec is enough to steer.
  }

  fail(message, generation) {
    if (generation !== this.generation) return;
    this.stop(); this.error = message; this.onChange('error', message);
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.startupTimeout); clearInterval(this.timer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.worker?.terminate();
    if (this.video) { this.video.srcObject = null; this.video.remove?.(); }
    this.video = null; this.stream = null; this.worker = null;
    this.ready = false; this.active = false; this.busy = false;
    this.onChange('off');
  }
}
