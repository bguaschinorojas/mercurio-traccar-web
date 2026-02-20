import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
  IconButton, Tooltip, Avatar, ListItemAvatar, ListItemText, ListItemButton,
  Typography,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import NearMeIcon from '@mui/icons-material/NearMe';
import NearMeDisabledIcon from '@mui/icons-material/NearMeDisabled';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { devicesActions } from '../store';
import {
  formatAlarm, formatStatus, getStatusColor,
} from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import { updateStationaryState } from '../common/util/stationaryState';

dayjs.extend(relativeTime);

const formatStoppedDuration = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '<1m';
  }
  const totalMinutes = Math.floor(durationMs / 60000);
  if (totalMinutes < 1) {
    return '<1m';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const useStyles = makeStyles()((theme) => ({
  batteryText: {
    fontSize: '0.75rem',
    fontWeight: 'normal',
    lineHeight: '0.875rem',
  },
  success: {
    color: theme.palette.success.main,
  },
  warning: {
    color: theme.palette.warning.main,
  },
  error: {
    color: theme.palette.error.main,
  },
  neutral: {
    color: theme.palette.neutral.main,
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
  },
  deviceMoving: {
    color: '#81C784', // Verde pastel
  },
  parkedLetter: {
    color: '#64B5F6',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1,
  },
  deviceOffline: {
    color: '#E57373', // Rojo suave
  },
  customAvatar: {
    backgroundColor: 'transparent', // Quitar fondo
    border: '2px solid', // Agregar borde
    width: '32px', // Hacer más pequeño
    height: '32px', // Hacer más pequeño
  },
  avatarContainer: {
    minWidth: '50px', // Ancho mínimo del contenedor
    paddingLeft: '12px', // Espacio a la izquierda
    paddingRight: '12px', // Espacio a la derecha del ícono
  },
  listItem: {
    padding: '0px', // Sin padding para eliminar espacios
    margin: '0px', // Sin margin
    boxSizing: 'border-box',
    height: '72px', // Altura fija
    minHeight: '72px', // Altura mínima fija
    borderTop: 'none',
    borderBottom: '1px solid #f0f0f0',
  },
  avatarMoving: {
    borderColor: '#81C784', // Borde verde pastel
  },
  avatarParked: {
    borderColor: '#64B5F6', // Borde azul suave
  },
  avatarOffline: {
    borderColor: '#E57373', // Borde rojo suave
  },
  primaryText: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.5,
    overflow: 'hidden',
  },
  speedIcon: {
    fontSize: '12px',
    marginRight: '4px',
    verticalAlign: 'middle',
    padding: '2px',
    borderRadius: '3px',
    border: '1px solid',
  },
  speedIconMoving: {
    color: '#81C784', // Verde pastel
    borderColor: '#81C784', // Borde verde
  },
  speedIconParked: {
    color: '#64B5F6', // Azul suave
    borderColor: '#64B5F6', // Borde azul
  },
  speedIconParkedSimple: {
    fontSize: '12px',
    marginRight: '4px',
    verticalAlign: 'middle',
    color: '#64B5F6', // Azul suave - sin cuadrado
  },
  speedText: {
    fontSize: '10px',
  },
  statusText: {
    fontSize: '10px',
  },
  deviceRowContainer: {
    height: '72px', // Altura fija del contenedor
    minHeight: '72px', // Altura mínima
    display: 'flex',
    alignItems: 'center', // Centrar verticalmente
  },
}));

