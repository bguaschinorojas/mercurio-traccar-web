import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Typography, Box } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useTranslation } from './LocalizationProvider';
import { useCatch } from '../../reactHelper';
import fetchOrThrow from '../util/fetchOrThrow';

const ADDRESS_CACHE_LIMIT = 500;
const ADDRESS_REUSE_DISTANCE_METERS = 25;
const EARTH_RADIUS_METERS = 6371000;
const addressCache = new Map();
const addressRequests = new Map();

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCoordinateKey = (latitude, longitude) => {
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  if (parsedLatitude == null || parsedLongitude == null) {
    return null;
  }
  return `${parsedLatitude.toFixed(6)},${parsedLongitude.toFixed(6)}`;
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getDistanceMeters = (latitude1, longitude1, latitude2, longitude2) => {
  const deltaLatitude = toRadians(latitude2 - latitude1);
  const deltaLongitude = toRadians(longitude2 - longitude1);
  const normalizedLatitude1 = toRadians(latitude1);
  const normalizedLatitude2 = toRadians(latitude2);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(normalizedLatitude1) * Math.cos(normalizedLatitude2) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const getNearbyCachedAddress = (latitude, longitude, thresholdMeters = ADDRESS_REUSE_DISTANCE_METERS) => {
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  if (parsedLatitude == null || parsedLongitude == null) {
    return '';
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAddress = '';

  for (const [cachedCoordinateKey, cachedAddress] of addressCache.entries()) {
    if (!cachedAddress) {
      continue;
    }
    const [cachedLatitude, cachedLongitude] = cachedCoordinateKey.split(',').map((value) => Number(value));
    if (!Number.isFinite(cachedLatitude) || !Number.isFinite(cachedLongitude)) {
      continue;
    }
    const distanceMeters = getDistanceMeters(parsedLatitude, parsedLongitude, cachedLatitude, cachedLongitude);
    if (distanceMeters <= thresholdMeters && distanceMeters < bestDistance) {
      bestDistance = distanceMeters;
      bestAddress = cachedAddress;
    }
  }

  return bestAddress;
};

const cacheAddress = (key, value) => {
  if (!key || !value) return;
  if (addressCache.has(key)) {
    addressCache.delete(key);
  }
  addressCache.set(key, value);
  if (addressCache.size > ADDRESS_CACHE_LIMIT) {
    const oldestKey = addressCache.keys().next().value;
    addressCache.delete(oldestKey);
  }
};

const fetchAddressByCoordinates = async (latitude, longitude) => {
  const key = getCoordinateKey(latitude, longitude);
  if (!key) {
    return '';
  }

  if (addressRequests.has(key)) {
    return addressRequests.get(key);
  }

  const query = new URLSearchParams({ latitude, longitude });
  const request = fetchOrThrow(`/api/server/geocode?${query.toString()}`)
    .then((response) => response.text())
    .then((fetchedAddress) => {
      cacheAddress(key, fetchedAddress);
      return fetchedAddress;
    })
    .finally(() => {
      addressRequests.delete(key);
    });

  addressRequests.set(key, request);
  return request;
};

const AddressValue = ({
  latitude,
  longitude,
  originalAddress,
  position,
  stable = false,
}) => {
  const t = useTranslation();

  const addressEnabled = useSelector((state) => state.session.server.geocoderEnabled);
  const coordinateKey = getCoordinateKey(latitude, longitude);
  const cachedAddress = coordinateKey ? addressCache.get(coordinateKey) : '';

  const [address, setAddress] = useState(() => originalAddress || cachedAddress || '');
  const [loading, setLoading] = useState(false);

  const fetchAddress = useCatch(async (force = false) => {
    if (!addressEnabled || !coordinateKey) {
      return;
    }

    const cached = addressCache.get(coordinateKey);
    if (cached && !force) {
      setAddress(cached);
      return;
    }

    const nearbyCached = !force ? getNearbyCachedAddress(latitude, longitude) : '';
    if (nearbyCached) {
      cacheAddress(coordinateKey, nearbyCached);
      setAddress(nearbyCached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const fetchedAddress = await fetchAddressByCoordinates(latitude, longitude);
      if (fetchedAddress) {
        setAddress(fetchedAddress);
      } else if (!stable) {
        setAddress('');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (originalAddress) {
      setAddress(originalAddress);
      cacheAddress(coordinateKey, originalAddress);
      setLoading(false);
      return;
    }

    if (!addressEnabled || !coordinateKey) {
      setLoading(false);
      if (!stable) {
        setAddress('');
      }
      return;
    }

    const cached = addressCache.get(coordinateKey);
    if (cached) {
      setAddress(cached);
      setLoading(false);
    } else {
      const nearbyCached = getNearbyCachedAddress(latitude, longitude);
      if (nearbyCached) {
        cacheAddress(coordinateKey, nearbyCached);
        setAddress(nearbyCached);
        setLoading(false);
      } else {
        fetchAddress();
      }
    }
  }, [addressEnabled, coordinateKey, originalAddress, stable]);

  const showAddress = useCatch(async (event) => {
    event.preventDefault();
    fetchAddress(true);
  });

  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  const coordinatesText = parsedLatitude != null && parsedLongitude != null
    ? `${parsedLatitude.toFixed(6)}, ${parsedLongitude.toFixed(6)}`
    : '--, --';
  const updatedText = position?.fixTime
    ? new Date(position.fixTime).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/-/g, '/')
    : 'N/A';

  if (stable) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: 56 }}>
        <LocationOnIcon sx={{ fontSize: 16, color: '#666', marginTop: '2px', flexShrink: 0 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: '12px',
              lineHeight: 1.4,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              minHeight: '50px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={address || ''}
          >
            {address || '\u00a0'}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', color: '#999', display: 'block', marginTop: '2px' }}>
            {coordinatesText}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', color: '#999', display: 'block', marginTop: '2px' }}>
            {`Actualizado: ${updatedText}`}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (loading && !address) {
    return 'Cargando direccion...';
  }

  if (address) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <LocationOnIcon sx={{ fontSize: 16, color: '#666', marginTop: '2px', flexShrink: 0 }} />
        <Box>
          <Typography variant="body2" sx={{ fontSize: '12px', lineHeight: 1.4, wordBreak: 'break-word' }}>
            {address}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', color: '#999', display: 'block', marginTop: '2px' }}>
            {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}
          </Typography>
          {position?.fixTime && (
            <Typography variant="caption" sx={{ fontSize: '10px', color: '#999', display: 'block', marginTop: '2px' }}>
              Actualizado: {new Date(position.fixTime).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).replace(/-/g, '/')}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  if (addressEnabled) {
    return (<Link href="#" onClick={showAddress}>{t('sharedShowAddress')}</Link>);
  }

  return '';
};

export default AddressValue;
