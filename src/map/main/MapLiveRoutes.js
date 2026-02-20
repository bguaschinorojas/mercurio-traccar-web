import { useId, useEffect } from 'react';
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

const MapLiveRoutes = () => {
  const id = useId();

  const theme = useTheme();

  const type = useAttributePreference('mapLiveRoutes', 'none');

  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const groups = useSelector((state) => state.groups.items);

  const history = useSelector((state) => state.session.history);

  const mapLineWidth = useAttributePreference('mapLineWidth', 5);
  const mapLineOpacity = useAttributePreference('mapLineOpacity', 1);

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

  useEffect(() => {
    if (type !== 'none') {
      const deviceIds = Object.values(devices)
        .map((device) => device.id)
        .filter((id) => (type === 'selected' ? id === selectedDeviceId : true))
        .filter((id) => history.hasOwnProperty(id));

      map.getSource(id)?.setData({
        type: 'FeatureCollection',
        features: deviceIds.flatMap((deviceId) => {
          const color = resolveDeviceReportColor(devices[deviceId], groups) || theme.palette.geometry.main;
          return buildTrailSegments(history[deviceId], mapLineOpacity).map((segment) => ({
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
    }
  }, [theme, type, devices, groups, selectedDeviceId, history, mapLineWidth, mapLineOpacity]);

  return null;
};

export default MapLiveRoutes;
