import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  CardActions,
  IconButton,
  Table,
  TableBody,
  TableRow,
  TableCell,
  CardMedia,
  TableFooter,
  Link,
  Tooltip,
  Box,
  TextField,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import CloseIcon from '@mui/icons-material/Close';
import ReplayIcon from '@mui/icons-material/Replay';
import PublishIcon from '@mui/icons-material/Publish';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ShareIcon from '@mui/icons-material/Share';
import NearMeIcon from '@mui/icons-material/NearMe';
import ExploreIcon from '@mui/icons-material/Explore';
import SpeedIcon from '@mui/icons-material/Speed';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckIcon from '@mui/icons-material/Check';
import BatteryFullIcon from '@mui/icons-material/BatteryFull';
import BatteryAlertIcon from '@mui/icons-material/BatteryAlert';
import Battery20Icon from '@mui/icons-material/Battery20';
import Battery50Icon from '@mui/icons-material/Battery50';
import Battery80Icon from '@mui/icons-material/Battery80';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import WifiIcon from '@mui/icons-material/Wifi';
import DialpadIcon from '@mui/icons-material/Dialpad';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

import { useTranslation } from './LocalizationProvider';
import RemoveDialog from './RemoveDialog';
import PositionValue from './PositionValue';
import { useDeviceReadonly } from '../util/permissions';
import usePositionAttributes from '../attributes/usePositionAttributes';
import { devicesActions } from '../../store';
import { useCatch, useCatchCallback } from '../../reactHelper';
import { useAttributePreference } from '../util/preferences';
import fetchOrThrow from '../util/fetchOrThrow';

// Función para convertir grados a direcciones cardinales
const getCardinalDirection = (course) => {
  if (course === null || course === undefined) return '';
  
  const directions = [
    'Norte', 'Noreste', 'Este', 'Sureste', 
    'Sur', 'Suroeste', 'Oeste', 'Noroeste'
  ];
  
  const index = Math.round(course / 45) % 8;
  return directions[index];
};

const ignitionCache = new Map();
const gpsTelemetryCache = new Map();
const batteryLevelCache = new Map();

const carrierByMnc = {
  '01': 'Entel',
  '02': 'Movistar / Virgin Mobile',
  '03': 'Claro',
  '04': 'WOM',
  '08': 'VTR',
  '09': 'WOM',
  '10': 'Mundo Pacifico',
};

const carrierByPlmn = {
  '73001': 'Entel',
  '73002': 'Movistar / Virgin Mobile',
  '73003': 'Claro',
  '73004': 'WOM',
  '73008': 'VTR',
  '73009': 'WOM',
  '73010': 'Mundo Pacifico',
};

const getAttributeValue = (attributes = {}, keys = []) => {
  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [attributeKey, attributeValue] of Object.entries(attributes || {})) {
    if (loweredKeys.includes(attributeKey.toLowerCase())) {
      return attributeValue;
    }
  }
  return undefined;
};

const normalizeDigits = (value) => (value == null ? '' : String(value).replace(/\D/g, ''));

