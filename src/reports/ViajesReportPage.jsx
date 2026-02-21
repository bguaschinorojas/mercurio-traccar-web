import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  FormControl,
  Grow,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider as MuiDateLocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import BottomMenu from '../common/components/BottomMenu';
import ReportsMenu from './components/ReportsMenu';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { distanceFromMeters, speedFromKnots } from '../common/util/converter';
import { useAttributePreference } from '../common/util/preferences';

dayjs.locale('es');

const cruPalette = {
  primary: '#DB5359',
  accent: '#EA9A9E',
  text: '#383A44',
  muted: '#6B7280',
  base: '#FFFFFF',
  soft: '#EBEFF1',
  surfaceSoft: '#F8FAFC',
};

const ADDRESS_KEY_DECIMALS = 4;
const GEOCODE_REQUEST_TIMEOUT_MS = 8000;
const GEOCODE_CONCURRENCY = 2;

const useStyles = makeStyles()((theme) => ({
  root: {
    minHeight: '100vh',
    backgroundColor: theme.palette.background.default,
  },
  content: {
    height: '100vh',
    display: 'flex',
    padding: 0,
    boxSizing: 'border-box',
    [theme.breakpoints.up('md')]: {
      marginLeft: 'var(--side-nav-width, 240px)',
    },
  },
  menuPanel: {
    width: 260,
    maxWidth: 260,
    minWidth: 260,
    height: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${theme.palette.divider}`,
  },
  header: {
    padding: theme.spacing(2, 2, 1, 2),
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(0.5),
  },
  subtitle: {
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
  menuContainer: {
    flex: 1,
    overflowY: 'auto',
  },
  workspace: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  builderBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    alignItems: 'flex-end',
    padding: theme.spacing(1.5),
    borderRadius: 12,
    border: `1px solid ${cruPalette.soft}`,
    backgroundColor: cruPalette.base,
    boxShadow: '0 4px 14px rgba(56, 58, 68, 0.08)',
  },
  selectorField: {
    minWidth: 220,
    flex: '1 1 220px',
    '& .MuiInputLabel-root': {
      color: cruPalette.muted,
      fontSize: 12,
      fontWeight: 600,
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: cruPalette.primary,
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 10,
      backgroundColor: cruPalette.base,
      '& fieldset': {
        borderColor: cruPalette.soft,
      },
      '&:hover fieldset': {
        borderColor: '#D8DEE3',
      },
      '&.Mui-focused fieldset': {
        borderColor: cruPalette.primary,
        boxShadow: '0 0 0 3px rgba(219, 83, 89, 0.12)',
      },
    },
    '& .MuiSelect-select': {
      fontSize: 13,
      fontWeight: 500,
      color: cruPalette.text,
    },
    '& .MuiSelect-icon': {
      color: cruPalette.muted,
    },
  },
  dateField: {
    minWidth: 180,
    flex: '1 1 180px',
    '& .MuiInputLabel-root': {
      color: cruPalette.muted,
      fontSize: 12,
      fontWeight: 600,
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: cruPalette.primary,
    },
    '& .MuiOutlinedInput-root, & .MuiPickersOutlinedInput-root': {
      borderRadius: 10,
      backgroundColor: cruPalette.base,
      '& fieldset, & .MuiPickersOutlinedInput-notchedOutline': {
        borderColor: cruPalette.soft,
      },
      '&:hover fieldset, &:hover .MuiPickersOutlinedInput-notchedOutline': {
        borderColor: '#D8DEE3',
      },
      '&.Mui-focused fieldset, &.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
        borderColor: `${cruPalette.primary} !important`,
        boxShadow: '0 0 0 3px rgba(219, 83, 89, 0.12)',
      },
    },
    '& .MuiPickersInputBase-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
      borderColor: `${cruPalette.primary} !important`,
    },
    '& .MuiInputBase-input, & .MuiPickersSectionList-sectionContent': {
      fontSize: 13,
      fontWeight: 500,
      color: cruPalette.text,
    },
    '& .MuiPickersInputBase-sectionContent.Mui-selected, & .MuiPickersSectionList-sectionContent.Mui-selected': {
      backgroundColor: `${alpha(cruPalette.primary, 0.2)} !important`,
      color: `${cruPalette.text} !important`,
      borderRadius: 4,
    },
    '& .MuiPickersInputBase-sectionContent::selection, & .MuiPickersSectionList-sectionContent::selection': {
      backgroundColor: alpha(cruPalette.primary, 0.2),
      color: cruPalette.text,
    },
    '& .MuiPickersSectionList-root:focus, & .MuiPickersSectionList-root:focus-visible': {
      outline: 'none',
    },
    '& .MuiPickersSectionList-sectionSeparator': {
      fontSize: 13,
      color: cruPalette.text,
    },
    '& .MuiPickersInputBase-root': {
      borderRadius: 10,
      backgroundColor: cruPalette.base,
    },
    '& .MuiIconButton-root': {
      color: cruPalette.muted,
    },
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginLeft: 'auto',
  },
  secondaryButton: {
    textTransform: 'none',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 10,
    padding: '7px 16px',
    borderColor: cruPalette.soft,
    color: cruPalette.text,
    backgroundColor: cruPalette.base,
    '&:hover': {
      borderColor: '#D8DEE3',
      backgroundColor: '#F8FAFC',
    },
    '&.Mui-disabled': {
      borderColor: cruPalette.soft,
      color: '#9CA3AF',
      backgroundColor: '#F9FAFB',
    },
  },
  primaryButton: {
    textTransform: 'none',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 10,
    padding: '7px 16px',
    backgroundColor: cruPalette.primary,
    color: cruPalette.base,
    boxShadow: 'none',
    '&:hover': {
      backgroundColor: cruPalette.accent,
      boxShadow: 'none',
    },
    '&.Mui-disabled': {
      backgroundColor: '#F3C3C6',
      color: cruPalette.base,
    },
  },
  successMessage: {
    marginTop: theme.spacing(1),
  },
  tablePaper: {
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    overflow: 'hidden',
    marginBottom: 10,
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  tableContainer: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'auto',
    '& .MuiTable-root': {
      minWidth: 940,
    },
    '& .MuiTableHead-root .MuiTableCell-root': {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      backgroundColor: cruPalette.base,
    },
  },
  locationText: {
    fontSize: 12,
    lineHeight: 1.35,
    whiteSpace: 'normal',
  },
  daySeparatorCell: {
    backgroundColor: cruPalette.surfaceSoft,
    borderTop: `1px solid ${cruPalette.soft}`,
    borderBottom: `1px solid ${cruPalette.soft}`,
    padding: '8px 12px !important',
  },
  daySeparatorLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: cruPalette.muted,
    textTransform: 'none',
  },
  valueText: {
    fontSize: 12,
  },
  totalRow: {
    '& .MuiTableCell-root': {
      backgroundColor: alpha(cruPalette.primary, 0.1),
      fontWeight: 700,
      color: cruPalette.text,
    },
  },
  helperRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectMenuPaper: {
    marginTop: 4,
    border: `1px solid ${cruPalette.soft}`,
    borderRadius: 10,
    boxShadow: '0 8px 20px rgba(56, 58, 68, 0.12)',
    backgroundColor: cruPalette.base,
  },
  selectMenuList: {
    padding: '4px',
  },
  selectMenuItem: {
    fontSize: 13,
    fontWeight: 500,
    color: cruPalette.text,
    borderRadius: 8,
    minHeight: 34,
    margin: '2px 0',
    '&:hover': {
      backgroundColor: cruPalette.surfaceSoft,
    },
    '&.Mui-selected': {
      color: cruPalette.primary,
      fontWeight: 700,
      backgroundColor: alpha(cruPalette.primary, 0.12),
    },
    '&.Mui-selected:hover': {
      backgroundColor: alpha(cruPalette.primary, 0.18),
    },
    '&.Mui-focusVisible': {
      backgroundColor: 'transparent',
      outline: 'none',
    },
  },
  selectPlaceholder: {
    color: cruPalette.muted,
    fontWeight: 500,
  },
}));

const formatDurationHms = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const formatDateTime24h = (value) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm:ss') : '');

const getCoordinateKey = (latitude, longitude) => {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return null;
  }
  return `${parsedLatitude.toFixed(ADDRESS_KEY_DECIMALS)},${parsedLongitude.toFixed(ADDRESS_KEY_DECIMALS)}`;
};

const resolveLocation = (address, latitude, longitude, resolvedAddresses) => {
  if (address) {
    return address;
  }
  const coordinateKey = getCoordinateKey(latitude, longitude);
  if (!coordinateKey) {
    return 'Direccion no disponible';
  }
  return resolvedAddresses[coordinateKey] || 'Buscando direccion...';
};

const ViajesReportPage = () => {
  const { classes } = useStyles();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const devicesMap = useSelector((state) => state.devices.items);
  const geocoderEnabled = useSelector((state) => state.session.server.geocoderEnabled);
  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');

  const devices = useMemo(() => Object.values(devicesMap || {}), [devicesMap]);

  const [deviceId, setDeviceId] = useState('');
  const [from, setFrom] = useState(() => dayjs().subtract(1, 'day'));
  const [to, setTo] = useState(() => dayjs());
  const [showBuilder, setShowBuilder] = useState(true);
  const [showCreatedMessage, setShowCreatedMessage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [resolvedAddresses, setResolvedAddresses] = useState({});
  const resolvedAddressesRef = useRef({});
  const inFlightAddressKeysRef = useRef(new Set());
  const geocodeAbortControllersRef = useRef(new Set());

  useEffect(() => {
    resolvedAddressesRef.current = resolvedAddresses;
  }, [resolvedAddresses]);

  const processedItems = useMemo(() => {
    const orderedItems = [...items].sort((a, b) => {
      const aTime = a.startTime ? dayjs(a.startTime).valueOf() : Number.POSITIVE_INFINITY;
      const bTime = b.startTime ? dayjs(b.startTime).valueOf() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });

    return orderedItems.map((item) => ({
      ...item,
      dayLabel: item.startTime ? dayjs(item.startTime).format('DD/MM/YYYY') : 'Sin fecha',
      distanceValue: distanceFromMeters(item.distance || 0, distanceUnit),
      durationValue: Number(item.duration) || 0,
      averageSpeedValue: speedFromKnots(item.averageSpeed || 0, speedUnit),
      maxSpeedValue: speedFromKnots(item.maxSpeed || 0, speedUnit),
    }));
  }, [items, distanceUnit, speedUnit]);

  const groupedItems = useMemo(() => {
    const groups = [];
    const groupsMap = new Map();

    processedItems.forEach((item) => {
      const groupKey = item.dayLabel;
      if (!groupsMap.has(groupKey)) {
        const group = { day: groupKey, trips: [] };
        groupsMap.set(groupKey, group);
        groups.push(group);
      }
      groupsMap.get(groupKey).trips.push(item);
    });

    return groups;
  }, [processedItems]);

  const totals = useMemo(() => {
    const totalDistance = processedItems.reduce((sum, item) => sum + item.distanceValue, 0);
    const totalDuration = processedItems.reduce((sum, item) => sum + item.durationValue, 0);
    const weightedSpeedNumerator = processedItems.reduce(
      (sum, item) => sum + (item.averageSpeedValue * item.durationValue),
      0,
    );
    const totalAverageSpeed = totalDuration > 0
      ? (weightedSpeedNumerator / totalDuration)
      : (processedItems.length ? processedItems.reduce((sum, item) => sum + item.averageSpeedValue, 0) / processedItems.length : 0);
    const totalMaxSpeed = processedItems.reduce((maxValue, item) => Math.max(maxValue, item.maxSpeedValue), 0);

    return {
      totalDistance,
      totalDuration,
      totalAverageSpeed,
      totalMaxSpeed,
    };
  }, [processedItems]);

  useEffect(() => {
    if (!processedItems.length) {
      return;
    }

    let active = true;
    const missingPoints = [];
    const registerPoint = (address, latitude, longitude) => {
      if (address) {
        return;
      }
      const coordinateKey = getCoordinateKey(latitude, longitude);
      if (!coordinateKey) {
        return;
      }
      if (resolvedAddressesRef.current[coordinateKey] || inFlightAddressKeysRef.current.has(coordinateKey)) {
        return;
      }
      missingPoints.push({ coordinateKey, latitude: Number(latitude), longitude: Number(longitude) });
      inFlightAddressKeysRef.current.add(coordinateKey);
    };

    processedItems.forEach((item) => {
      registerPoint(item.startAddress, item.startLat, item.startLon);
      registerPoint(item.endAddress, item.endLat, item.endLon);
    });

    if (!missingPoints.length) {
      return undefined;
    }

    if (!geocoderEnabled) {
      setResolvedAddresses((prev) => {
        const next = { ...prev };
        missingPoints.forEach(({ coordinateKey }) => {
          next[coordinateKey] = next[coordinateKey] || 'Direccion no disponible';
          inFlightAddressKeysRef.current.delete(coordinateKey);
        });
        return next;
      });
      return undefined;
    }

    const fetchSingleAddress = async ({ coordinateKey, latitude, longitude }) => {
      const abortController = new AbortController();
      geocodeAbortControllersRef.current.add(abortController);
      const timeoutId = window.setTimeout(() => {
        abortController.abort();
      }, GEOCODE_REQUEST_TIMEOUT_MS);

      try {
        const query = new URLSearchParams({ latitude, longitude });
        const response = await fetchOrThrow(`/api/server/geocode?${query.toString()}`, {
          signal: abortController.signal,
        });
        const addressText = (await response.text()).trim();
        if (!active) {
          return;
        }
        const nextAddress = addressText || 'Direccion no disponible';
        setResolvedAddresses((prev) => ({
          ...prev,
          [coordinateKey]: nextAddress,
        }));
      } catch (e) {
        if (!active) {
          return;
        }
        const fallbackAddress = 'Direccion no disponible';
        setResolvedAddresses((prev) => ({
          ...prev,
          [coordinateKey]: prev[coordinateKey] || fallbackAddress,
        }));
      } finally {
        window.clearTimeout(timeoutId);
        geocodeAbortControllersRef.current.delete(abortController);
        inFlightAddressKeysRef.current.delete(coordinateKey);
      }
    };

    const fetchAddresses = async () => {
      const queue = [...missingPoints];
      const workers = new Array(Math.min(GEOCODE_CONCURRENCY, queue.length))
        .fill(null)
        .map(async () => {
          while (active && queue.length) {
            const nextPoint = queue.shift();
            if (!nextPoint) {
              return;
            }
            await fetchSingleAddress(nextPoint);
          }
        });
      await Promise.all(workers);
    };

    fetchAddresses();

    return () => {
      active = false;
      geocodeAbortControllersRef.current.forEach((controller) => controller.abort());
      geocodeAbortControllersRef.current.clear();
    };
  }, [geocoderEnabled, processedItems]);

  const handleCancel = () => {
    setError('');
    setShowBuilder(false);
    setShowCreatedMessage(false);
  };

  const handleCreate = async () => {
    if (!deviceId) {
      setError('Selecciona un vehiculo');
      return;
    }

    const fromDate = dayjs(from);
    const toDate = dayjs(to);
    if (!fromDate.isValid() || !toDate.isValid() || fromDate.isAfter(toDate)) {
      setError('El rango de fechas no es valido');
      return;
    }

    const fromBoundary = fromDate.startOf('day');
    const toBoundary = toDate.endOf('day');

    const query = new URLSearchParams({
      from: fromBoundary.toISOString(),
      to: toBoundary.toISOString(),
    });
    query.append('deviceId', deviceId);

    setError('');
    setLoading(true);
    resolvedAddressesRef.current = {};
    setResolvedAddresses({});
    inFlightAddressKeysRef.current.clear();
    geocodeAbortControllersRef.current.forEach((controller) => controller.abort());
    geocodeAbortControllersRef.current.clear();

    try {
      const response = await fetchOrThrow(`/api/reports/trips?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      setItems(data);
      setReportGenerated(true);
      setShowCreatedMessage(true);
      window.setTimeout(() => setShowCreatedMessage(false), 1800);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const datePickerSlotProps = {
    popper: {
      sx: {
        '& .MuiPaper-root': {
          border: `1px solid ${cruPalette.soft}`,
          borderRadius: '10px',
          boxShadow: '0 8px 20px rgba(56, 58, 68, 0.12)',
          backgroundColor: cruPalette.base,
        },
        '& .MuiPickersCalendarHeader-label': {
          color: cruPalette.text,
          fontSize: '13px',
          fontWeight: 700,
          textTransform: 'capitalize',
        },
        '& .MuiPickersArrowSwitcher-button': {
          color: cruPalette.muted,
        },
        '& .MuiPickersCalendarHeader-switchViewButton': {
          color: cruPalette.muted,
        },
        '& .MuiPickersCalendarHeader-switchViewIcon': {
          color: cruPalette.muted,
        },
        '& .MuiDayCalendar-weekDayLabel': {
          color: cruPalette.muted,
          fontSize: '11px',
          fontWeight: 600,
        },
        '& .MuiPickersDay-root': {
          color: cruPalette.text,
          fontSize: '12px',
          fontWeight: 500,
          borderRadius: '8px',
        },
        '& .MuiPickersDay-root:hover': {
          backgroundColor: cruPalette.surfaceSoft,
        },
        '& .MuiPickersDay-root.Mui-selected': {
          backgroundColor: `${cruPalette.primary} !important`,
          color: `${cruPalette.base} !important`,
          fontWeight: 700,
        },
        '& .MuiPickersDay-root.Mui-selected:hover': {
          backgroundColor: `${cruPalette.accent} !important`,
        },
        '& .MuiPickersDay-root.MuiPickersDay-today:not(.Mui-selected)': {
          border: `1px solid ${alpha(cruPalette.primary, 0.4)}`,
        },
        '& .MuiYearCalendar-root': {
          width: '100%',
          maxHeight: 260,
          padding: '8px 10px 12px',
        },
        '& .MuiYearCalendar-button, & .MuiPickersYear-yearButton': {
          color: cruPalette.text,
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '8px',
          minWidth: 72,
        },
        '& .MuiYearCalendar-button:hover, & .MuiPickersYear-yearButton:hover': {
          backgroundColor: cruPalette.surfaceSoft,
        },
        '& .MuiYearCalendar-button.Mui-selected, & .MuiPickersYear-yearButton.Mui-selected': {
          backgroundColor: `${cruPalette.primary} !important`,
          color: `${cruPalette.base} !important`,
          fontWeight: 700,
        },
        '& .MuiYearCalendar-button.Mui-selected:hover, & .MuiPickersYear-yearButton.Mui-selected:hover': {
          backgroundColor: `${cruPalette.accent} !important`,
        },
      },
    },
    textField: {
      size: 'small',
      className: classes.dateField,
    },
  };

  return (
    <div className={classes.root}>
      {desktop && <BottomMenu />}
      <Box className={classes.content}>
        <Paper className={classes.menuPanel} elevation={3}>
          <Box className={classes.header}>
            <Typography className={classes.title}>Reportes</Typography>
            <Typography className={classes.subtitle}>Selecciona un reporte</Typography>
          </Box>
          <Box className={classes.menuContainer}>
            <ReportsMenu />
          </Box>
        </Paper>

        <Box className={classes.workspace}>
          {showBuilder && (
            <Paper className={classes.builderBar} elevation={0}>
              <FormControl size="small" className={classes.selectorField}>
                <InputLabel id="viajes-device-label" shrink>Vehiculo</InputLabel>
                <Select
                  labelId="viajes-device-label"
                  value={deviceId}
                  label="Vehiculo"
                  displayEmpty
                  onChange={(event) => setDeviceId(event.target.value)}
                  renderValue={(selected) => {
                    if (!selected) {
                      return <span className={classes.selectPlaceholder}>Seleccione un vehiculo</span>;
                    }
                    const selectedDevice = devices.find((device) => String(device.id) === String(selected));
                    return selectedDevice?.name || selected;
                  }}
                  MenuProps={{
                    PaperProps: { className: classes.selectMenuPaper },
                    MenuListProps: {
                      className: classes.selectMenuList,
                      autoFocusItem: false,
                    },
                  }}
                >
                  {devices.map((device) => (
                    <MenuItem
                      key={device.id}
                      value={String(device.id)}
                      className={classes.selectMenuItem}
                    >
                      {device.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <MuiDateLocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
                <DatePicker
                  label="Desde"
                  value={from}
                  onChange={(newValue) => {
                    if (newValue) {
                      setFrom(newValue);
                    }
                  }}
                  format="DD/MM/YYYY"
                  slotProps={datePickerSlotProps}
                />

                <DatePicker
                  label="Hasta"
                  value={to}
                  onChange={(newValue) => {
                    if (newValue) {
                      setTo(newValue);
                    }
                  }}
                  format="DD/MM/YYYY"
                  slotProps={datePickerSlotProps}
                />
              </MuiDateLocalizationProvider>

              <Box className={classes.actions}>
                <Button
                  variant="outlined"
                  className={classes.secondaryButton}
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  variant="contained"
                  className={classes.primaryButton}
                  onClick={handleCreate}
                  disabled={loading}
                >
                  {loading ? 'Creando...' : 'Crear'}
                </Button>
              </Box>
            </Paper>
          )}

          {!showBuilder && (
            <Box className={classes.helperRow}>
              <Typography variant="body2" color="text.secondary">
                {reportGenerated ? 'Reporte generado' : 'Creacion cancelada'}
              </Typography>
              <Button variant="text" onClick={() => setShowBuilder(true)}>Nuevo reporte</Button>
            </Box>
          )}

          <Grow in={showCreatedMessage} timeout={350} unmountOnExit>
            <Alert className={classes.successMessage} severity="success">
              Reporte creado
            </Alert>
          </Grow>

          {error && (
            <Alert severity="error">{error}</Alert>
          )}

          {reportGenerated && (
            <Paper className={classes.tablePaper} elevation={0}>
              <TableContainer className={classes.tableContainer}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Inicio</TableCell>
                      <TableCell>Fin</TableCell>
                      <TableCell>Distancia recorrida</TableCell>
                      <TableCell>Duracion del viaje</TableCell>
                      <TableCell>Velocidad media</TableCell>
                      <TableCell>Velocidad maxima</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedItems.map((group) => (
                      <Fragment key={group.day}>
                        <TableRow>
                          <TableCell className={classes.daySeparatorCell} colSpan={6}>
                            <Typography className={classes.daySeparatorLabel}>
                              {`${group.day} (cantidad de viajes: ${group.trips.length})`}
                            </Typography>
                          </TableCell>
                        </TableRow>
                        {group.trips.map((item) => {
                          const startLocation = resolveLocation(item.startAddress, item.startLat, item.startLon, resolvedAddresses);
                          const endLocation = resolveLocation(item.endAddress, item.endLat, item.endLon, resolvedAddresses);
                          const startLabel = `${formatDateTime24h(item.startTime)} - ${startLocation}`;
                          const endLabel = `${formatDateTime24h(item.endTime)} - ${endLocation}`;
                          const distance = `${item.distanceValue.toFixed(2)} km/h`;
                          const duration = formatDurationHms(item.durationValue);
                          const averageSpeed = `${Math.round(item.averageSpeedValue)} km/h`;
                          const maxSpeed = `${Math.round(item.maxSpeedValue)} km/h`;

                          return (
                            <TableRow key={`${item.deviceId}-${item.startPositionId || item.startTime}`}>
                              <TableCell className={classes.locationText}>{startLabel}</TableCell>
                              <TableCell className={classes.locationText}>{endLabel}</TableCell>
                              <TableCell className={classes.valueText}>{distance}</TableCell>
                              <TableCell className={classes.valueText}>{duration}</TableCell>
                              <TableCell className={classes.valueText}>{averageSpeed}</TableCell>
                              <TableCell className={classes.valueText}>{maxSpeed}</TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    ))}
                    {!!processedItems.length && (
                      <TableRow className={classes.totalRow}>
                        <TableCell className={classes.valueText} colSpan={2}>Total</TableCell>
                        <TableCell className={classes.valueText}>{`${totals.totalDistance.toFixed(2)} km/h`}</TableCell>
                        <TableCell className={classes.valueText}>{formatDurationHms(totals.totalDuration)}</TableCell>
                        <TableCell className={classes.valueText}>{`${Math.round(totals.totalAverageSpeed)} km/h`}</TableCell>
                        <TableCell className={classes.valueText}>{`${Math.round(totals.totalMaxSpeed)} km/h`}</TableCell>
                      </TableRow>
                    )}
                    {!processedItems.length && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Typography variant="body2" color="text.secondary">
                            No hay datos para el rango seleccionado
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      </Box>
    </div>
  );
};

export default ViajesReportPage;
