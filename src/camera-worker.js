let landmarker;
self.onmessage = async event => {
  const { type, frame, timestamp } = event.data;
  if (type === 'init') {
    try {
      self.postMessage({ type: 'progress', message: 'Loading hand tracking… keyboard and touch still work.' });
      const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs');
      self.postMessage({ type: 'progress', message: 'Loading the camera model… keyboard and touch still work.' });
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
        runningMode: 'VIDEO', numHands: 1,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: 'Hand tracking could not load. Keyboard and touch controls still work.', detail: error?.message }); }
  } else if (type === 'frame') {
    try {
      const result = landmarker?.detectForVideo(frame, timestamp);
      const tip = result?.landmarks?.[0]?.[8];
      self.postMessage({ type: 'result', active: Boolean(tip), x: tip?.x ?? 0.5 });
    } catch { self.postMessage({ type: 'result', active: false, failed: true }); }
    finally { frame?.close(); }
  }
};