const getCarrierName = (attributes = {}, networkData = null) => {
  const network = networkData || attributes?.network || {};
  const firstCellTower = Array.isArray(network?.cellTowers) ? network.cellTowers[0] : null;

  const mncRaw = getAttributeValue(attributes, ['mnc', 'mobileNetworkCode'])
    ?? network?.mobileNetworkCode
    ?? firstCellTower?.mobileNetworkCode;
  const mccRaw = getAttributeValue(attributes, ['mcc', 'mobileCountryCode'])
    ?? network?.mobileCountryCode
    ?? firstCellTower?.mobileCountryCode;
  const plmnRaw = getAttributeValue(attributes, ['plmn'])
    ?? network?.plmn;
  const operatorRaw = getAttributeValue(attributes, ['operator', 'carrier'])
    ?? network?.operator
    ?? network?.carrier;

  const mncDigitsRaw = normalizeDigits(mncRaw);
  const mccDigits = normalizeDigits(mccRaw);
  const plmnDigitsRaw = normalizeDigits(plmnRaw);

  const inferredPlmnFromMnc = (!plmnDigitsRaw && mncDigitsRaw.length >= 5 && mncDigitsRaw.startsWith('730'))
    ? mncDigitsRaw
    : '';
  const mnc = mncDigitsRaw
    ? mncDigitsRaw.slice(-2).padStart(2, '0')
    : '';
  const plmn = plmnDigitsRaw
    || inferredPlmnFromMnc
    || (mccDigits && mnc ? `${mccDigits}${mnc}` : '');

  return carrierByPlmn[plmn] || carrierByMnc[mnc] || operatorRaw || '';
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseNumericValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeGsmDbm = (rawValue) => {
  const numericValue = parseNumericValue(rawValue);
  if (numericValue == null || numericValue === 99 || numericValue === 255) {
    return null;
  }

  // CSQ/ASU GSM
  if (numericValue >= 0 && numericValue <= 31) {
    return -113 + (2 * numericValue);
  }

  // dBm directo
  if (numericValue >= -140 && numericValue <= -30) {
    return numericValue;
  }

  return null;
};

const gsmDbmToPercent = (dbm) => Math.round(clamp(((dbm + 113) / 62) * 100, 0, 100));
const satellitesToPercent = (satellites) => Math.round(clamp((satellites / 20) * 100, 0, 100));

// Componente para mostrar el nivel de batería
const BatteryRow = ({ position, device }) => {
  const { classes } = useStyles({ desktopPadding: 0 });

  const attributes = position?.attributes || {};
  const deviceKey = device?.id || position?.deviceId;
  const batteryRaw = getAttributeValue(attributes, ['batteryLevel']);
  const batteryCurrent = parseNumericValue(batteryRaw);

  useEffect(() => {
    if (deviceKey && batteryCurrent != null) {
      batteryLevelCache.set(deviceKey, batteryCurrent);
    }
  }, [deviceKey, batteryCurrent]);

  if (!position) return null;

  const batteryLevel = batteryCurrent ?? (deviceKey ? batteryLevelCache.get(deviceKey) : null);
  if (batteryLevel == null) return null;

  // Convertir a porcentaje si está en decimal
  const batteryPercent = batteryLevel > 1
    ? Math.round(clamp(batteryLevel, 0, 100))
    : Math.round(clamp(batteryLevel * 100, 0, 100));
  
  // Seleccionar ícono y color basado en el nivel
  const getBatteryIcon = (level) => {
    if (level <= 20) return <BatteryAlertIcon sx={{ fontSize: 16, color: '#f44336' }} />;
    if (level <= 35) return <Battery20Icon sx={{ fontSize: 16, color: '#ff9800' }} />;
    if (level <= 60) return <Battery50Icon sx={{ fontSize: 16, color: '#ff9800' }} />;
    if (level <= 85) return <Battery80Icon sx={{ fontSize: 16, color: '#4caf50' }} />;
    return <BatteryFullIcon sx={{ fontSize: 16, color: '#4caf50' }} />;
  };
  
  const getBatteryColor = (level) => {
    if (level <= 20) return '#f44336';
    if (level <= 35) return '#ff9800';
    return '#4caf50';
  };
  
  return (
    <TableRow>
      <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
        {/* Línea separadora */}
        <Box sx={{ 
          borderTop: '1px solid #f0f0f0', 
          marginBottom: '12px',
          marginTop: '4px'
        }} />
        
        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
          Batería
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          {getBatteryIcon(batteryPercent)}
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Nivel de batería
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', marginLeft: '24px' }}>
          <Typography variant="body2" sx={{ 
            fontSize: '12px', 
            fontWeight: 400, 
            color: getBatteryColor(batteryPercent),
            marginRight: '8px'
          }}>
            {batteryPercent}%
          </Typography>
          {/* Barra de progreso */}
          <Box sx={{ 
            flex: 1, 
            height: '4px', 
            backgroundColor: '#e0e0e0', 
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <Box sx={{ 
              width: `${batteryPercent}%`, 
              height: '100%', 
              backgroundColor: getBatteryColor(batteryPercent),
              transition: 'width 0.3s ease'
            }} />
          </Box>
        </Box>
      </TableCell>
    </TableRow>
  );
};

// Componente para mostrar información GPS
const GPSRow = ({ position, device }) => {
  const { classes } = useStyles({ desktopPadding: 0 });

  const attributes = position?.attributes || {};
  const deviceKey = device?.id || position?.deviceId;
  const satellitesRaw = getAttributeValue(attributes, ['sat', 'satellites']);
  const satellitesCurrent = parseNumericValue(satellitesRaw);
  const gsmRaw = getAttributeValue(attributes, ['rssi', 'signal', 'csq', 'asu']);
  const gsmDbmCurrent = normalizeGsmDbm(gsmRaw);
  const carrierCurrent = getCarrierName(attributes, position?.network);

  useEffect(() => {
    if (!position || !deviceKey) {
      return;
    }

    const previousTelemetry = gpsTelemetryCache.get(deviceKey) || {};
    const nextTelemetry = { ...previousTelemetry };
    let hasChanges = false;

    if (gsmDbmCurrent != null) {
      nextTelemetry.gsmDbm = gsmDbmCurrent;
      hasChanges = true;
    }
    if (satellitesCurrent != null) {
      nextTelemetry.satellites = satellitesCurrent;
      hasChanges = true;
    }
    if (carrierCurrent) {
      nextTelemetry.carrier = carrierCurrent;
      hasChanges = true;
    }

    if (hasChanges) {
      gpsTelemetryCache.set(deviceKey, nextTelemetry);
    }
  }, [position, deviceKey, gsmDbmCurrent, satellitesCurrent, carrierCurrent]);

  if (!position) return null;
  
  // Estado de conexión basado en el estado del dispositivo
  const getConnectionStatus = () => {
    if (device?.status === 'online') return { text: 'En línea', color: '#4caf50' };
    if (device?.status === 'offline') return { text: 'Fuera de línea', color: '#f44336' };
    return { text: 'Desconocido', color: '#9e9e9e' };
  };
  
  const connectionStatus = getConnectionStatus();
  
  // Nivel de batería
  const batteryLevel = getAttributeValue(attributes, ['batteryLevel']);
  const batteryPercent = batteryLevel > 1 ? batteryLevel : Math.round((batteryLevel || 0) * 100);
  
  const cachedTelemetry = deviceKey ? (gpsTelemetryCache.get(deviceKey) || {}) : {};
  const satellitesValue = satellitesCurrent ?? cachedTelemetry.satellites ?? null;
  const satellitesPercent = satellitesValue != null ? satellitesToPercent(satellitesValue) : 0;

  // Precisión
  const accuracyValue = attributes.accuracy ?? position.accuracy;

  const gsmDbmValue = gsmDbmCurrent ?? cachedTelemetry.gsmDbm ?? null;
  const gsmPercent = gsmDbmValue != null ? gsmDbmToPercent(gsmDbmValue) : 100;
  const carrierName = carrierCurrent || cachedTelemetry.carrier || 'Operador desconocido';
  
  return (
    <TableRow>
      <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
        {/* Línea separadora */}
        <Box sx={{ 
          borderTop: '1px solid #f0f0f0', 
          marginBottom: '12px',
          marginTop: '4px'
        }} />
        
        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
          GPS
        </Typography>
        
        {/* Estado de conexión */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <WifiIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Estado de conexión
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ 
          fontSize: '12px', 
          fontWeight: 400, 
          color: connectionStatus.color, 
          marginLeft: '24px', 
          marginBottom: '8px' 
        }}>
          {connectionStatus.text}
        </Typography>
        
        {/* Nivel de batería */}
        {batteryLevel !== undefined && batteryLevel !== null && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
              <BatteryFullIcon sx={{ fontSize: 16, color: '#666' }} />
              <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
                Nivel de batería
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ 
              fontSize: '12px', 
              fontWeight: 400, 
              color: '#000', 
              marginLeft: '24px', 
              marginBottom: '8px' 
            }}>
              {batteryPercent}%
            </Typography>
          </>
        )}
        
        {/* Señal GPS */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <GpsFixedIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Señal GPS
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ 
          fontSize: '12px', 
          fontWeight: 400, 
          color: '#000', 
          marginLeft: '24px', 
          marginBottom: '8px' 
        }}>
          {satellitesPercent}%
        </Typography>
        
        {/* Señal GSM */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <SignalCellularAltIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Señal GSM
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ 
          fontSize: '12px', 
          fontWeight: 400, 
          color: '#000', 
          marginLeft: '24px',
          marginBottom: '8px',
        }}>
          {gsmPercent}%
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: '10px',
            color: '#999',
            marginLeft: '24px',
            display: 'block',
            marginBottom: '4px',
          }}
        >
          Operador: {carrierName}
        </Typography>

        {/* Precisión */}
        {accuracyValue !== undefined && accuracyValue !== null && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
              <GpsFixedIcon sx={{ fontSize: 16, color: '#666' }} />
              <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
                Precisión
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ 
              fontSize: '12px', 
              fontWeight: 400, 
              color: '#000', 
              marginLeft: '24px' 
            }}>
              {accuracyValue} m
            </Typography>
          </>
        )}
      </TableCell>
    </TableRow>
  );
};

