import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import MapView from '../map/core/MapView';
import MapSelectedDevice from '../map/main/MapSelectedDevice';
import MapAccuracy from '../map/main/MapAccuracy';
import MapGeofence from '../map/MapGeofence';
import MapCurrentLocation from '../map/MapCurrentLocation';
import PoiMap from '../map/main/PoiMap';
import MapPadding from '../map/MapPadding';
import { devicesActions, errorsActions, geofencesActions } from '../store';
import MapDefaultCamera from '../map/main/MapDefaultCamera';
import MapLiveRoutes from '../map/main/MapLiveRoutes';
import MapPositions from '../map/MapPositions';
import MapOverlay from '../map/overlay/MapOverlay';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import MapScale from '../map/MapScale';
import MapGeofenceEdit from '../map/draw/MapGeofenceEdit';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { map } from '../map/core/mapInstance';
import { geometryToArea } from '../map/core/mapUtil';

const DEFAULT_CIRCLE_RADIUS_METERS = 120;
const DEFAULT_POLYGON_HALF_WIDTH_METERS = 110;
const DEFAULT_POLYGON_HALF_HEIGHT_METERS = 80;

const metersToLongitude = (meters, latitude) => meters / (111320 * Math.cos((latitude * Math.PI) / 180));
const metersToLatitude = (meters) => meters / 110540;

const buildPolygon12AroundCenter = (longitude, latitude) => {
  const pointsInMeters = [
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS, -DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS / 3, -DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS / 3, -DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS, -DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS, -DEFAULT_POLYGON_HALF_HEIGHT_METERS / 3],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS, DEFAULT_POLYGON_HALF_HEIGHT_METERS / 3],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS, DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [DEFAULT_POLYGON_HALF_WIDTH_METERS / 3, DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS / 3, DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS, DEFAULT_POLYGON_HALF_HEIGHT_METERS],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS, DEFAULT_POLYGON_HALF_HEIGHT_METERS / 3],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS, -DEFAULT_POLYGON_HALF_HEIGHT_METERS / 3],
    [-DEFAULT_POLYGON_HALF_WIDTH_METERS, -DEFAULT_POLYGON_HALF_HEIGHT_METERS],
  ];

  return pointsInMeters.map(([xMeters, yMeters]) => ([
    longitude + metersToLongitude(xMeters, latitude),
    latitude + metersToLatitude(yMeters),
  ]));
};

const MainMap = ({ filteredPositions, selectedPosition }) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const t = useTranslation();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [selectedGeofenceId, setSelectedGeofenceId] = useState();
  const [editingGeofenceId, setEditingGeofenceId] = useState(null);
  const geofences = useSelector((state) => state.geofences.items);

  const geofenceItems = useMemo(
    () => Object.values(geofences).sort((a, b) => a.name.localeCompare(b.name)),
    [geofences],
  );

  const onMarkerClick = useCallback((_, deviceId) => {
    dispatch(devicesActions.selectId(deviceId));
  }, [dispatch]);

  const updateGeofence = useCallback(async (geofenceId, changes) => {
    const currentGeofence = geofences[geofenceId];
    if (!currentGeofence) {
      return;
    }
    const updatedGeofence = {
      ...currentGeofence,
      ...changes,
      attributes: {
        ...(currentGeofence.attributes || {}),
        ...(changes.attributes || {}),
      },
    };
    try {
      const response = await fetchOrThrow(`/api/geofences/${geofenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGeofence),
      });
      const savedGeofence = await response.json();
      dispatch(geofencesActions.update([savedGeofence]));
      return savedGeofence;
    } catch (error) {
      dispatch(errorsActions.push(error.message));
      return null;
    }
  }, [dispatch, geofences]);

  const deleteGeofence = useCallback(async (geofenceId) => {
    try {
      await fetchOrThrow(`/api/geofences/${geofenceId}`, { method: 'DELETE' });
      const response = await fetchOrThrow('/api/geofences');
      dispatch(geofencesActions.refresh(await response.json()));
      if (selectedGeofenceId === geofenceId) {
        setSelectedGeofenceId(undefined);
      }
      if (editingGeofenceId === geofenceId) {
        setEditingGeofenceId(null);
      }
      return true;
    } catch (error) {
      dispatch(errorsActions.push(error.message));
      return false;
    }
  }, [dispatch, editingGeofenceId, selectedGeofenceId]);

  const createGeofenceFromTemplate = useCallback(async (mode) => {
    const center = map.getCenter();
    let area;

    if (mode === 'circle') {
      area = `CIRCLE (${center.lat} ${center.lng}, ${DEFAULT_CIRCLE_RADIUS_METERS})`;
    } else {
      const polygonGeometry = {
        type: 'Polygon',
        coordinates: [buildPolygon12AroundCenter(center.lng, center.lat)],
      };
      area = geometryToArea(polygonGeometry);
    }

    try {
      const response = await fetchOrThrow('/api/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: t('sharedGeofence'),
          area,
        }),
      });
      const savedGeofence = await response.json();
      const refreshResponse = await fetchOrThrow('/api/geofences');
      dispatch(geofencesActions.refresh(await refreshResponse.json()));
      setSelectedGeofenceId(savedGeofence.id);
      return savedGeofence;
    } catch (error) {
      dispatch(errorsActions.push(error.message));
      return null;
    }
  }, [dispatch, t]);

  return (
    <>
      <MapView
        mapControlsProps={{
          geofenceItems,
          selectedGeofenceId,
          onGeofenceSelect: (geofenceId) => {
            setSelectedGeofenceId(geofenceId);
          },
          onGeofenceUpdate: (geofenceId, changes) => updateGeofence(geofenceId, changes),
          onGeofenceDelete: (geofenceId) => deleteGeofence(geofenceId),
          onCreateGeofence: createGeofenceFromTemplate,
          onStartGeofenceEdit: (geofenceId) => {
            setSelectedGeofenceId(geofenceId);
            setEditingGeofenceId(geofenceId);
          },
          onStopGeofenceEdit: () => setEditingGeofenceId(null),
          geofenceEditorActive: Boolean(editingGeofenceId),
          geofenceEditorLabel: t('sharedGeofences'),
        }}
      >
        <MapOverlay />
        {!editingGeofenceId && <MapGeofence />}
        {editingGeofenceId && (
          <MapGeofenceEdit
            selectedGeofenceId={editingGeofenceId}
          />
        )}
        <MapAccuracy positions={filteredPositions} />
        <MapLiveRoutes />
        <MapPositions
          positions={filteredPositions}
          onMarkerClick={onMarkerClick}
          selectedPosition={selectedPosition}
          showStatus
        />
        <MapDefaultCamera />
        <MapSelectedDevice />
        <PoiMap />
      </MapView>
      <MapScale />
      <MapCurrentLocation />
      <MapGeocoder />
      {desktop && (
        <MapPadding start={parseInt(theme.dimensions.drawerWidthDesktop, 10) + parseInt(theme.spacing(1.5), 10)} />
      )}
    </>
  );
};

export default MainMap;
