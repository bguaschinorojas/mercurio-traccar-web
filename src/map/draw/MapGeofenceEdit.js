import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEffect, useMemo, useRef } from 'react';
import turfCircle from '@turf/circle';

import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';
import { map } from '../core/mapInstance';
import { findFonts, geofenceToFeature, geometryToArea } from '../core/mapUtil';
import { errorsActions, geofencesActions } from '../../store';
import { useCatchCallback } from '../../reactHelper';
import drawTheme from './theme';
import fetchOrThrow from '../../common/util/fetchOrThrow';

MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';

const CIRCLE_HANDLE_SOURCE_ID = 'geofence-circle-handle-source';
const CIRCLE_HANDLE_LINE_LAYER_ID = 'geofence-circle-handle-line';
const CIRCLE_HANDLE_POINT_LAYER_ID = 'geofence-circle-handle-point';
const VERTEX_LAYER_IDS = [
  'gl-draw-polygon-midpoint',
  'gl-draw-polygon-and-line-vertex-stroke-inactive',
  'gl-draw-polygon-and-line-vertex-inactive',
  'gl-draw-point-stroke-active',
  'gl-draw-point-active',
];

const toRadians = (value) => (value * Math.PI) / 180;
const toDegrees = (value) => (value * 180) / Math.PI;

const distanceInMeters = (lat1, lng1, lat2, lng2) => {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseCircleArea = (area) => {
  if (!area?.includes('CIRCLE')) {
    return null;
  }
  const values = area.replace(/CIRCLE|\(|\)|,/g, ' ').trim().split(/ +/).map(Number);
  if (values.length < 3 || values.some((value) => Number.isNaN(value))) {
    return null;
  }
  return {
    center: [values[1], values[0]],
    radius: values[2],
  };
};

const destinationPointMeters = (center, distanceMeters, bearingDegrees = 90) => {
  const earthRadius = 6371000;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = toRadians(bearingDegrees);
  const lon1 = toRadians(center[0]);
  const lat1 = toRadians(center[1]);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );

  return [toDegrees(lon2), toDegrees(lat2)];
};

const geometryToCircleArea = (geometry) => {
  const ring = geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) {
    return null;
  }
  const vertices = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (!vertices.length) {
    return null;
  }

  const center = vertices.reduce((acc, [lng, lat]) => ({
    lng: acc.lng + lng,
    lat: acc.lat + lat,
  }), { lng: 0, lat: 0 });

  const centerLng = center.lng / vertices.length;
  const centerLat = center.lat / vertices.length;

  const radius = vertices.reduce(
    (sum, [lng, lat]) => sum + distanceInMeters(centerLat, centerLng, lat, lng),
    0,
  ) / vertices.length;

  return `CIRCLE (${centerLat} ${centerLng}, ${Math.max(10, Math.round(radius))})`;
};

