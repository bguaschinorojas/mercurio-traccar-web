import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { googleProtocol } from 'maplibre-google-maps';
import React, {
  useRef, useLayoutEffect, useEffect, useState, useCallback,
  useMemo,
} from 'react';
import { useTheme } from '@mui/material';
import { useAttributePreference, usePreference } from '../../common/util/preferences';
import usePersistedState, { savePersistedState } from '../../common/util/usePersistedState';
import { mapImages } from './preloadImages';
import useMapStyles from './useMapStyles';
import { useEffectAsync } from '../../reactHelper';
import MapControls from '../controls/MapControls';
import { map, mapContainerElement } from './mapInstance';

maplibregl.addProtocol('google', googleProtocol);

let ready = false;
const readyListeners = new Set();

const addReadyListener = (listener) => {
  readyListeners.add(listener);
  listener(ready);
};

const removeReadyListener = (listener) => {
  readyListeners.delete(listener);
};

const updateReadyValue = (value) => {
  ready = value;
  readyListeners.forEach((listener) => listener(value));
};

const initMap = async () => {
  if (ready) return;
  if (!map.hasImage('background')) {
    Object.entries(mapImages).forEach(([key, value]) => {
      map.addImage(key, value, {
        pixelRatio: window.devicePixelRatio,
        sdf: key === 'direction' || key === 'label-background' || key === 'square',
      });
    });
  }
};

const MapView = ({ children, mapControlsProps = {} }) => {
  const theme = useTheme();

  const containerEl = useRef(null);

  const [mapReady, setMapReady] = useState(false);

  const mapStyles = useMapStyles();
  const activeMapStyles = useAttributePreference('activeMapStyles', 'locationIqStreets,locationIqDark,openFreeMap');
  const [defaultMapStyle, setDefaultMapStyle] = usePersistedState('selectedMapStyle', usePreference('map', 'locationIqStreets'));
  const mapboxAccessToken = useAttributePreference('mapboxAccessToken');
  const maxZoom = useAttributePreference('web.maxZoom');

  const currentStyleRef = useRef(null);

  const applyStyle = useCallback((style) => {
    if (!style || currentStyleRef.current === style.id) return;
    updateReadyValue(false);
    map.setStyle(style.style, { diff: false });
    map.setTransformRequest(style.transformRequest);
    savePersistedState('selectedMapStyle', style.id);
    currentStyleRef.current = style.id;

    map.once('styledata', () => {
      const waiting = () => {
        if (!map.loaded()) {
          setTimeout(waiting, 33);
        } else {
          initMap();
          updateReadyValue(true);
        }
      };
      waiting();
    });
  }, []);

  const handleSelectStyle = useCallback((style) => {
    if (!style) return;
    setDefaultMapStyle(style.id);
    applyStyle(style);
  }, [applyStyle, setDefaultMapStyle]);

  useEffectAsync(async () => {
    if (theme.direction === 'rtl') {
      maplibregl.setRTLTextPlugin('/mapbox-gl-rtl-text.js');
    }
  }, [theme.direction]);

  useEffect(() => {
    const attribution = new maplibregl.AttributionControl({ compact: true });
    map.addControl(attribution, theme.direction === 'rtl' ? 'bottom-left' : 'bottom-right');
    return () => {
      map.removeControl(attribution);
    };
  }, [theme.direction]);

  useEffect(() => {
    if (maxZoom) {
      map.setMaxZoom(maxZoom);
    }
  }, [maxZoom]);

  useEffect(() => {
    maplibregl.accessToken = mapboxAccessToken;
  }, [mapboxAccessToken]);

  const availableStyles = useMemo(() => {
    const filteredStyles = mapStyles.filter((s) => s.available && activeMapStyles.includes(s.id));
    return filteredStyles.length ? filteredStyles : mapStyles.filter((s) => s.id === 'osm');
  }, [mapStyles, activeMapStyles]);

  useEffect(() => {
    const selectedStyle = availableStyles.find((s) => s.id === defaultMapStyle) || availableStyles[0];
    if (selectedStyle) {
      applyStyle(selectedStyle);
      if (selectedStyle.id !== defaultMapStyle) {
        setDefaultMapStyle(selectedStyle.id);
      }
    }
  }, [availableStyles, defaultMapStyle, applyStyle, setDefaultMapStyle]);

  useEffect(() => {
    const listener = (ready) => setMapReady(ready);
    addReadyListener(listener);
    return () => {
      removeReadyListener(listener);
    };
  }, []);

  useLayoutEffect(() => {
    const currentEl = containerEl.current;
    currentEl.appendChild(mapContainerElement);
    map.resize();
    return () => {
      currentEl.removeChild(mapContainerElement);
    };
  }, [containerEl]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} ref={containerEl}>
      <MapControls
        styles={availableStyles}
        selectedStyleId={defaultMapStyle}
        onSelectStyle={handleSelectStyle}
        mapReady={mapReady}
        {...mapControlsProps}
      />
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type.handlesMapReady) {
          return React.cloneElement(child, { mapReady });
        }
        return mapReady ? child : null;
      })}
    </div>
  );
};

export default MapView;
