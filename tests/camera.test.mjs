import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker } from '../src/handTracker.js';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function cameraHarness(getUserMedia) {
  const events = [];
  const stream = { stopped: 0, getTracks() { return [{ stop: () => { stream.stopped++; } }]; } };
  const worker = { terminated: false, messages: [], postMessage(message) { this.messages.push(message); }, terminate() { this.terminated = true; } };
  const video = { srcObject: null, readyState: 0, play: async () => {}, remove() { this.removed = true; } };
  const tracker = new HandTracker({ mediaDevices: { getUserMedia: getUserMedia || (async () => stream) }, videoFactory: () => video, workerFactory: () => worker, onChange: state => events.push(state) });
  return { tracker, stream, worker, video, events };
}
test('permission resolving after stop immediately releases the camera', async () => {
  const permission = deferred(); const harness = cameraHarness(() => permission.promise);
  const starting = harness.tracker.start(); harness.tracker.stop(); permission.resolve(harness.stream); await starting;
  assert.equal(harness.stream.stopped, 1); assert.equal(harness.tracker.ready, false);
  assert.equal(harness.tracker.worker, null); assert.equal(harness.tracker.stream, null);
});
test('stopping while video playback starts cannot create a worker later', async () => {
  const playback = deferred(); const harness = cameraHarness(); harness.video.play = () => playback.promise;
  const starting = harness.tracker.start(); await Promise.resolve(); harness.tracker.stop(); playback.resolve(); await starting;
  assert.equal(harness.stream.stopped, 1); assert.equal(harness.worker.messages.length, 0); assert.equal(harness.tracker.ready, false);
});
test('stopping before the hand model loads ignores stale ready callbacks', async () => {
  const harness = cameraHarness(); await harness.tracker.start();
  const callback = harness.worker.onmessage; harness.tracker.stop(); callback({ data: { type: 'ready' } });
  assert.equal(harness.worker.terminated, true); assert.equal(harness.stream.stopped, 1);
  assert.equal(harness.tracker.ready, false); assert.equal(harness.video.srcObject, null);
});
test('worker failure releases the stream and preserves keyboard fallback', async () => {
  const harness = cameraHarness(); await harness.tracker.start(); harness.worker.onerror();
  assert.equal(harness.stream.stopped, 1); assert.equal(harness.worker.terminated, true);
  assert.ok(harness.tracker.error.includes('keyboard')); assert.equal(harness.events.at(-1), 'error');
});
test('denied permission is handled without an unhandled rejection', async () => {
  const harness = cameraHarness(async () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; });
  await harness.tracker.start(); assert.equal(harness.tracker.ready, false); assert.ok(harness.tracker.error.includes('declined'));
});
test('inference failure closes the camera and returns to normal controls', async () => {
  const harness = cameraHarness(); await harness.tracker.start();
  harness.worker.onmessage({ data: { type: 'result', active: false, failed: true } });
  assert.equal(harness.stream.stopped, 1); assert.equal(harness.worker.terminated, true);
  assert.equal(harness.tracker.ready, false); assert.ok(harness.tracker.error.includes('touch'));
});
