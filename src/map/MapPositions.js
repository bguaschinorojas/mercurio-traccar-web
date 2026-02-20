import { useId, useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { map } from './core/mapInstance';
import { formatTime, getStatusColor } from '../common/util/formatter';
import { mapIconKey } from './core/preloadImages';
import { useAttributePreference } from '../common/util/preferences';
import { useCatchCallback } from '../reactHelper';
import { findFonts } from './core/mapUtil';
import { updateStationaryState } from '../common/util/stationaryState';

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

  const mapCluster = useAttributePreference('mapCluster', true);
  const directionType = useAttributePreference('mapDirection', 'selected');

  const createFeature = (devices, position, selectedPositionId) => {
    const device = devices[position.deviceId];
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

    return {
      id: position.id,
      deviceId: position.deviceId,
      name: device.name,
      fixTime: formatTime(position.fixTime, 'seconds'),
      category: mapIconKey(device.category),
      color: showStatus ? position.attributes.color || getStatusColor(device.status) : 'neutral',
      routeColor: device.attributes?.['web.reportColor'] || theme.palette.geometry.main,
      labelColor: device.attributes?.['web.reportColor'] || theme.palette.geometry.main,
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
    [id, selected].forEach((source) => {
      map.getSource(source)?.setData({
        type: 'FeatureCollection',
        features: positions.filter((it) => devices.hasOwnProperty(it.deviceId))
          .filter((it) => (source === id ? it.deviceId !== selectedDeviceId : it.deviceId === selectedDeviceId))
          .map((position) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [position.longitude, position.latitude],
            },
            properties: createFeature(devices, position, selectedPosition && selectedPosition.id),
          })),
      });
    });
  }, [mapCluster, clusters, onMarkerClick, onClusterClick, devices, positions, selectedPosition, selectedDeviceId, directionType, theme, id, selected]);

  return null;
};

export default MapPositions;
