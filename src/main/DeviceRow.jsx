import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
  IconButton,
  Tooltip,
  Avatar,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Typography,
  Menu,
  MenuItem,
  Box,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import NearMeIcon from '@mui/icons-material/NearMe';
import NearMeDisabledIcon from '@mui/icons-material/NearMeDisabled';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ShareIcon from '@mui/icons-material/Share';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigate } from 'react-router-dom';
import { devicesActions } from '../store';
import {
  formatAlarm, formatStatus, getStatusColor,
} from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import { updateStationaryState } from '../common/util/stationaryState';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useCatchCallback } from '../reactHelper';
import {
  REPORT_COLOR_PALETTE,
  normalizeReportColor,
  resolveDeviceReportColor,
} from '../common/util/reportColor';

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
  deviceRowContainerSelected: {
    backgroundColor: theme.palette.action.selected,
    '&:hover': {
      backgroundColor: theme.palette.action.selected,
    },
  },
  deviceMoving: {
    color: '#81C784',
  },
  parkedLetter: {
    color: '#64B5F6',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1,
  },
  deviceOffline: {
    color: '#E57373',
  },
  customAvatar: {
    backgroundColor: 'transparent',
    border: '2px solid',
    width: '32px',
    height: '32px',
  },
  avatarContainer: {
    minWidth: '50px',
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  listItem: {
    padding: '0px',
    margin: '0px',
    boxSizing: 'border-box',
    height: '72px',
    minHeight: '72px',
    borderTop: 'none',
    borderBottom: 'none',
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: 'transparent',
    },
    '&.Mui-selected': {
      backgroundColor: 'transparent',
    },
    '&.Mui-selected:hover': {
      backgroundColor: 'transparent',
    },
  },
  rowMenuButton: {
    marginLeft: '4px',
    marginRight: '6px',
    color: '#6B7280',
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: '#F3F4F6',
    },
  },
  menuItemLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.palette.text.primary,
    cursor: 'default',
  },
  menuItemActionLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
  menuItemActionIcon: {
    color: '#6B7280',
    marginRight: '10px',
    fontSize: '18px',
  },
  colorPalette: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 24px)',
    gap: '8px',
    padding: '8px 16px 14px 16px',
  },
  colorOption: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    border: `1px solid ${theme.palette.divider}`,
    boxSizing: 'border-box',
    cursor: 'pointer',
    outline: 'none',
    transition: 'transform 0.1s ease',
    '&:hover': {
      transform: 'translateY(-1px)',
    },
  },
  colorOptionSelected: {
    border: '2px solid #111827',
  },
  avatarMoving: {
    borderColor: '#81C784',
  },
  avatarParked: {
    borderColor: '#64B5F6',
  },
  avatarOffline: {
    borderColor: '#E57373',
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
    color: '#81C784',
    borderColor: '#81C784',
  },
  speedIconParked: {
    color: '#64B5F6',
    borderColor: '#64B5F6',
  },
  speedIconParkedSimple: {
    fontSize: '12px',
    marginRight: '4px',
    verticalAlign: 'middle',
    color: '#64B5F6',
  },
  speedText: {
    fontSize: '10px',
  },
  statusText: {
    fontSize: '10px',
  },
  deviceRowContainer: {
    height: '72px',
    minHeight: '72px',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    borderBottom: '1px solid #f0f0f0',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

const DeviceRow = ({ data, index, style, item: itemProp }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const admin = useAdministrator();
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const groups = useSelector((state) => state.groups.items);
  const shareDisabled = useSelector((state) => state.session.server.attributes.disableShare);
  const user = useSelector((state) => state.session.user);

  const item = itemProp || data[index];
  const position = useSelector((state) => state.session.positions[item.id]);
  const isSelected = selectedDeviceId === item.id;

  const devicePrimary = useAttributePreference('devicePrimary', 'name');
  const selectedReportColor = resolveDeviceReportColor(item, groups) || REPORT_COLOR_PALETTE[0];
  const colorMenuOpen = Boolean(menuAnchorEl);

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = (event) => {
    event?.stopPropagation();
    setMenuAnchorEl(null);
  };

  const saveDeviceColor = useCatchCallback(async (colorValue) => {
    const normalized = normalizeReportColor(colorValue);
    if (!normalized) {
      return;
    }
    const updatedDevice = {
      ...item,
      attributes: {
        ...(item.attributes || {}),
        'web.reportColor': normalized,
      },
    };
    const response = await fetchOrThrow(`/api/devices/${item.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedDevice),
    });
    dispatch(devicesActions.update([await response.json()]));
  }, [dispatch, item]);

  const handleColorSelect = (event, colorValue) => {
    event.stopPropagation();
    saveDeviceColor(colorValue);
    setMenuAnchorEl(null);
  };

  const handleShareDevice = (event) => {
    event.stopPropagation();
    setMenuAnchorEl(null);
    navigate(`/settings/device/${item.id}/share`);
  };

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
          Fuera de linea
        </span>
      );
    }

    if (isLongOffline) {
      return (
        <span className={`${classes.error} ${classes.speedText}`}>
          Fuera de linea: {formatStoppedDuration(offlineDurationMs)}
        </span>
      );
    }

    let status;
    if (item.status === 'online' || !item.lastUpdate) {
      status = formatStatus(item.status, t);
    } else {
      status = dayjs(item.lastUpdate).fromNow();
    }

    let speedElement = null;
    if (isOnline && position && position.speed !== undefined && position.speed !== null) {
      const speedKmh = Math.round(position.speed * 1.852);
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
    if (!position) {
      return {
        icon: <NearMeDisabledIcon className={classes.deviceOffline} />,
        avatarClass: classes.avatarOffline,
      };
    }

    const isOnline = item.status === 'online';

    if (!isOnline) {
      return {
        icon: <NearMeDisabledIcon className={classes.deviceOffline} />,
        avatarClass: classes.avatarOffline,
      };
    }

    const isMoving = position.speed && position.speed > 0;

    if (isMoving) {
      return {
        icon: <NearMeIcon className={classes.deviceMoving} />,
        avatarClass: classes.avatarMoving,
      };
    }
    return {
      icon: <span className={classes.parkedLetter}>E</span>,
      avatarClass: classes.avatarParked,
    };
  };

  return (
    <div
      style={{ ...style }}
      className={`${classes.deviceRowContainer} ${isSelected ? classes.deviceRowContainerSelected : ''}`}
    >
      <ListItemButton
        key={item.id}
        onClick={() => dispatch(devicesActions.selectId(item.id))}
        disabled={!admin && item.disabled}
        selected={isSelected}
        className={classes.listItem}
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
      <IconButton
        size="small"
        className={classes.rowMenuButton}
        onClick={handleMenuOpen}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={menuAnchorEl}
        open={colorMenuOpen}
        onClose={handleMenuClose}
        onClick={(event) => event.stopPropagation()}
        MenuListProps={{
          autoFocusItem: false,
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem disableRipple disableTouchRipple>
          <Typography className={classes.menuItemLabel}>
            {t('deviceChangeColor') || 'Cambiar color'}
          </Typography>
        </MenuItem>
        <Box className={classes.colorPalette}>
          {REPORT_COLOR_PALETTE.map((colorValue) => (
            <Box
              key={colorValue}
              component="button"
              type="button"
              onClick={(event) => handleColorSelect(event, colorValue)}
              className={`${classes.colorOption} ${selectedReportColor === colorValue ? classes.colorOptionSelected : ''}`}
              sx={{ backgroundColor: colorValue }}
              aria-label={`${t('deviceChangeColor') || 'Cambiar color'} ${colorValue}`}
            />
          ))}
        </Box>
        <MenuItem
          onClick={handleShareDevice}
          disabled={!position || shareDisabled || user?.temporary}
        >
          <ShareIcon className={classes.menuItemActionIcon} />
          <Typography className={classes.menuItemActionLabel}>
            {t('deviceShare') || 'Compartir dispositivo'}
          </Typography>
        </MenuItem>
      </Menu>
    </div>
  );
};

export default DeviceRow;
