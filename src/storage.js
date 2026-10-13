export const STORAGE_KEY = 'plan-jump-deluxe-v2';
export function loadPreferences(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    const cleanRecords = {};
    if (value?.records && typeof value.records === 'object' && !Array.isArray(value.records)) {
      for (const [key, times] of Object.entries(value.records)) {
        if (!/^(cruise|rush|storm):(keys|touch|camera)$/.test(key) || !Array.isArray(times)) continue;
        cleanRecords[key] = times.filter(time => Number.isFinite(time) && time > 0).sort((a, b) => a - b).slice(0, 5);
      }
    }
    return { difficulty: ['cruise', 'rush', 'storm'].includes(value?.difficulty) ? value.difficulty : 'cruise', sound: value?.sound === true, records: cleanRecords };
  } catch { return { difficulty: 'cruise', sound: false, records: {} }; }
}
export function savePreferences(value, storage) {
  try { storage ??= globalThis.localStorage; storage?.setItem(STORAGE_KEY, JSON.stringify(value)); return Boolean(storage); }
  catch { return false; }
}