const MapGeofenceEdit = ({ selectedGeofenceId }) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const circleStateRef = useRef(null);
  const draggingHandleRef = useRef(false);
  const internalCircleUpdateUntilRef = useRef(0);

  const draw = useMemo(() => new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: false,
      line_string: false,
      trash: false,
    },
    keybindings: false,
    userProperties: true,
    styles: [...drawTheme, {
      id: 'gl-draw-title',
      type: 'symbol',
      filter: ['all'],
      layout: {
        'text-field': '{user_name}',
        'text-font': findFonts(map),
        'text-size': 12,
      },
      paint: {
        'text-halo-color': 'white',
        'text-halo-width': 1,
      },
    }],
  }), []);

  const geofences = useSelector((state) => state.geofences.items);

  const refreshGeofences = useCatchCallback(async () => {
    const response = await fetchOrThrow('/api/geofences');
    dispatch(geofencesActions.refresh(await response.json()));
  }, [dispatch]);

  const setVertexLayersVisible = (visible) => {
    VERTEX_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  };

  const ensureCircleHandleLayers = () => {
    if (!map.getSource(CIRCLE_HANDLE_SOURCE_ID)) {
      map.addSource(CIRCLE_HANDLE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer(CIRCLE_HANDLE_LINE_LAYER_ID)) {
      map.addLayer({
        id: CIRCLE_HANDLE_LINE_LAYER_ID,
        type: 'line',
        source: CIRCLE_HANDLE_SOURCE_ID,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#DB5359',
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });
    }
    if (!map.getLayer(CIRCLE_HANDLE_POINT_LAYER_ID)) {
      map.addLayer({
        id: CIRCLE_HANDLE_POINT_LAYER_ID,
        type: 'circle',
        source: CIRCLE_HANDLE_SOURCE_ID,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#DB5359',
        },
      });
    }
  };

  const updateCircleHandle = (center, handle) => {
    const source = map.getSource(CIRCLE_HANDLE_SOURCE_ID);
    if (!source) {
      return;
    }
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [center, handle],
          },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: handle,
          },
          properties: {},
        },
      ],
    });
  };

  const removeCircleHandleLayers = () => {
    if (map.getLayer(CIRCLE_HANDLE_POINT_LAYER_ID)) {
      map.removeLayer(CIRCLE_HANDLE_POINT_LAYER_ID);
    }
    if (map.getLayer(CIRCLE_HANDLE_LINE_LAYER_ID)) {
      map.removeLayer(CIRCLE_HANDLE_LINE_LAYER_ID);
    }
    if (map.getSource(CIRCLE_HANDLE_SOURCE_ID)) {
      map.removeSource(CIRCLE_HANDLE_SOURCE_ID);
    }
  };

  const updateCircleGeometryInDraw = (featureId, center, radius) => {
    const existingFeature = draw.get(featureId);
    if (!existingFeature) {
      return;
    }
    const updatedGeometry = turfCircle(center, radius, { steps: 32, units: 'meters' }).geometry;
    internalCircleUpdateUntilRef.current = Date.now() + 200;
    draw.add({
      ...existingFeature,
      id: featureId,
      geometry: updatedGeometry,
    });
    draw.changeMode('simple_select', { featureIds: [featureId] });
  };

  useEffect(() => {
    refreshGeofences();

    map.addControl(draw, theme.direction === 'rtl' ? 'top-right' : 'top-left');
    const container = map.getContainer();
    const drawButtons = container.querySelectorAll('.mapbox-gl-draw_ctrl-draw-btn');
    drawButtons.forEach((button) => {
      button.style.display = 'none';
    });
    return () => {
      draggingHandleRef.current = false;
      map.dragPan.enable();
      removeCircleHandleLayers();
      setVertexLayersVisible(true);
      map.removeControl(draw);
    };
  }, [draw, refreshGeofences, theme.direction]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      if (Date.now() < internalCircleUpdateUntilRef.current) {
        return;
      }
      const item = Object.values(geofences).find((i) => String(i.id) === String(feature.id));
      if (item) {
        const nextArea = item.area?.includes('CIRCLE')
          ? (geometryToCircleArea(feature.geometry) || item.area)
          : geometryToArea(feature.geometry);
        if (item.area?.includes('CIRCLE')) {
          const circleData = parseCircleArea(nextArea);
          if (circleData) {
            const handle = destinationPointMeters(circleData.center, circleData.radius);
            circleStateRef.current = {
              id: item.id,
              featureId: String(item.id),
              center: circleData.center,
              radius: circleData.radius,
              handle,
            };
            ensureCircleHandleLayers();
            updateCircleHandle(circleData.center, handle);
          }
        }
        const updatedItem = { ...item, area: nextArea };
        try {
          await fetchOrThrow(`/api/geofences/${feature.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedItem),
          });
          refreshGeofences();
        } catch (error) {
          dispatch(errorsActions.push(error.message));
        }
      }
    };

    map.on('draw.update', listener);
    return () => map.off('draw.update', listener);
  }, [dispatch, geofences, refreshGeofences]);

  useEffect(() => {
    const onModeChange = (event) => {
      const circleState = circleStateRef.current;
      if (!circleState) {
        return;
      }
      if (event.mode === 'direct_select') {
        draw.changeMode('simple_select', { featureIds: [circleState.featureId] });
      }
    };
    map.on('draw.modechange', onModeChange);
    return () => map.off('draw.modechange', onModeChange);
  }, [draw]);

  useEffect(() => {
    const onMouseDown = (event) => {
      const circleState = circleStateRef.current;
      if (!circleState || !map.getLayer(CIRCLE_HANDLE_POINT_LAYER_ID)) {
        return;
      }
      const featureOnHandle = map.queryRenderedFeatures(event.point, { layers: [CIRCLE_HANDLE_POINT_LAYER_ID] });
      if (!featureOnHandle.length) {
        return;
      }
      draggingHandleRef.current = true;
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'ew-resize';
      event.preventDefault();
    };

    const onMouseMove = (event) => {
      const circleState = circleStateRef.current;
      if (!circleState) {
        return;
      }

      if (!draggingHandleRef.current) {
        if (map.getLayer(CIRCLE_HANDLE_POINT_LAYER_ID)) {
          const hovering = map.queryRenderedFeatures(event.point, { layers: [CIRCLE_HANDLE_POINT_LAYER_ID] }).length > 0;
          map.getCanvas().style.cursor = hovering ? 'ew-resize' : '';
        }
        return;
      }

      const radius = Math.max(10, distanceInMeters(
        circleState.center[1],
        circleState.center[0],
        event.lngLat.lat,
        event.lngLat.lng,
      ));
      const handle = [event.lngLat.lng, event.lngLat.lat];
      circleStateRef.current = {
        ...circleState,
        radius,
        handle,
      };
      updateCircleGeometryInDraw(circleState.featureId, circleState.center, radius);
      updateCircleHandle(circleState.center, handle);
    };

    const onMouseUp = async () => {
      if (!draggingHandleRef.current) {
        return;
      }
      draggingHandleRef.current = false;
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      const circleState = circleStateRef.current;
      if (!circleState) {
        return;
      }
      const item = geofences[circleState.id] || Object.values(geofences).find((i) => String(i.id) === String(circleState.id));
      if (!item) {
        return;
      }
      const updatedItem = {
        ...item,
        area: `CIRCLE (${circleState.center[1]} ${circleState.center[0]}, ${Math.round(circleState.radius)})`,
      };
      try {
        await fetchOrThrow(`/api/geofences/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedItem),
        });
        refreshGeofences();
      } catch (error) {
        dispatch(errorsActions.push(error.message));
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragPan.enable();
      if (!draggingHandleRef.current) {
        map.getCanvas().style.cursor = '';
      }
      draggingHandleRef.current = false;
    };
  }, [dispatch, draw, geofences, refreshGeofences]);

  useEffect(() => {
    draw.deleteAll();
    removeCircleHandleLayers();
    circleStateRef.current = null;
    if (selectedGeofenceId && geofences[selectedGeofenceId]) {
      const geofence = geofences[selectedGeofenceId];
      const isCircle = geofence.area?.includes('CIRCLE');
      const drawFeature = geofenceToFeature(theme, geofence);
      drawFeature.id = String(geofence.id);
      draw.add(drawFeature);

      const feature = draw.get(String(geofence.id));
      if (!feature) {
        return;
      }

      if (isCircle) {
        setVertexLayersVisible(false);
        const circleData = parseCircleArea(geofence.area);
        if (circleData) {
          const handle = destinationPointMeters(circleData.center, circleData.radius);
          circleStateRef.current = {
            id: geofence.id,
            featureId: String(geofence.id),
            center: circleData.center,
            radius: circleData.radius,
            handle,
          };
          ensureCircleHandleLayers();
          updateCircleHandle(circleData.center, handle);
        }
        draw.changeMode('simple_select', { featureIds: [String(geofence.id)] });
      } else {
        setVertexLayersVisible(true);
        try {
          draw.changeMode('direct_select', { featureId: String(geofence.id) });
        } catch {
          draw.changeMode('simple_select', { featureIds: [String(geofence.id)] });
        }
      }

      let { coordinates } = feature.geometry;
      if (Array.isArray(coordinates[0][0])) {
        [coordinates] = coordinates;
      }
      const bounds = coordinates.reduce(
        (bounds, coordinate) => bounds.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[1]),
      );
      const canvas = map.getCanvas();
      map.fitBounds(bounds, { padding: Math.min(canvas.width, canvas.height) * 0.1 });
    } else {
      setVertexLayersVisible(true);
    }
  }, [draw, geofences, selectedGeofenceId, theme]);

  return null;
};

export default MapGeofenceEdit;
