import {
  useId, useEffect, useMemo, useRef,
} from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';
import maplibregl from 'maplibre-gl';
import { parse } from 'wellknown';
import { map } from './core/mapInstance';
import { geofenceToFeature, reverseCoordinates } from './core/mapUtil';
import { useAttributePreference } from '../common/util/preferences';

const earthRadiusMeters = 6371000;

const toRadians = (value) => value * (Math.PI / 180);

const distanceMeters = (pointA, pointB) => {
  const [lon1, lat1] = pointA;
  const [lon2, lat2] = pointB;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const isPointInRing = (point, ring) => {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const isPointInPolygon = (point, polygonCoordinates) => {
  if (!polygonCoordinates.length || !isPointInRing(point, polygonCoordinates[0])) {
    return false;
  }
  for (let i = 1; i < polygonCoordinates.length; i += 1) {
    if (isPointInRing(point, polygonCoordinates[i])) {
      return false;
    }
  }
  return true;
};

const parseGeofenceArea = (geofence) => {
  if (!geofence?.area) {
    return null;
  }
  if (geofence.area.includes('CIRCLE')) {
    const values = geofence.area.replace(/CIRCLE|\(|\)|,/g, ' ').trim().split(/ +/).map(Number);
    if (values.length < 3) {
      return null;
    }
    return {
      type: 'CIRCLE',
      center: [values[1], values[0]],
      radius: values[2],
    };
  }
  const geometry = reverseCoordinates(parse(geofence.area));
  return geometry || null;
};

const isPointInsideGeofence = (point, geometry) => {
  if (!geometry) {
    return false;
  }
  if (geometry.type === 'CIRCLE') {
    return distanceMeters(point, geometry.center) <= geometry.radius;
  }
  if (geometry.type === 'Polygon') {
    return isPointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
  }
  return false;
};

const createGeofencePopup = (geofence, vehicleCount) => {
  const wrapper = document.createElement('div');
  wrapper.style.color = '#000000';
  wrapper.style.padding = '0';
  wrapper.style.minWidth = '0';
  wrapper.style.border = '0';
  wrapper.style.fontFamily = 'inherit';

  const title = document.createElement('div');
  title.style.fontSize = '14px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.35';
  title.textContent = geofence.name || 'Geozona';
  wrapper.appendChild(title);

  const objects = document.createElement('div');
  objects.style.fontSize = '13px';
  objects.style.marginTop = '4px';
  objects.textContent = `Vehiculos en geocerca: ${vehicleCount}`;
  wrapper.appendChild(objects);

  return wrapper;
};

const MapGeofence = () => {
  const id = useId();

  const theme = useTheme();

  const mapGeofences = useAttributePreference('mapGeofences', true);

  const geofences = useSelector((state) => state.geofences.items);
  const positions = useSelector((state) => state.session.positions);
  const popupRef = useRef(null);
  const latestDataRef = useRef({ geofences: {}, geofenceVehicleCounts: {} });

  const geofenceGeometries = useMemo(() => Object.values(geofences).reduce((result, geofence) => {
    result[geofence.id] = parseGeofenceArea(geofence);
    return result;
  }, {}), [geofences]);

  const geofenceVehicleCounts = useMemo(() => {
    const realtimeSets = {};
    const geometricSets = {};

    Object.values(positions).forEach((position) => {
      (position.geofenceIds || []).forEach((geofenceId) => {
        if (!realtimeSets[geofenceId]) {
          realtimeSets[geofenceId] = new Set();
        }
        realtimeSets[geofenceId].add(position.deviceId);
      });

      const point = [position.longitude, position.latitude];
      Object.entries(geofenceGeometries).forEach(([geofenceId, geometry]) => {
        if (isPointInsideGeofence(point, geometry)) {
          if (!geometricSets[geofenceId]) {
            geometricSets[geofenceId] = new Set();
          }
          geometricSets[geofenceId].add(position.deviceId);
        }
      });
    });

    return Object.values(geofences).reduce((counts, geofence) => {
      const realtime = realtimeSets[geofence.id] || new Set();
      const geometric = geometricSets[geofence.id] || new Set();
      const combined = new Set([...realtime, ...geometric]);
      counts[geofence.id] = combined.size;
      return counts;
    }, {});
  }, [positions, geofenceGeometries, geofences]);

  useEffect(() => {
    latestDataRef.current = { geofences, geofenceVehicleCounts };
  }, [geofences, geofenceVehicleCounts]);

  useEffect(() => {
    if (mapGeofences) {
      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
      map.addLayer({
        source: id,
        id: 'geofences-fill',
        type: 'fill',
        filter: [
          'all',
          ['==', '$type', 'Polygon'],
        ],
        paint: {
          'fill-color': ['get', 'color'],
          'fill-outline-color': ['get', 'color'],
          'fill-opacity': 0.1,
        },
      });
      map.addLayer({
        source: id,
        id: 'geofences-line',
        type: 'line',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });

      const onMapClick = (event) => {
        const layers = ['geofences-fill', 'geofences-line'].filter((layerId) => map.getLayer(layerId));
        if (!layers.length) {
          return;
        }
        const [feature] = map.queryRenderedFeatures(event.point, { layers });
        if (!feature) {
          return;
        }
        const geofenceId = Number(feature.id || feature.properties?.geofenceId);
        const selectedGeofence = latestDataRef.current.geofences[geofenceId];
        if (!selectedGeofence) {
          return;
        }
        const vehicleCount = latestDataRef.current.geofenceVehicleCounts[geofenceId] || 0;
        if (popupRef.current) {
          popupRef.current.remove();
        }
        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: true,
          offset: 12,
          className: 'geofence-click-popup',
        })
          .setLngLat(event.lngLat)
          .setDOMContent(createGeofencePopup(selectedGeofence, vehicleCount))
          .addTo(map);
      };

      const onMapMouseMove = (event) => {
        const layers = ['geofences-fill', 'geofences-line'].filter((layerId) => map.getLayer(layerId));
        if (!layers.length) {
          return;
        }
        const hasFeature = map.queryRenderedFeatures(event.point, { layers }).length > 0;
        map.getCanvas().style.cursor = hasFeature ? 'pointer' : '';
      };

      map.on('click', onMapClick);
      map.on('mousemove', onMapMouseMove);

      return () => {
        map.off('click', onMapClick);
        map.off('mousemove', onMapMouseMove);
        if (map.getLayer('geofences-fill')) {
          map.removeLayer('geofences-fill');
        }
        if (map.getLayer('geofences-line')) {
          map.removeLayer('geofences-line');
        }
        if (map.getSource(id)) {
          map.removeSource(id);
        }
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        map.getCanvas().style.cursor = '';
      };
    }
    return () => {};
  }, [id, mapGeofences]);

  useEffect(() => {
    if (mapGeofences) {
      map.getSource(id)?.setData({
        type: 'FeatureCollection',
        features: Object.values(geofences)
          .filter((geofence) => !geofence.attributes?.hide)
          .map((geofence) => {
            const feature = geofenceToFeature(theme, geofence);
            feature.properties = {
              ...feature.properties,
              geofenceId: geofence.id,
            };
            return feature;
          }),
      });
    }
  }, [id, mapGeofences, geofences, geofenceVehicleCounts, theme]);

  return null;
};

export default MapGeofence;
