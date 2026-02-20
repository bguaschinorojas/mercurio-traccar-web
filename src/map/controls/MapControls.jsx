import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Typography,
  Paper,
  TextField,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
} from '@mui/material';
import maplibregl from 'maplibre-gl';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PentagonIcon from '@mui/icons-material/Pentagon';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import NavigationIcon from '@mui/icons-material/Navigation';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import { map } from '../core/mapInstance';

const MapControls = ({
  styles,
  selectedStyleId,
  onSelectStyle,
  mapReady,
  onToggleGeofenceEditor,
  geofenceItems = [],
  onGeofenceSelect,
  onGeofenceUpdate,
  onGeofenceDelete,
  geofenceEditorActive = false,
  geofenceEditorLabel = 'Geozonas',
  onCreateGeofence,
  onStartGeofenceEdit,
  onStopGeofenceEdit,
}) => {
  const cruPalette = {
    primary: '#DB5359',
    accent: '#EA9A9E',
    text: '#383A44',
    base: '#FFFFFF',
    soft: '#EBEFF1',
  };

  const sharedMenuPaperSx = {
    mt: '10px',
    width: '370px',
    maxHeight: 'calc(100% - 120px)',
    bgcolor: cruPalette.base,
    color: cruPalette.text,
    border: `1px solid ${cruPalette.soft}`,
  };

  const sharedInputSx = {
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: cruPalette.soft,
      },
      '&:hover fieldset': {
        borderColor: cruPalette.soft,
      },
      '&.Mui-focused fieldset': {
        borderColor: cruPalette.soft,
      },
    },
    '& .MuiInputBase-input': {
      fontSize: '13px',
      color: cruPalette.text,
    },
    '& .MuiInputLabel-root': {
      color: cruPalette.text,
      fontSize: '13px',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: cruPalette.text,
    },
  };

  const primaryButtonSx = {
    textTransform: 'none',
    fontSize: '13px',
    fontWeight: 600,
    backgroundColor: cruPalette.primary,
    color: cruPalette.base,
    '&:hover': {
      backgroundColor: cruPalette.accent,
    },
  };

  const secondaryButtonSx = {
    textTransform: 'none',
    fontSize: '13px',
    color: cruPalette.text,
    borderColor: cruPalette.soft,
    '&:hover': {
      borderColor: cruPalette.soft,
      backgroundColor: cruPalette.soft,
    },
  };

  const [bearing, setBearing] = useState(0);
  const [searchAnchorEl, setSearchAnchorEl] = useState(null);
  const [layersAnchorEl, setLayersAnchorEl] = useState(null);
  const [geofenceAnchorEl, setGeofenceAnchorEl] = useState(null);
  const [geofenceSearchQuery, setGeofenceSearchQuery] = useState('');
  const [editingGeofenceId, setEditingGeofenceId] = useState(null);
  const [editingGeofenceName, setEditingGeofenceName] = useState('');
  const [editingGeofenceColor, setEditingGeofenceColor] = useState('#3B82F6');
  const [geofenceSaving, setGeofenceSaving] = useState(false);
  const [deleteGeofenceTarget, setDeleteGeofenceTarget] = useState(null);
  const [geofenceDeleting, setGeofenceDeleting] = useState(false);
  const [geofenceCreateAnchorEl, setGeofenceCreateAnchorEl] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const searchAbortRef = useRef(null);

  useEffect(() => {
    const handleRotate = () => setBearing(map.getBearing());
    map.on('rotate', handleRotate);
    return () => map.off('rotate', handleRotate);
  }, []);

  const handleZoomIn = () => map.zoomIn();
  const handleZoomOut = () => map.zoomOut();
  const handleResetNorth = () => map.easeTo({ bearing: 0 });

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { longitude, latitude } = pos.coords;
      map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15) });
    });
  };

  const handleSearchOpen = (event) => {
    setSearchAnchorEl(event.currentTarget);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleSearchClose = () => {
    setSearchAnchorEl(null);
  };

  const handleLayersOpen = (event) => {
    setLayersAnchorEl(event.currentTarget);
  };

  const handleLayersClose = () => {
    setLayersAnchorEl(null);
  };

  const handleGeofenceOpen = (event) => {
    if (onGeofenceSelect) {
      setGeofenceAnchorEl(event.currentTarget);
    } else if (onToggleGeofenceEditor) {
      onToggleGeofenceEditor();
    }
  };

  const handleGeofenceClose = () => {
    setGeofenceAnchorEl(null);
    setEditingGeofenceId(null);
    setEditingGeofenceName('');
    setEditingGeofenceColor('#3B82F6');
    setGeofenceSaving(false);
    setDeleteGeofenceTarget(null);
    setGeofenceDeleting(false);
    setGeofenceCreateAnchorEl(null);
    onStopGeofenceEdit?.();
  };

  const handleGeofenceMenuClose = (event, reason) => {
    // Mientras se edita, cerrar solo por ESC (o botón X explícito).
    if (editingGeofenceId && reason !== 'escapeKeyDown') {
      return;
    }
    handleGeofenceClose();
  };

  const handleGeofenceCreateToggle = (event) => {
    event.stopPropagation();
    setGeofenceCreateAnchorEl((current) => (current ? null : event.currentTarget));
  };

  const handleGeofenceCreateClose = () => {
    setGeofenceCreateAnchorEl(null);
  };

  const handleGeofenceCreateMode = async (event, mode) => {
    event.stopPropagation();
    await onCreateGeofence?.(mode);
    setGeofenceCreateAnchorEl(null);
  };

  const handleGeofenceEditOpen = (event, geofence) => {
    event.stopPropagation();
    setEditingGeofenceId(geofence.id);
    setEditingGeofenceName(geofence.name || '');
    setEditingGeofenceColor(geofence.attributes?.color || '#3B82F6');
    onStartGeofenceEdit?.(geofence.id);
  };

  const handleGeofenceEditCancel = () => {
    setEditingGeofenceId(null);
    setEditingGeofenceName('');
    setEditingGeofenceColor('#3B82F6');
    onStopGeofenceEdit?.();
  };

  const handleGeofenceEditSave = async () => {
    if (!editingGeofenceId || !onGeofenceUpdate) {
      return;
    }
    const currentGeofence = geofenceItems.find((item) => item.id === editingGeofenceId);
    if (!currentGeofence) {
      return;
    }
    const nextName = editingGeofenceName.trim();
    if (!nextName) {
      return;
    }
    const nextColor = editingGeofenceColor || '#3B82F6';
    setGeofenceSaving(true);
    const result = await onGeofenceUpdate(editingGeofenceId, {
      name: nextName,
      attributes: {
        ...(currentGeofence.attributes || {}),
        color: nextColor,
      },
    });
    setGeofenceSaving(false);
    if (result) {
      handleGeofenceEditCancel();
    }
  };

  const handleGeofenceVisibilityToggle = async (event, geofence) => {
    event.stopPropagation();
    if (!onGeofenceUpdate) {
      return;
    }
    const isHidden = geofence.attributes?.hide || false;
    await onGeofenceUpdate(geofence.id, {
      attributes: {
        ...(geofence.attributes || {}),
        hide: !isHidden,
      },
    });
  };

  const handleGeofenceDeleteOpen = (event, geofence) => {
    event.stopPropagation();
    setDeleteGeofenceTarget(geofence);
  };

  const handleGeofenceDeleteCancel = () => {
    if (!geofenceDeleting) {
      setDeleteGeofenceTarget(null);
    }
  };

  const handleGeofenceDeleteConfirm = async () => {
    if (!deleteGeofenceTarget || !onGeofenceDelete) {
      return;
    }
    setGeofenceDeleting(true);
    const removed = await onGeofenceDelete(deleteGeofenceTarget.id);
    setGeofenceDeleting(false);
    if (removed) {
      setDeleteGeofenceTarget(null);
    }
  };

  useEffect(() => () => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!searchAnchorEl) return undefined;
    const timerId = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timerId);
  }, [searchAnchorEl]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchAnchorEl || query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    const timerId = setTimeout(() => {
      handleSearch(query);
    }, 350);
    return () => clearTimeout(timerId);
  }, [searchAnchorEl, searchQuery]);

  const handleSearch = async (query) => {
    if (!query.trim()) return;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    try {
      const request = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&addressdetails=1`;
      const response = await fetch(request, { signal: controller.signal });
      const geojson = await response.json();
      const results = (geojson.features || []).slice(0, 10).map((feature) => {
        const center = feature.geometry?.type === 'Point'
          ? feature.geometry.coordinates
          : [
              feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
              feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2,
            ];
        return {
          id: feature.properties.place_id,
          label: feature.properties.display_name,
          center,
        };
      });
      setSearchResults(results);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setSearchResults([]);
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearchLoading(false);
      }
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    handleSearch(searchQuery);
  };

  const handleResultClick = (result) => {
    map.easeTo({ center: result.center, zoom: Math.max(map.getZoom(), 15) });
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }
    searchMarkerRef.current = new maplibregl.Marker({ color: '#FF7A00' })
      .setLngLat(result.center)
      .addTo(map);
    handleSearchClose();
  };

  const filteredGeofenceItems = geofenceSearchQuery.trim()
    ? geofenceItems.filter((geofence) => geofence.name.toLowerCase().includes(geofenceSearchQuery.trim().toLowerCase()))
    : geofenceItems;

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 2,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid #E5E7EB',
          }}
        >
          <Tooltip title="Buscar">
            <span style={{ display: 'inline-flex' }}>
              <IconButton
                disabled={!mapReady}
                onClick={handleSearchOpen}
                size="small"
                disableRipple
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'transparent' },
                  '& svg': { fontSize: 18 },
                }}
              >
                <SearchIcon />
              </IconButton>
            </span>
          </Tooltip>
          {(onToggleGeofenceEditor || onGeofenceSelect) && (
            <Tooltip title={geofenceEditorLabel}>
              <span style={{ display: 'inline-flex' }}>
                <IconButton
                  disabled={!mapReady}
                  onClick={handleGeofenceOpen}
                  size="small"
                  disableRipple
                  sx={{
                    width: 40,
                    height: 40,
                    borderLeft: '1px solid #E5E7EB',
                    borderRadius: 0,
                    backgroundColor: geofenceEditorActive || Boolean(geofenceAnchorEl) ? '#F3F4F6' : 'transparent',
                    '&:hover': { backgroundColor: geofenceEditorActive || Boolean(geofenceAnchorEl) ? '#F3F4F6' : 'transparent' },
                    '& svg': { fontSize: 18 },
                  }}
                >
                  <PentagonIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Capas">
            <span style={{ display: 'inline-flex' }}>
              <IconButton
                disabled={!mapReady}
                onClick={handleLayersOpen}
                size="small"
                disableRipple
                sx={{
                  width: 40,
                  height: 40,
                  borderLeft: '1px solid #E5E7EB',
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'transparent' },
                  '& svg': { fontSize: 18 },
                }}
              >
                <LayersIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="UbicaciÃ³n">
            <span style={{ display: 'inline-flex' }}>
              <IconButton
                disabled={!mapReady}
                onClick={handleLocate}
                size="small"
                disableRipple
                sx={{
                  width: 40,
                  height: 40,
                  borderLeft: '1px solid #E5E7EB',
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'transparent' },
                  '& svg': { fontSize: 18 },
                }}
              >
                <MyLocationIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Paper>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          right: 12,
          bottom: 42,
          zIndex: 2,
          pointerEvents: 'auto',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid #E5E7EB',
          }}
        >
          <IconButton
            disabled={!mapReady}
            onClick={handleZoomIn}
            size="small"
            disableRipple
            sx={{
              width: 44,
              height: 44,
              borderRadius: 0,
              backgroundColor: 'transparent',
              '&:hover': { backgroundColor: 'transparent' },
              '& svg': { fontSize: 20 },
            }}
          >
            <AddIcon />
          </IconButton>
          <IconButton
            disabled={!mapReady}
            onClick={handleZoomOut}
            size="small"
            disableRipple
            sx={{
              width: 44,
              height: 44,
              borderTop: '1px solid #E5E7EB',
              borderRadius: 0,
              backgroundColor: 'transparent',
              '&:hover': { backgroundColor: 'transparent' },
              '& svg': { fontSize: 20 },
            }}
          >
            <RemoveIcon />
          </IconButton>
          <IconButton
            disabled={!mapReady}
            onClick={handleResetNorth}
            size="small"
            disableRipple
            sx={{
              width: 44,
              height: 44,
              borderTop: '1px solid #E5E7EB',
              borderRadius: 0,
              backgroundColor: 'transparent',
              '&:hover': { backgroundColor: 'transparent' },
              '& svg': { fontSize: 20 },
            }}
          >
            <NavigationIcon sx={{ transform: `rotate(${bearing}deg)` }} />
          </IconButton>
        </Paper>
      </Box>

      <Menu
        open={Boolean(searchAnchorEl)}
        anchorEl={searchAnchorEl}
        onClose={handleSearchClose}
        autoFocus={false}
        disableAutoFocusItem
        MenuListProps={{
          autoFocus: false,
          autoFocusItem: false,
          onKeyDown: (event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              searchInputRef.current?.focus();
            }
          },
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: sharedMenuPaperSx,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
          }}
        >
          <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>Búsqueda</Typography>
          <Box sx={{ marginLeft: 'auto' }}>
            <IconButton size="small" onClick={handleSearchClose} aria-label="Cerrar búsqueda">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        <Divider />
        <Box sx={{ px: 1.5, py: 1 }}>
          <form onSubmit={handleSearchSubmit}>
            <TextField
              fullWidth
              inputRef={searchInputRef}
              placeholder="Búsqueda rápida"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              sx={sharedInputSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <SearchIcon sx={{ color: cruPalette.accent, fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />
          </form>
        </Box>
        <Divider />
        <Box sx={{ maxHeight: 'calc(100% - 120px)', overflow: 'auto', py: 0.5 }}>
          {searchResults.map((result) => (
            <MenuItem
              key={result.id}
              sx={{ fontSize: '13px', minHeight: 46, borderBottom: '1px solid #E0E0E0' }}
              onClick={() => handleResultClick(result)}
            >
              <PlaceOutlinedIcon sx={{ color: '#8A8A8A', fontSize: 20, mr: 1.5 }} />
              <Typography sx={{ fontSize: '13px' }} noWrap>{result.label}</Typography>
            </MenuItem>
          ))}
          {!searchLoading && !searchQuery.trim() && (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '13px', color: '#424242' }}>
                Empiece a escribir una dirección o el nombre de un lugar
              </Typography>
            </Box>
          )}
          {searchLoading && (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '13px', color: '#616161' }}>Buscando...</Typography>
            </Box>
          )}
          {!searchLoading && searchResults.length === 0 && searchQuery && (
            <MenuItem disabled sx={{ fontSize: '13px' }}>
              Sin resultados
            </MenuItem>
          )}
        </Box>
      </Menu>

      <Menu
        open={Boolean(layersAnchorEl)}
        anchorEl={layersAnchorEl}
        onClose={handleLayersClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: sharedMenuPaperSx,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
          }}
        >
          <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>Mapas</Typography>
          <Box sx={{ marginLeft: 'auto' }}>
            <IconButton size="small" onClick={handleLayersClose} aria-label="Cerrar">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        <Divider />
        {styles.map((style) => (
          <MenuItem
            key={style.id}
            selected={style.id === selectedStyleId}
            sx={{ fontSize: '13px' }}
            onClick={() => {
              onSelectStyle(style);
              handleLayersClose();
            }}
          >
            {style.title}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        open={Boolean(geofenceAnchorEl)}
        anchorEl={geofenceAnchorEl}
        onClose={handleGeofenceMenuClose}
        hideBackdrop={Boolean(editingGeofenceId)}
        disableAutoFocus={Boolean(editingGeofenceId)}
        disableEnforceFocus={Boolean(editingGeofenceId)}
        disableRestoreFocus={Boolean(editingGeofenceId)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          root: {
            sx: editingGeofenceId ? { pointerEvents: 'none' } : undefined,
          },
          paper: {
            sx: {
              ...sharedMenuPaperSx,
              pointerEvents: 'auto',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
          }}
        >
          <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>Geozonas</Typography>
          <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleGeofenceCreateToggle}
              aria-label="Nueva geozona"
              disabled={!onCreateGeofence}
            >
              <AddIcon fontSize="small" sx={{ color: cruPalette.primary }} />
            </IconButton>
            <IconButton size="small" onClick={handleGeofenceClose} aria-label="Cerrar">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        <Divider />
        {!editingGeofenceId && [
          (
            <Box key="geofence-search-box" sx={{ px: 1.5, py: 1 }}>
              <TextField
                fullWidth
                placeholder="Buscar geozonas"
                size="small"
                value={geofenceSearchQuery}
                onChange={(event) => setGeofenceSearchQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                sx={sharedInputSx}
              />
            </Box>
          ),
          <Divider key="geofence-search-divider" />,
        ]}
        {editingGeofenceId ? (
          <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <TextField
              fullWidth
              label="Nombre"
              size="small"
              value={editingGeofenceName}
              onChange={(event) => setEditingGeofenceName(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              sx={{
                mt: '15px',
                ...sharedInputSx,
              }}
            />
            <TextField
              fullWidth
              label="Color"
              size="small"
              type="color"
              value={editingGeofenceColor}
              onChange={(event) => setEditingGeofenceColor(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              sx={{
                mt: '10px',
                ...sharedInputSx,
                '& .MuiInputBase-input': {
                  height: 30,
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleGeofenceEditCancel}
                disabled={geofenceSaving}
                sx={secondaryButtonSx}
              >
                Cancelar
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleGeofenceEditSave}
                disabled={!editingGeofenceName.trim() || geofenceSaving}
                sx={primaryButtonSx}
              >
                Aceptar
              </Button>
            </Box>
          </Box>
        ) : filteredGeofenceItems.length ? filteredGeofenceItems.map((geofence) => (
          <MenuItem
            key={geofence.id}
            sx={{
              fontSize: '13px',
              py: 0.5,
              '&.Mui-selected': { backgroundColor: 'transparent' },
              '&.Mui-selected:hover': { backgroundColor: cruPalette.soft },
            }}
            onClick={() => {
              onGeofenceSelect?.(geofence.id);
            }}
          >
            <Box
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: '13px' }} noWrap>{geofence.name}</Typography>
              <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <IconButton
                  size="small"
                  aria-label={geofence.attributes?.hide ? 'Mostrar geozona' : 'Ocultar geozona'}
                  onClick={(event) => handleGeofenceVisibilityToggle(event, geofence)}
                >
                  {geofence.attributes?.hide ? (
                    <VisibilityOffOutlinedIcon sx={{ fontSize: 16, color: cruPalette.text }} />
                  ) : (
                    <VisibilityOutlinedIcon sx={{ fontSize: 16, color: cruPalette.text }} />
                  )}
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Editar geozona"
                  onClick={(event) => handleGeofenceEditOpen(event, geofence)}
                >
                  <EditIcon sx={{ fontSize: 16, color: cruPalette.text }} />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Eliminar geozona"
                  onClick={(event) => handleGeofenceDeleteOpen(event, geofence)}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16, color: cruPalette.text }} />
                </IconButton>
              </Box>
            </Box>
          </MenuItem>
        )) : (
          <MenuItem disabled sx={{ fontSize: '13px' }}>
            {geofenceSearchQuery.trim() ? 'Sin resultados' : 'Sin geozonas'}
          </MenuItem>
        )}
      </Menu>
      <Popover
        open={Boolean(geofenceCreateAnchorEl)}
        anchorEl={geofenceCreateAnchorEl}
        onClose={handleGeofenceCreateClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              p: 0.5,
              border: `1px solid ${cruPalette.soft}`,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            },
          },
        }}
      >
        <Tooltip title="Crear círculo">
          <IconButton
            size="small"
            onClick={(event) => handleGeofenceCreateMode(event, 'circle')}
            aria-label="Crear geozona circular"
          >
            <CircleOutlinedIcon sx={{ fontSize: 18, color: cruPalette.primary }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Crear polígono">
          <IconButton
            size="small"
            onClick={(event) => handleGeofenceCreateMode(event, 'polygon')}
            aria-label="Crear geozona de polígono"
          >
            <PentagonIcon sx={{ fontSize: 18, color: cruPalette.primary }} />
          </IconButton>
        </Tooltip>
      </Popover>
      <Dialog
        open={Boolean(deleteGeofenceTarget)}
        onClose={handleGeofenceDeleteCancel}
        PaperProps={{
          sx: {
            borderRadius: '14px',
            border: `1px solid ${cruPalette.soft}`,
            backgroundColor: cruPalette.base,
          },
        }}
      >
        <DialogTitle sx={{ fontSize: '16px', fontWeight: 600, color: cruPalette.text }}>
          Confirmar eliminación
        </DialogTitle>
        <DialogContent sx={{ color: cruPalette.text, fontSize: '13px' }}>
          {`esta seguro de eliminar la geozona (${deleteGeofenceTarget?.name || ''})`}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleGeofenceDeleteCancel}
            disabled={geofenceDeleting}
            sx={secondaryButtonSx}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleGeofenceDeleteConfirm}
            disabled={geofenceDeleting}
            sx={primaryButtonSx}
          >
            Aceptar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MapControls;