const IdentifierRow = ({ device }) => {
  const { classes } = useStyles({ desktopPadding: 0 });

  if (!device) return null;

  return (
    <TableRow>
      <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
        <Box
          sx={{
            borderTop: '1px solid #f0f0f0',
            marginBottom: '12px',
            marginTop: '4px',
          }}
        />

        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
          Identificador
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <DialpadIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            ID (IMEI)
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontSize: '12px',
            fontWeight: 400,
            color: '#000',
            marginLeft: '24px',
          }}
        >
          {device.uniqueId || 'N/A'}
        </Typography>
      </TableCell>
    </TableRow>
  );
};

// Componente para mostrar el estado del dispositivo
const DeviceStatusRow = ({ position, device }) => {
  const { classes } = useStyles({ desktopPadding: 0 });
  
  if (!position) return null;

  const ignitionKey = device?.id || position.deviceId;
  const hasIgnition = Object.prototype.hasOwnProperty.call(position.attributes || {}, 'ignition');
  const ignitionCurrent = hasIgnition ? Boolean(position.attributes.ignition) : undefined;

  useEffect(() => {
    if (ignitionKey && ignitionCurrent !== undefined) {
      ignitionCache.set(ignitionKey, ignitionCurrent);
    }
  }, [ignitionKey, ignitionCurrent]);

  const ignitionOn = ignitionCurrent !== undefined
    ? ignitionCurrent
    : Boolean(ignitionKey && ignitionCache.get(ignitionKey));
  
  const speedKmh = position.speed ? Math.round(position.speed * 1.852) : 0;
  const direction = getCardinalDirection(position.course);
  const isMoving = speedKmh > 0;
  
  const statusText = isMoving ? 'En movimiento' : 'Detenido';
  const statusColor = device?.status === 'online' ? (isMoving ? '#4CAF50' : '#2196F3') : '#9E9E9E';
  const onFootValue = position.attributes?.on_foot;
  
  return (
    <TableRow>
      <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
        {/* Línea separadora */}
        <Box sx={{ 
          borderTop: '1px solid #f0f0f0', 
          marginBottom: '12px',
          marginTop: '4px'
        }} />
        
        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
          Estado
        </Typography>

        {/* Línea 0: Ignicion */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <VpnKeyIcon sx={{ fontSize: 16, color: ignitionOn ? '#4CAF50' : '#666', flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Ignicion
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontSize: '12px',
            fontWeight: 400,
            color: ignitionOn ? '#4CAF50' : '#000',
            marginLeft: '24px',
            marginBottom: '8px',
          }}
        >
          {ignitionOn ? 'Encendida' : 'Apagada'}
        </Typography>
        
        {/* Línea 1: Estado con ícono sin círculo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <NearMeIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            {statusText}
          </Typography>
        </Box>
        
        {/* Línea 2: Velocidad */}
        <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', marginLeft: '24px', marginBottom: '4px' }}>
          {speedKmh} km/h
        </Typography>

        {/* Línea 2.1: on_foot */}
        {onFootValue !== undefined && onFootValue !== null && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
              <PersonIcon sx={{ fontSize: 16, color: '#666' }} />
              <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
                on_foot
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', marginLeft: '24px', marginBottom: '4px' }}>
              {String(onFootValue)}
            </Typography>
          </>
        )}
        
        {/* Línea 3: Actualizado */}
        <Typography variant="caption" sx={{ fontSize: '10px', color: '#999', marginLeft: '24px', display: 'block', marginBottom: direction ? '4px' : '0px' }}>
          Actualizado: {position.fixTime ? new Date(position.fixTime).toLocaleString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
          }).replace(/-/g, '/') : 'N/A'}
        </Typography>
        
        {/* Línea 4: Dirección si existe */}
        {direction && (
          <Box sx={{ marginLeft: '0px', marginBottom: '4px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, marginBottom: '2px' }}>
              <ExploreIcon sx={{ fontSize: 16, color: '#666' }} />
              <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>
                Dirección:
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', marginLeft: '24px' }}>
              {direction}
            </Typography>
          </Box>
        )}
        
        {/* Línea 5: Altitud si existe */}
        {position.altitude !== undefined && position.altitude !== null && (
          <Box sx={{ marginLeft: '0px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, marginBottom: '2px' }}>
              <ExploreIcon sx={{ fontSize: 16, color: '#666' }} />
              <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>
                Altitud:
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', marginLeft: '24px' }}>
              {Math.round(position.altitude)} m
            </Typography>
          </Box>
        )}
      </TableCell>
    </TableRow>
  );
};

// Componente para mostrar odómetro, recorrido total y horas trabajadas
const OdometerHoursRow = ({ position, device }) => {
  const { classes } = useStyles({ desktopPadding: 0 });
  const deviceReadonly = useDeviceReadonly();
  const dispatch = useDispatch();
  
  // Estados para controlar edición
  const [editingOdometer, setEditingOdometer] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [tempOdometerValue, setTempOdometerValue] = useState('');
  const [tempHoursValue, setTempHoursValue] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Usar directamente los valores de position y device como PositionValue
  const totalDistance = position?.attributes?.totalDistance || device?.attributes?.totalDistance || 0;
  const hours = position?.attributes?.hours || device?.attributes?.hours || 0;
  
  // Formatear distancia (convertir de metros a kilómetros)
  const distanceKm = totalDistance ? (totalDistance / 1000).toFixed(2) : '0.00';
  
  // Formatear horas (convertir milisegundos a horas y minutos)
  const totalHours = hours ? Math.floor(hours / 3600000) : 0;
  const totalMinutes = hours ? Math.floor((hours % 3600000) / 60000) : 0;
  const hoursText = `${totalHours} h ${totalMinutes} m`;
  
  // Funciones para manejar edición del odómetro
  const handleEditOdometer = () => {
    setEditingOdometer(true);
    setTempOdometerValue(distanceKm);
  };
  
  const handleSaveOdometer = useCatchCallback(async () => {
    if (!tempOdometerValue || isNaN(tempOdometerValue)) return;
    
    setLoading(true);
    try {
      const newDistanceMeters = parseFloat(tempOdometerValue) * 1000; // Convertir a metros
      
      // Crear el objeto exactamente igual que AccumulatorsPage
      const updatedItem = {
        deviceId: parseInt(device.id, 10),
        hours: hours, // Mantener las horas actuales
        totalDistance: newDistanceMeters // Nuevo valor del recorrido total
      };
      
      console.log('Guardando recorrido total:', updatedItem);
      
      const response = await fetchOrThrow(`/api/devices/${device.id}/accumulators`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem),
      });
      
      // Actualizar el device en el Redux store exactamente como AccumulatorsPage
      if (device) {
        const updatedDevice = {
          ...device,
          attributes: {
            ...device.attributes,
            totalDistance: updatedItem.totalDistance,
            hours: updatedItem.hours,
          }
        };
        dispatch(devicesActions.update([updatedDevice]));
        console.log('Device actualizado en Redux store:', updatedDevice);
      }
      
      console.log('Recorrido total guardado exitosamente');
      
      // Cerrar el modo de edición
      setEditingOdometer(false);
      setTempOdometerValue('');
    } catch (error) {
      console.error('Error updating total distance:', error);
    } finally {
      setLoading(false);
    }
  }, [tempOdometerValue, device, dispatch, hours]);
  
  const handleCancelOdometerEdit = () => {
    setEditingOdometer(false);
    setTempOdometerValue('');
  };
  
  // Funciones para manejar edición de horas
  const handleEditHours = () => {
    setEditingHours(true);
    setTempHoursValue(totalHours.toString());
  };
  
  const handleSaveHours = useCatchCallback(async () => {
    if (!tempHoursValue || isNaN(tempHoursValue)) return;
    
    setLoading(true);
    try {
      const newHoursMs = parseInt(tempHoursValue) * 3600000; // Convertir a milisegundos
      
      // Crear el objeto exactamente igual que AccumulatorsPage
      const updatedItem = {
        deviceId: parseInt(device.id, 10),
        hours: newHoursMs, // Nuevo valor de horas
        totalDistance: totalDistance // Mantener la distancia actual
      };
      
      console.log('Guardando horas:', updatedItem);
      
      const response = await fetchOrThrow(`/api/devices/${device.id}/accumulators`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem),
      });
      
      // Actualizar el device en el Redux store exactamente como AccumulatorsPage
      if (device) {
        const updatedDevice = {
          ...device,
          attributes: {
            ...device.attributes,
            totalDistance: updatedItem.totalDistance,
            hours: updatedItem.hours,
          }
        };
        dispatch(devicesActions.update([updatedDevice]));
        console.log('Device actualizado en Redux store:', updatedDevice);
      }
      
      console.log('Horas guardadas exitosamente');
      
      // Cerrar el modo de edición
      setEditingHours(false);
      setTempHoursValue('');
    } catch (error) {
      console.error('Error updating hours:', error);
    } finally {
      setLoading(false);
    }
  }, [tempHoursValue, device, dispatch, totalDistance]);
  
  const handleCancelHoursEdit = () => {
    setEditingHours(false);
    setTempHoursValue('');
  };
  
  // Retornar null DESPUÉS de todos los hooks para evitar errores de hooks
  if (!position) return null;
  
  return (
    <TableRow>
      <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
        {/* Línea separadora */}
        <Box sx={{ 
          borderTop: '1px solid #f0f0f0', 
          marginBottom: '12px',
          marginTop: '4px'
        }} />
        
        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
          Odómetro / Horas
        </Typography>
        
        {/* Línea 1: Odómetro */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <SpeedIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Odómetro
          </Typography>
        </Box>
        
        {/* Valor del Odómetro */}
        <Box sx={{ display: 'flex', alignItems: 'center', marginLeft: '24px', marginBottom: '4px' }}>
          {editingOdometer ? (
            <>
              <TextField
                size="small"
                value={tempOdometerValue}
                onChange={(e) => setTempOdometerValue(e.target.value)}
                variant="outlined"
                type="number"
                inputProps={{ step: "0.01", min: "0" }}
                sx={{ 
                  width: '80px', 
                  '& .MuiInputBase-input': { 
                    fontSize: '12px', 
                    padding: '4px 8px' 
                  } 
                }}
                disabled={loading}
              />
              <Typography variant="body2" sx={{ fontSize: '12px', color: '#000', marginLeft: '4px', marginRight: '8px' }}>
                Km
              </Typography>
              <IconButton
                size="small"
                onClick={handleSaveOdometer}
                disabled={loading}
                sx={{ padding: '2px' }}
              >
                <CheckIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleCancelOdometerEdit}
                disabled={loading}
                sx={{ padding: '2px' }}
              >
                <CloseIcon sx={{ fontSize: 14, color: '#f44336' }} />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', flex: 1 }}>
                {distanceKm} Km
              </Typography>
              {!deviceReadonly && (
                <IconButton
                  size="small"
                  onClick={handleEditOdometer}
                  sx={{ padding: '2px', marginLeft: '8px' }}
                >
                  <EditIcon sx={{ fontSize: 12, color: '#666' }} />
                </IconButton>
              )}
            </>
          )}
        </Box>
        
        {/* Línea 2: Horas trabajadas */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
          <AccessTimeIcon sx={{ fontSize: 16, color: '#666' }} />
          <Typography variant="body2" sx={{ fontSize: '10px', color: '#999', flex: 1 }}>
            Horas trabajadas
          </Typography>
        </Box>
        
        {/* Valor de las Horas trabajadas */}
        <Box sx={{ display: 'flex', alignItems: 'center', marginLeft: '24px' }}>
          {editingHours ? (
            <>
              <TextField
                size="small"
                value={tempHoursValue}
                onChange={(e) => setTempHoursValue(e.target.value)}
                variant="outlined"
                type="number"
                inputProps={{ step: "1", min: "0" }}
                sx={{ 
                  width: '80px', 
                  '& .MuiInputBase-input': { 
                    fontSize: '12px', 
                    padding: '4px 8px' 
                  } 
                }}
                disabled={loading}
              />
              <Typography variant="body2" sx={{ fontSize: '12px', color: '#000', marginLeft: '4px', marginRight: '8px' }}>
                h
              </Typography>
              <IconButton
                size="small"
                onClick={handleSaveHours}
                disabled={loading}
                sx={{ padding: '2px' }}
              >
                <CheckIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleCancelHoursEdit}
                disabled={loading}
                sx={{ padding: '2px' }}
              >
                <CloseIcon sx={{ fontSize: 14, color: '#f44336' }} />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 400, color: '#000', flex: 1 }}>
                {hoursText}
              </Typography>
              {!deviceReadonly && (
                <IconButton
                  size="small"
                  onClick={handleEditHours}
                  sx={{ padding: '2px', marginLeft: '8px' }}
                >
                  <EditIcon sx={{ fontSize: 12, color: '#666' }} />
                </IconButton>
              )}
            </>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
};
const useStyles = makeStyles()((theme, {
  desktopPadding,
  anchorToSidebar = false,
  sidebarWidth = 300,
  sidebarGap = 10,
}) => ({
  card: {
    pointerEvents: 'auto',
    width: '300px', // Ancho de 300px
    height: 'calc(100vh - 48px)', // Misma altura que el sidebar (100vh - 48px)
    display: 'flex',
    flexDirection: 'column',
  },
  cardCollapsed: {
    height: 'auto',
  },
  media: {
    height: theme.dimensions.popupImageHeight,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  mediaButton: {
    color: theme.palette.primary.contrastText,
    mixBlendMode: 'difference',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1, 1, 1, 2), // Agregado padding bottom para espacio con la línea
    borderBottom: '1px solid #f0f0f0', // Línea separadora gris suave
  },
  content: {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    flex: 1, // Ocupar todo el espacio disponible
    overflow: 'auto',
  },
  icon: {
    width: '25px',
    height: '25px',
    filter: 'brightness(0) invert(1)',
  },
  table: {
    '& .MuiTableCell-sizeSmall': {
      paddingLeft: 0,
      paddingRight: 0,
    },
    '& .MuiTableCell-sizeSmall:first-of-type': {
      paddingRight: theme.spacing(1),
    },
  },
  cell: {
    borderBottom: 'none',
  },
  actions: {
    justifyContent: 'space-between',
  },
  root: {
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 5,
    [theme.breakpoints.up('md')]: {
      left: anchorToSidebar
        ? `calc(var(--side-nav-width, 240px) + ${theme.spacing(3)} + ${sidebarWidth}px + ${sidebarGap}px)`
        : 'calc(620px)',
      top: '24px', // Misma altura que el sidebar (theme.spacing(3) = 24px)
      height: 'calc(100% - 48px)', // Misma altura variable que el sidebar (theme.spacing(6) = 48px)
      transform: 'none', // Remover centrado horizontal
    },
    [theme.breakpoints.down('md')]: {
      left: '50%',
      bottom: `calc(${theme.spacing(3)} + ${theme.dimensions.bottomBarHeight}px)`,
      transform: 'translateX(-50%)',
    },
  },
}));

