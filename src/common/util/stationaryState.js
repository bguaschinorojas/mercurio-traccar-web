const STORAGE_KEY = 'cerbero.stationaryState.v1';
const MAX_RECORD_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const trackers = new Map();

const nowMs = () => Date.now();

const toTimestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : nowMs();
};

const toRadians = (value) => (value * Math.PI) / 180;

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  if ([lat1, lon1, lat2, lon2].some((value) => typeof value !== 'number' || Number.isNaN(value))) {
    return Infinity;
  }
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const persistTrackers = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const payload = Object.fromEntries(trackers.entries());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
};

const loadTrackers = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    Object.entries(parsed).forEach(([deviceId, record]) => {
      if (!record || typeof record !== 'object') {
        return;
      }
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      const stoppedSince = Number(record.stoppedSince);
      const lastSeen = Number(record.lastSeen);
      if (![latitude, longitude, stoppedSince, lastSeen].every(Number.isFinite)) {
        return;
      }
      if (nowMs() - lastSeen > MAX_RECORD_AGE_MS) {
        return;
      }
      trackers.set(String(deviceId), {
        latitude,
        longitude,
        stoppedSince,
        lastSeen,
      });
    });
  } catch {
    // Ignore parse errors
  }
};

loadTrackers();

export const clearStationaryState = (deviceId) => {
  trackers.delete(String(deviceId));
  persistTrackers();
};

export const updateStationaryState = ({
  deviceId,
  latitude,
  longitude,
  speedKmh,
  fixTime,
  radiusMeters = 30,
  parkedAfterMs = 10 * 60 * 1000,
}) => {
  const normalizedDeviceId = String(deviceId);
  const normalizedSpeed = Number.isFinite(Number(speedKmh)) ? Math.max(0, Number(speedKmh)) : 0;
  const fixTimestamp = toTimestamp(fixTime);
  const currentTimestamp = nowMs();

  if (normalizedSpeed > 0) {
    clearStationaryState(normalizedDeviceId);
    return {
      markerState: 'moving',
      stoppedSince: null,
    };
  }

  const currentLatitude = Number(latitude);
  const currentLongitude = Number(longitude);
  const existing = trackers.get(normalizedDeviceId);

  let stoppedSince = fixTimestamp;
  if (existing) {
    const sameArea = distanceMeters(
      existing.latitude,
      existing.longitude,
      currentLatitude,
      currentLongitude,
    ) <= radiusMeters;
    stoppedSince = sameArea ? existing.stoppedSince : fixTimestamp;
  }

  trackers.set(normalizedDeviceId, {
    latitude: currentLatitude,
    longitude: currentLongitude,
    stoppedSince,
    lastSeen: currentTimestamp,
  });
  persistTrackers();

  return {
    markerState: (currentTimestamp - stoppedSince) >= parkedAfterMs ? 'parked' : 'stopped',
    stoppedSince,
  };
};
