import { useId, useCallback, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { map } from './core/mapInstance';
import { formatTime, getStatusColor } from '../common/util/formatter';
import {
  mapIconKey,
  mapImages,
  normalizeCustomColorKey,
  ensureCustomColorIcons,
} from './core/preloadImages';
import { useAttributePreference } from '../common/util/preferences';
import { useCatchCallback } from '../reactHelper';
import { findFonts } from './core/mapUtil';
import { updateStationaryState } from '../common/util/stationaryState';
import { resolveDeviceReportColor } from '../common/util/reportColor';

const POSITION_TRANSITION_DURATION_MS = 1100;

const easeInOutQuad = (value) => (value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2);

const interpolateAngle = (from, to, progress) => {
  const fromValue = Number.isFinite(from) ? from : 0;
  const toValue = Number.isFinite(to) ? to : fromValue;
  const shortestDelta = ((toValue - fromValue + 540) % 360) - 180;
  return (fromValue + shortestDelta * progress + 360) % 360;
};

const MapPositions = ({ positions, onMapClick, onMarkerClick, showStatus, selectedPosition, titleField }) => {
  const id = useId();
  const clusters = `${id}-clusters`;
  const selected = `${id}-selected`;

  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const iconScale = useAttributePreference('iconScale', desktop ? 0.75 : 1);
  const directionIconScale = 1;
  const directionOutlineIconScale = 1.14;
  const squareShadowIconScale = 1.22;
  const squareOutlineIconScale = 1.14;
  const squareIconScale = 1;
  const labelOffsetX = 10 / 12;
  const labelOffsetY = 5 / 12;

  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const groups = useSelector((state) => state.groups.items);

  const selectedRawRef = useRef(null);
  const selectedAnimatedRef = useRef(null);
  const selectedTransitionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const renderSourcesRef = useRef(() => {});
  const selectedDeviceKeyRef = useRef(null);

  const mapCluster = useAttributePreference('mapCluster', true);
  const directionType = useAttributePreference('mapDirection', 'selected');

  const createFeature = (devices, groups, position, selectedPositionId) => {
    const device = devices[position.deviceId];
    if (!device) {
      return null;
    }
    let showDirection;
    switch (directionType) {
      case 'none':
        showDirection = false;
        break;
      case 'all':
        showDirection = true;
        break;
      default:
        showDirection = selectedPositionId === position.id;
        break;
    }

    const speedKmh = Math.max(0, Math.round((Number(position.speed) || 0) * 1.852));
    const { markerState } = updateStationaryState({
      deviceId: position.deviceId,
      latitude: position.latitude,
      longitude: position.longitude,
      speedKmh,
      fixTime: position.fixTime,
    });
    const reportColor = resolveDeviceReportColor(device, groups);
    const customColorKey = normalizeCustomColorKey(reportColor);

    return {
      id: position.id,
      deviceId: position.deviceId,
      name: device.name,
      fixTime: formatTime(position.fixTime, 'seconds'),
      category: mapIconKey(device.category),
      color: customColorKey || (showStatus ? position.attributes.color || getStatusColor(device.status) : 'neutral'),
      routeColor: reportColor || theme.palette.geometry.main,
      labelColor: reportColor || theme.palette.geometry.main,
      rotation: position.course,
      direction: showDirection,
      markerState,
    };
  };

  const onMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
  const onMouseLeave = () => map.getCanvas().style.cursor = '';

  const onMapClickCallback = useCallback((event) => {
    if (!event.defaultPrevented && onMapClick) {
      onMapClick(event.lngLat.lat, event.lngLat.lng);
    }
  }, [onMapClick]);

  const onMarkerClickCallback = useCallback((event) => {
    event.preventDefault();
    const feature = event.features[0];
    if (onMarkerClick) {
      onMarkerClick(feature.properties.id, feature.properties.deviceId);
    }
  }, [onMarkerClick]);

  const onClusterClick = useCatchCallback(async (event) => {
    event.preventDefault();
    const features = map.queryRenderedFeatures(event.point, {
      layers: [clusters],
    });
    const clusterId = features[0].properties.cluster_id;
    const zoom = await map.getSource(id).getClusterExpansionZoom(clusterId);
    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom,
    });
  }, [clusters]);

  const stopSelectedAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
      cluster: mapCluster,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });
    map.addSource(selected, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    [id, selected].forEach((source) => {
      const labelBackgroundLayerId = `${source}-label-background`;
      map.addLayer({
        id: labelBackgroundLayerId,
        type: 'symbol',
        source,
        filter: ['!has', 'point_count'],
        layout: {
          'icon-image': 'label-background',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [3, 3, 3, 3],
          'icon-allow-overlap': true,
          'text-field': `{${titleField || 'name'}}`,
          'text-allow-overlap': true,
          'text-anchor': 'bottom',
          'text-offset': [labelOffsetX, -2 * iconScale - labelOffsetY],
          'text-font': findFonts(map),
          'text-size': 12,
        },
        paint: {
          'icon-color': ['get', 'labelColor'],
          'text-opacity': 0,
        },
      });
      map.addLayer({
        id: source,
        type: 'symbol',
        source,
        filter: ['!has', 'point_count'],
        layout: {
          'icon-image': '{category}-{color}',
          'icon-size': iconScale,
          'icon-allow-overlap': true,
          'text-field': `{${titleField || 'name'}}`,
          'text-allow-overlap': true,
          'text-anchor': 'bottom',
          'text-offset': [labelOffsetX, -2 * iconScale - labelOffsetY],
          'text-font': findFonts(map),
          'text-size': 12,
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-width': 0,
          'icon-opacity': [
            'case',
            ['==', ['get', 'direction'], true],
            0,
            1,
          ],
        },
      });
      map.addLayer({
        id: `direction-outline-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['==', 'markerState', 'moving'],
        ],
        layout: {
          'icon-image': 'direction',
          'icon-size': directionOutlineIconScale,
          'icon-allow-overlap': true,
          'icon-rotate': ['-', ['get', 'rotation'], 45],
          'icon-rotation-alignment': 'map',
        },
        paint: {
          'icon-color': '#FFFFFF',
          'icon-opacity': 0.95,
        },
      });
      map.addLayer({
        id: `direction-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['==', 'markerState', 'moving'],
        ],
        layout: {
          'icon-image': 'direction',
          'icon-size': directionIconScale,
          'icon-allow-overlap': true,
          'icon-rotate': ['-', ['get', 'rotation'], 45],
          'icon-rotation-alignment': 'map',
        },
        paint: {
          'icon-color': ['get', 'routeColor'],
        },
      });
      map.addLayer({
        id: `square-shadow-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['any', ['==', 'markerState', 'stopped'], ['==', 'markerState', 'parked']],
        ],
        layout: {
          'icon-image': 'square',
          'icon-size': squareShadowIconScale,
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-color': 'rgba(0, 0, 0, 0.35)',
        },
      });
      map.addLayer({
        id: `square-outline-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['any', ['==', 'markerState', 'stopped'], ['==', 'markerState', 'parked']],
        ],
        layout: {
          'icon-image': 'square',
          'icon-size': squareOutlineIconScale,
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-color': '#FFFFFF',
          'icon-opacity': 0.95,
        },
      });
      map.addLayer({
        id: `stopped-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['==', 'markerState', 'stopped'],
        ],
        layout: {
          'icon-image': 'square',
          'icon-size': squareIconScale,
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-color': ['get', 'routeColor'],
        },
      });
      map.addLayer({
        id: `parked-${source}`,
        type: 'symbol',
        source,
        filter: [
          'all',
          ['!has', 'point_count'],
          ['==', 'direction', true],
          ['==', 'markerState', 'parked'],
        ],
        layout: {
          'icon-image': 'square',
          'icon-size': squareIconScale,
          'icon-allow-overlap': true,
          'text-field': 'E',
          'text-font': findFonts(map),
          'text-size': 11,
          'text-anchor': 'center',
          'text-allow-overlap': true,
        },
        paint: {
          'icon-color': ['get', 'routeColor'],
          'text-color': '#FFFFFF',
        },
      });

      map.on('mouseenter', source, onMouseEnter);
      map.on('mouseleave', source, onMouseLeave);
      map.on('click', source, onMarkerClickCallback);
    });
    map.addLayer({
      id: clusters,
      type: 'symbol',
      source: id,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': 'background',
        'icon-size': iconScale,
        'text-field': '{point_count_abbreviated}',
        'text-font': findFonts(map),
        'text-size': 14,
      },
    });

    map.on('mouseenter', clusters, onMouseEnter);
    map.on('mouseleave', clusters, onMouseLeave);
    map.on('click', clusters, onClusterClick);
    map.on('click', onMapClickCallback);

    return () => {
      map.off('mouseenter', clusters, onMouseEnter);
      map.off('mouseleave', clusters, onMouseLeave);
      map.off('click', clusters, onClusterClick);
      map.off('click', onMapClickCallback);

      if (map.getLayer(clusters)) {
        map.removeLayer(clusters);
      }

      [id, selected].forEach((source) => {
        map.off('mouseenter', source, onMouseEnter);
        map.off('mouseleave', source, onMouseLeave);
        map.off('click', source, onMarkerClickCallback);

        if (map.getLayer(source)) {
          map.removeLayer(source);
        }
        if (map.getLayer(`${source}-label-background`)) {
          map.removeLayer(`${source}-label-background`);
        }
        if (map.getLayer(`direction-${source}`)) {
          map.removeLayer(`direction-${source}`);
        }
        if (map.getLayer(`direction-outline-${source}`)) {
          map.removeLayer(`direction-outline-${source}`);
        }
        if (map.getLayer(`stopped-${source}`)) {
          map.removeLayer(`stopped-${source}`);
        }
        if (map.getLayer(`parked-${source}`)) {
          map.removeLayer(`parked-${source}`);
        }
        if (map.getLayer(`square-shadow-${source}`)) {
          map.removeLayer(`square-shadow-${source}`);
        }
        if (map.getLayer(`square-outline-${source}`)) {
          map.removeLayer(`square-outline-${source}`);
        }
        if (map.getSource(source)) {
          map.removeSource(source);
        }
      });
    };
  }, [
    mapCluster,
    clusters,
    onMarkerClickCallback,
    onClusterClick,
    onMapClickCallback,
    iconScale,
    labelOffsetX,
    labelOffsetY,
    directionIconScale,
    directionOutlineIconScale,
    squareShadowIconScale,
    squareOutlineIconScale,
    squareIconScale,
  ]);

  useEffect(() => {
    let cancelled = false;

    const renderSources = () => {
      if (cancelled) {
        return;
      }

      [id, selected].forEach((source) => {
        map.getSource(source)?.setData({
          type: 'FeatureCollection',
          features: positions.filter((it) => devices.hasOwnProperty(it.deviceId))
            .filter((it) => (source === id ? it.deviceId !== selectedDeviceId : it.deviceId === selectedDeviceId))
            .map((position) => {
              const isSelectedDevice = String(position.deviceId) === String(selectedDeviceId);
              const animatedPosition = isSelectedDevice ? selectedAnimatedRef.current : null;
              const mappedPosition = animatedPosition
                ? {
                  ...position,
                  longitude: animatedPosition.longitude,
                  latitude: animatedPosition.latitude,
                  course: animatedPosition.course,
                }
                : position;
              const feature = createFeature(devices, groups, mappedPosition, selectedPosition && selectedPosition.id);
              if (!feature) {
                return null;
              }
              return {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [mappedPosition.longitude, mappedPosition.latitude],
                },
                properties: feature,
              };
            })
            .filter(Boolean),
        });
      });
    };

    renderSourcesRef.current = renderSources;

    const updateMapSources = async () => {
      const customColorValues = [...new Set(
        positions
          .filter((it) => devices.hasOwnProperty(it.deviceId))
          .map((it) => resolveDeviceReportColor(devices[it.deviceId], groups))
          .filter(Boolean),
      )];

      await Promise.all(customColorValues.map(async (colorValue) => {
        const colorKey = await ensureCustomColorIcons(colorValue);
        if (!colorKey) {
          return;
        }
        Object.entries(mapImages)
          .filter(([imageKey]) => imageKey.endsWith(`-${colorKey}`))
          .forEach(([imageKey, imageData]) => {
            if (!map.hasImage(imageKey)) {
              map.addImage(imageKey, imageData, {
                pixelRatio: window.devicePixelRatio,
              });
            }
          });
      }));

      if (cancelled) {
        return;
      }

      renderSources();
    };

    updateMapSources();

    return () => {
      cancelled = true;
    };
  }, [mapCluster, clusters, onMarkerClick, onClusterClick, devices, groups, positions, selectedPosition, selectedDeviceId, directionType, theme, id, selected, showStatus]);

  useEffect(() => {
    const currentSelectedDeviceKey = selectedDeviceId != null ? String(selectedDeviceId) : null;
    if (selectedDeviceKeyRef.current !== currentSelectedDeviceKey) {
      selectedDeviceKeyRef.current = currentSelectedDeviceKey;
      selectedRawRef.current = null;
      selectedAnimatedRef.current = null;
      selectedTransitionRef.current = null;
      stopSelectedAnimation();
    }

    const currentSelectedPosition = positions.find((item) => String(item.deviceId) === currentSelectedDeviceKey);
    if (!selectedDeviceId || !currentSelectedPosition) {
      selectedDeviceKeyRef.current = null;
      selectedRawRef.current = null;
      selectedAnimatedRef.current = null;
      selectedTransitionRef.current = null;
      stopSelectedAnimation();
      renderSourcesRef.current();
      return undefined;
    }

    const nextRawPosition = {
      longitude: currentSelectedPosition.longitude,
      latitude: currentSelectedPosition.latitude,
      course: currentSelectedPosition.course,
    };

    const previousRawPosition = selectedRawRef.current;
    const moved = previousRawPosition
      && (previousRawPosition.longitude !== nextRawPosition.longitude
        || previousRawPosition.latitude !== nextRawPosition.latitude);

    if (!moved) {
      selectedAnimatedRef.current = nextRawPosition;
      selectedTransitionRef.current = null;
      renderSourcesRef.current();
      selectedRawRef.current = nextRawPosition;
      return undefined;
    }

    const transitionStart = selectedAnimatedRef.current || previousRawPosition;
    selectedTransitionRef.current = {
      from: transitionStart,
      to: nextRawPosition,
      startTime: performance.now(),
      duration: POSITION_TRANSITION_DURATION_MS,
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
        course: interpolateAngle(transition.from.course, transition.to.course, progress),
      };

      renderSourcesRef.current();

      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        selectedTransitionRef.current = null;
        selectedAnimatedRef.current = transition.to;
        renderSourcesRef.current();
        animationFrameRef.current = null;
      }
    };

    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return undefined;
  }, [positions, selectedDeviceId, stopSelectedAnimation]);

  useEffect(() => () => {
    stopSelectedAnimation();
  }, [stopSelectedAnimation]);

  return null;
};

export default MapPositions;
