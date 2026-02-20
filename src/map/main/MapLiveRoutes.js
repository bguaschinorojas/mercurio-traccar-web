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

const ROUTE_TRANSITION_DURATION_MS = 1100;
const easeInOutQuad = (value) => (value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2);

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
          const lastCoordinate = coordinates.at(-1);
          if (!lastCoordinate
            || lastCoordinate[0] !== interpolatedSelected.longitude
            || lastCoordinate[1] !== interpolatedSelected.latitude) {
            coordinates = [...coordinates, [interpolatedSelected.longitude, interpolatedSelected.latitude]];
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

  useEffect(() => {
    if (type === 'none') {
      stopRouteAnimation();
      selectedDeviceKeyRef.current = null;
      selectedRawRef.current = null;
      selectedAnimatedRef.current = null;
      selectedTransitionRef.current = null;
      return undefined;
    }

    const selectedDeviceKey = selectedDeviceId != null ? String(selectedDeviceId) : null;
    if (selectedDeviceKeyRef.current !== selectedDeviceKey) {
      selectedDeviceKeyRef.current = selectedDeviceKey;
      stopRouteAnimation();
      selectedRawRef.current = null;
      selectedAnimatedRef.current = null;
      selectedTransitionRef.current = null;
    }

    const selectedPosition = selectedDeviceKey ? positions[selectedDeviceKey] : null;

    if (!selectedDeviceKey || !selectedPosition) {
      stopRouteAnimation();
      selectedDeviceKeyRef.current = null;
      selectedRawRef.current = null;
      selectedAnimatedRef.current = null;
      selectedTransitionRef.current = null;
      renderRoutesRef.current();
      return undefined;
    }

    const nextRawPosition = {
      longitude: selectedPosition.longitude,
      latitude: selectedPosition.latitude,
    };

    const previousRawPosition = selectedRawRef.current;
    const moved = previousRawPosition
      && (previousRawPosition.longitude !== nextRawPosition.longitude
        || previousRawPosition.latitude !== nextRawPosition.latitude);

    if (!moved) {
      selectedAnimatedRef.current = nextRawPosition;
      selectedTransitionRef.current = null;
      selectedRawRef.current = nextRawPosition;
      renderRoutesRef.current();
      return undefined;
    }

    const transitionStart = selectedAnimatedRef.current || previousRawPosition;
    selectedTransitionRef.current = {
      from: transitionStart,
      to: nextRawPosition,
      startTime: performance.now(),
      duration: ROUTE_TRANSITION_DURATION_MS,
    };
    selectedRawRef.current = nextRawPosition;

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
      };

      renderRoutesRef.current();

      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        selectedTransitionRef.current = null;
        selectedAnimatedRef.current = transition.to;
        renderRoutesRef.current();
        animationFrameRef.current = null;
      }
    };

    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return undefined;
  }, [type, selectedDeviceId, positions, stopRouteAnimation]);

  useEffect(() => () => {
    stopRouteAnimation();
  }, [stopRouteAnimation]);

  return null;
};

export default MapLiveRoutes;