const DeviceRow = ({ data, index, style, item: itemProp }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const t = useTranslation();

  const admin = useAdministrator();
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);

  const item = itemProp || data[index];
  const position = useSelector((state) => state.session.positions[item.id]);

  const devicePrimary = useAttributePreference('devicePrimary', 'name');
  const deviceSecondary = useAttributePreference('deviceSecondary', '');

  const secondaryText = () => {
    const parseTimestamp = (value) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const isOnline = item.status === 'online';
    const lastUpdateTime = parseTimestamp(item.lastUpdate);
    const lastFixTime = parseTimestamp(position?.fixTime);
    const lastSignalTime = lastUpdateTime ?? lastFixTime;
    const hasReportedSignal = Boolean(position) || lastSignalTime !== null;
    const offlineDurationMs = !isOnline && lastSignalTime !== null
      ? Math.max(0, Date.now() - lastSignalTime)
      : 0;
    const isLongOffline = !isOnline && offlineDurationMs >= 60 * 60 * 1000;

    if (!hasReportedSignal) {
      return (
        <span className={`${classes.error} ${classes.statusText}`}>
          Fuera de línea
        </span>
      );
    }

    if (isLongOffline) {
      return (
        <span className={`${classes.error} ${classes.speedText}`}>
          Fuera de línea: {formatStoppedDuration(offlineDurationMs)}
        </span>
      );
    }

    let status;
    if (item.status === 'online' || !item.lastUpdate) {
      status = formatStatus(item.status, t);
    } else {
      status = dayjs(item.lastUpdate).fromNow();
    }

    // Agregar velocidad si está disponible
    let speedElement = null;
    if (isOnline && position && position.speed !== undefined && position.speed !== null) {
      const speedKmh = Math.round(position.speed * 1.852); // Convertir de nudos a km/h
      const { markerState, stoppedSince } = updateStationaryState({
        deviceId: item.id,
        latitude: position.latitude,
        longitude: position.longitude,
        speedKmh,
        fixTime: position.fixTime,
      });
      const isMoving = markerState === 'moving';
      const positionTime = Number.isFinite(Date.parse(position.fixTime)) ? Date.parse(position.fixTime) : Date.now();
      let speedOrStopText;

      if (isMoving) {
        speedOrStopText = `${speedKmh} km/h`;
      } else {
        const elapsedSinceStop = Math.max(0, Date.now() - (stoppedSince || positionTime));
        speedOrStopText = formatStoppedDuration(elapsedSinceStop);
      }

      speedElement = (
        <span className={classes.speedText}>
          {isMoving ? (
            <NearMeIcon className={`${classes.speedIcon} ${classes.speedIconMoving}`} />
          ) : null}
          {speedOrStopText}
        </span>
      );
    }

    return (
      <>
        {speedElement}
        {speedElement ? ' ' : null}
        <span className={`${classes[getStatusColor(item.status)]} ${classes.statusText}`}>
          {status}
        </span>
      </>
    );
  };

  const getDeviceIcon = () => {
    // Si no hay posición, consideramos que está offline
    if (!position) {
      return {
        icon: <NearMeDisabledIcon className={classes.deviceOffline} />,
        avatarClass: classes.avatarOffline
      };
    }

    // Verificar si está online basado en el estado del dispositivo
    const isOnline = item.status === 'online';
    
    if (!isOnline) {
      return {
        icon: <NearMeDisabledIcon className={classes.deviceOffline} />,
        avatarClass: classes.avatarOffline
      };
    }

    // Si está online, verificar si está en movimiento
    // Consideramos que está en movimiento si tiene velocidad > 0
    const isMoving = position.speed && position.speed > 0;
    
    if (isMoving) {
      return {
        icon: <NearMeIcon className={classes.deviceMoving} />,
        avatarClass: classes.avatarMoving
      };
    } else {
      return {
        icon: <span className={classes.parkedLetter}>E</span>,
        avatarClass: classes.avatarParked
      };
    }
  };

  return (
    <div style={{ ...style }} className={classes.deviceRowContainer}>
      <ListItemButton
        key={item.id}
        onClick={() => dispatch(devicesActions.selectId(item.id))}
        disabled={!admin && item.disabled}
        selected={selectedDeviceId === item.id}
        className={`${selectedDeviceId === item.id ? classes.selected : ''} ${classes.listItem}`}
      >
        <ListItemAvatar className={classes.avatarContainer}>
          <Avatar className={`${classes.customAvatar} ${getDeviceIcon().avatarClass}`}>
            {getDeviceIcon().icon}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={item[devicePrimary]}
          secondary={secondaryText()}
          slots={{
            primary: Typography,
            secondary: Typography,
          }}
          slotProps={{
            primary: { noWrap: true, className: classes.primaryText },
            secondary: { noWrap: true },
          }}
        />
        {position && (
          <>
            {position.attributes.hasOwnProperty('alarm') && (
              <Tooltip title={`${t('eventAlarm')}: ${formatAlarm(position.attributes.alarm, t)}`}>
                <IconButton size="small">
                  <ErrorIcon fontSize="small" className={classes.error} />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </ListItemButton>
    </div>
  );
};

export default DeviceRow;