const StatusRow = ({ name, content, isAddress = false }) => {
  const { classes } = useStyles({ desktopPadding: 0 });

  if (isAddress) {
    return (
      <TableRow>
        <TableCell className={classes.cell} colSpan={2} sx={{ padding: '8px 0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: '4px', fontSize: '13px' }}>
            {name}
          </Typography>
          {content}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className={classes.cell}>
        <Typography variant="body2">{name}</Typography>
      </TableCell>
      <TableCell className={classes.cell}>
        <Typography variant="body2" color="textSecondary">{content}</Typography>
      </TableCell>
    </TableRow>
  );
};

const StatusCard = ({
  deviceId,
  position,
  onClose,
  disableActions,
  desktopPadding = 0,
  anchorToSidebar = false,
  sidebarWidth = 300,
  sidebarGap = 10,
}) => {
  const { classes } = useStyles({
    desktopPadding,
    anchorToSidebar,
    sidebarWidth,
    sidebarGap,
  });
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const t = useTranslation();

  const deviceReadonly = useDeviceReadonly();

  const device = useSelector((state) => state.devices.items[deviceId]);
  const shareDisabled = useSelector((state) => state.session.server.attributes.disableShare);
  const user = useSelector((state) => state.session.user);

  const deviceImage = device?.attributes?.deviceImage;

  const positionAttributes = usePositionAttributes(t);
  const positionItems = useAttributePreference('positionItems', 'address,altitude,accuracy,sat,batteryLevel');
  
  // Filtrar elementos que ya mostramos en secciones personalizadas
  const excludedProperties = ['fixTime', 'speed', 'totalDistance', 'batteryLevel', 'altitude', 'latitude', 'accuracy', 'sat', 'satellites', 'ignition'];
  const filteredItems = positionItems
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key && !excludedProperties.includes(key));
  const idIndex = filteredItems.indexOf('id');
  const visibleItems = idIndex >= 0 ? filteredItems.slice(0, idIndex) : filteredItems;

  const [removing, setRemoving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleRemove = useCatch(async (removed) => {
    if (removed) {
      const response = await fetchOrThrow('/api/devices');
      dispatch(devicesActions.refresh(await response.json()));
    }
    setRemoving(false);
  });

  return (
    <>
      <div className={classes.root}>
        {device && (
          <Card elevation={3} className={`${classes.card} ${collapsed ? classes.cardCollapsed : ''}`}>
              {deviceImage ? (
                <CardMedia
                  className={`${classes.media} draggable-header`}
                  image={`/api/media/${device.uniqueId}/${deviceImage}`}
                >
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => setCollapsed((prev) => !prev)}
                      onTouchStart={() => setCollapsed((prev) => !prev)}
                    >
                      {collapsed ? <ExpandMoreIcon fontSize="small" className={classes.mediaButton} /> : <ExpandLessIcon fontSize="small" className={classes.mediaButton} />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={onClose}
                      onTouchStart={onClose}
                    >
                      <CloseIcon fontSize="small" className={classes.mediaButton} />
                    </IconButton>
                  </Box>
                </CardMedia>
              ) : (
                <div className={`${classes.header} draggable-header`}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {device.name}
                    </Typography>
                  </div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => setCollapsed((prev) => !prev)}
                      onTouchStart={() => setCollapsed((prev) => !prev)}
                    >
                      {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={onClose}
                      onTouchStart={onClose}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </div>
              )}
              {position && !collapsed && (
                <CardContent className={classes.content}>
                  <Table size="small" classes={{ root: classes.table }}>
                    <TableBody>
                      {visibleItems
                        .filter((key) => {
                          const normalizedKey = String(key || '').toLowerCase();
                          const attributeName = positionAttributes[key]?.name;
                          return normalizedKey !== 'ignition' && attributeName !== t('positionIgnition');
                        })
                        .filter((key) => position.hasOwnProperty(key) || position.attributes.hasOwnProperty(key))
                        .map((key) => {
                        const rows = [];
                        
                        // Agregar la fila normal
                        rows.push(
                          <StatusRow
                            key={key}
                            name={positionAttributes[key]?.name || key}
                            isAddress={key === 'address'}
                            content={(
                              <PositionValue
                                position={position}
                                property={position.hasOwnProperty(key) ? key : null}
                                attribute={position.hasOwnProperty(key) ? null : key}
                              />
                            )}
                          />
                        );
                        
                        // Si es la dirección (address), agregar Estado y luego Odómetro/Horas
                        if (key === 'address') {
                          rows.push(
                            <DeviceStatusRow key="device-status" position={position} device={device} />
                          );
                          rows.push(
                            <OdometerHoursRow key="odometer-hours" position={position} device={device} />
                          );
                          rows.push(
                            <BatteryRow key="battery-level" position={position} device={device} />
                          );
                          rows.push(
                            <GPSRow key="gps-info" position={position} device={device} />
                          );
                          rows.push(
                            <IdentifierRow key="identifier" device={device} />
                          );
                        }
                        
                          return rows;
                        }).flat()}
                    </TableBody>
                    <TableFooter />
                  </Table>
                </CardContent>
              )}
              {!collapsed && (
                <CardActions classes={{ root: classes.actions }} disableSpacing>
                <Tooltip title={t('deviceShare')}>
                  <IconButton
                    color="secondary"
                    onClick={() => navigate(`/settings/device/${deviceId}/share`)}
                    disabled={disableActions || !position || shareDisabled || user?.temporary}
                  >
                    <ShareIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('reportReplay')}>
                  <IconButton
                    onClick={() => navigate(`/replay?deviceId=${deviceId}`)}
                    disabled={disableActions || !position}
                  >
                    <ReplayIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('commandTitle')}>
                  <IconButton
                    onClick={() => navigate(`/settings/device/${deviceId}/command`)}
                    disabled={disableActions}
                  >
                    <PublishIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('sharedEdit')}>
                  <IconButton
                    onClick={() => navigate(`/settings/device/${deviceId}`)}
                    disabled={disableActions || deviceReadonly}
                  >
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('sharedRemove')}>
                  <IconButton
                    color="error"
                    onClick={() => setRemoving(true)}
                    disabled={disableActions || deviceReadonly}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
                </CardActions>
              )}
          </Card>
        )}
      </div>
      <RemoveDialog
        open={removing}
        endpoint="devices"
        itemId={deviceId}
        onResult={(removed) => handleRemove(removed)}
      />
    </>
  );
};

export default StatusCard;
