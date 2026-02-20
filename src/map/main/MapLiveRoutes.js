import { useId, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';
import { map } from '../core/mapInstance';
import { useAttributePreference } from '../../common/util/preferences';
import { resolveDeviceReportColor } from '../../common/util/reportColor';

const buildTrailSegments = (coordinates, maxOpacity) => {
  if (!coordinates || coordinates.length < 2) {
    return [];
  }

  const segmentCount = coordinates.length - 1;
  const minOpacity = Math.max(0.08, maxOpacity * 0.18);

  return Array.from({ length: segmentCount }, (_, index) => {
    const progress = segmentCount === 1 ? 1 : index / (segmentCount - 1);
    const opacity = minOpacity + progress * (maxOpacity - minOpacity);
    return {
      coordinates: [coordinates[index], coordinates[index + 1]],
      opacity,
      sortKey: index,
    };
  });
};

const ROUTE_TRANSITION_DURATION_MS = 2400;
const MIN_ROUTE_TRANSITION_DURATION_MS = 1800;
const MAX_ROUTE_TRANSITION_DURATION_MS = 12000;
const EARTH_RADIUS_METERS = 6371000;
const easeInOutQuad = (value) => (value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2);

const toRadians = (value) => value * (Math.PI / 180);

const calculateDistanceMeters = (from, to) => {
  if (!from || !to) {
    return 0;
  }
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
    return 0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a = sinDLat * sinDLat
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resolveRouteTransitionDuration = (from, to) => {
  const distanceMeters = calculateDistanceMeters(from, to);
  const speedKnots = Number(to?.speed);
  const speedMps = Number.isFinite(speedKnots) ? Math.max(0, speedKnots) * 0.514444 : null;
  const durationBySpeed = speedMps && speedMps > 0.3 && distanceMeters > 0
    ? (distanceMeters / speedMps) * 1000
    : null;

  const fromTs = parseTimestamp(from?.fixTime);
  const toTs = parseTimestamp(to?.fixTime);
  const deltaMs = fromTs != null && toTs != null ? Math.max(0, toTs - fromTs) : null;
  const durationByTime = deltaMs && deltaMs > 0 ? deltaMs * 0.9 : null;

  const rawDuration = durationBySpeed || durationByTime || ROUTE_TRANSITION_DURATION_MS;
  return clamp(rawDuration, MIN_ROUTE_TRANSITION_DURATION_MS, MAX_ROUTE_TRANSITION_DURATION_MS);
};

const isSameRoutePoint = (left, right) => {
  if (!left || !right) {
    return false;
  }
  return left.longitude === right.longitude
    && left.latitude === right.latitude
    && left.fixTime === right.fixTime;
};

const resolveLagRouteDuration = (from, to, lookAhead) => {
  const toTs = parseTimestamp(to?.fixTime);
  const lookAheadTs = parseTimestamp(lookAhead?.fixTime);
  if (toTs != null && lookAheadTs != null && lookAheadTs > toTs) {
    return clamp(
      (lookAheadTs - toTs) * 0.98,
      MIN_ROUTE_TRANSITION_DURATION_MS,
      MAX_ROUTE_TRANSITION_DURATION_MS,
    );
  }
  return resolveRouteTransitionDuration(from, to);
};

const MapLiveRoutes = () => {
  const id = useId();

  const theme = useTheme();

  const type = useAttributePreference('mapLiveRoutes', 'none');

  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const groups = useSelector((state) => state.groups.items);
  const positions = useSelector((state) => state.session.positions);

  const history = useSelector((state) => state.session.history);

  const selectedRawRef = useRef(null);
  const selectedAnimatedRef = useRef(null);
  const selectedTransitionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const renderRoutesRef = useRef(() => {});
  const selectedDeviceKeyRef = useRef(null);
  const selectedLagQueueRef = useRef([]);
  const startLagAnimationRef = useRef(() => {});

  const mapLineWidth = useAttributePreference('mapLineWidth', 5);
  const mapLineOpacity = useAttributePreference('mapLineOpacity', 1);

  const stopRouteAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (type !== 'none') {
      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
      map.addLayer({
        source: id,
        id,
        type: 'line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'line-sort-key': ['get', 'sortKey'],
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });

      return () => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      };
    }
    return () => {};
  }, [type]);

  const renderRoutes = useCallback(() => {
    if (type === 'none') {
      return;
    }

    const interpolatedSelected = selectedAnimatedRef.current;
    const selectedDeviceKey = selectedDeviceId != null ? String(selectedDeviceId) : null;

    const deviceIds = Object.values(devices)
      .map((device) => device.id)
      .filter((deviceId) => (type === 'selected' ? String(deviceId) === selectedDeviceKey : true))
      .filter((deviceId) => history.hasOwnProperty(deviceId));

    map.getSource(id)?.setData({
      type: 'FeatureCollection',
      features: deviceIds.flatMap((deviceId) => {
        let coordinates = history[deviceId];
        if (!coordinates || coordinates.length < 2) {
          return [];
        }

        if (selectedDeviceKey && String(deviceId) === selectedDeviceKey && interpolatedSelected) {
          const lagQueueSize = selectedLagQueueRef.current.length;
          const pointsToHide = lagQueueSize > 1 ? lagQueueSize - 1 : 0;
          if (pointsToHide > 0) {
            if (coordinates.length > pointsToHide) {
              coordinates = coordinates.slice(0, -pointsToHide);
            } else {
              coordinates = coordinates.slice(0, 1);
            }
          }

          const dynamicTail = [interpolatedSelected.longitude, interpolatedSelected.latitude];
          const lastCoordinate = coordinates.at(-1);
          if (!lastCoordinate
            || lastCoordinate[0] !== dynamicTail[0]
            || lastCoordinate[1] !== dynamicTail[1]) {
            coordinates = [...coordinates, dynamicTail];
          }
        }

        const color = resolveDeviceReportColor(devices[deviceId], groups) || theme.palette.geometry.main;
        return buildTrailSegments(coordinates, mapLineOpacity).map((segment) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: segment.coordinates,
          },
          properties: {
            color,
            width: mapLineWidth,
            opacity: segment.opacity,
            sortKey: segment.sortKey,
          },
        }));
      }),
    });
  }, [type, selectedDeviceId, devices, history, groups, theme, mapLineOpacity, mapLineWidth, id]);

  useEffect(() => {
    renderRoutesRef.current = renderRoutes;
    renderRoutes();
  }, [renderRoutes]);

  const resetRouteLagState = useCallback(() => {
    stopRouteAnimation();
    selectedLagQueueRef.current = [];
    selectedRawRef.current = null;
    selectedAnimatedRef.current = null;
    selectedTransitionRef.current = null;
  }, [stopRouteAnimation]);

  const startLagRouteAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      return;
    }

    const queue = selectedLagQueueRef.current;
    if (queue.length < 3) {
      return;
    }

    const from = queue[0];
    const to = queue[1];
    const lookAhead = queue[2];
    const transitionStart = selectedAnimatedRef.current || from;

    selectedTransitionRef.current = {
      from: transitionStart,
      to,
      startTime: performance.now(),
      duration: resolveLagRouteDuration(from, to, lookAhead),
    };

    const animate = (frameTime) => {
      const transition = selectedTransitionRef.current;
      if (!transition) {
        animationFrameRef.current = null;
        return;
      }

      const rawProgress = Math.min(1, (frameTime - transition.startTime) / transition.duration);
      const progress = easeInOutQuad(rawProgress);

      selectedAnimatedRef.current = {
        longitude: transition.from.longitude + ((transition.to.longitude - transition.from.longitude) * progress),
        latitude: transition.from.latitude + ((transition.to.latitude - transition.from.latitude) * progress),
        speed: transition.to.speed,
        fixTime: transition.to.fixTime,
      };

      renderRoutesRef.current();

      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        selectedTransitionRef.current = null;
        selectedAnimatedRef.current = transition.to;
        selectedRawRef.current = transition.to;
        if (selectedLagQueueRef.current.length > 0) {
          selectedLagQueueRef.current.shift();
        }
        renderRoutesRef.current();
        animationFrameRef.current = null;
        startLagAnimationRef.current();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  startLagAnimationRef.current = startLagRouteAnimation;

  useEffect(() => {
    if (type === 'none') {
      selectedDeviceKeyRef.current = null;
      resetRouteLagState();
      return undefined;
    }

    const selectedDeviceKey = selectedDeviceId != null ? String(selectedDeviceId) : null;
    if (selectedDeviceKeyRef.current !== selectedDeviceKey) {
      selectedDeviceKeyRef.current = selectedDeviceKey;
      resetRouteLagState();
    }

    const selectedPosition = selectedDeviceKey ? positions[selectedDeviceKey] : null;

    if (!selectedDeviceKey || !selectedPosition) {
      selectedDeviceKeyRef.current = null;
      resetRouteLagState();
      renderRoutesRef.current();
      return undefined;
    }

    const nextRawPosition = {
      longitude: selectedPosition.longitude,
      latitude: selectedPosition.latitude,
      speed: selectedPosition.speed,
      fixTime: selectedPosition.fixTime,
    };

    const queue = selectedLagQueueRef.current;
    if (!queue.length) {
      queue.push(nextRawPosition);
      selectedRawRef.current = nextRawPosition;
      selectedAnimatedRef.current = nextRawPosition;
      selectedTransitionRef.current = null;
      renderRoutesRef.current();
      return undefined;
    }

    const lastQueued = queue[queue.length - 1];
    if (isSameRoutePoint(lastQueued, nextRawPosition)) {
      return undefined;
    }

    queue.push(nextRawPosition);

    // Hold one point behind until we have look-ahead point.
    if (queue.length === 2) {
      selectedRawRef.current = queue[0];
      selectedAnimatedRef.current = queue[0];
      selectedTransitionRef.current = null;
      renderRoutesRef.current();
      return undefined;
    }

    startLagAnimationRef.current();
    return undefined;
  }, [type, selectedDeviceId, positions, resetRouteLagState]);

  useEffect(() => () => {
    stopRouteAnimation();
  }, [stopRouteAnimation]);

  return null;
};

export default MapLiveRoutes;
