import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import {
  Toolbar, IconButton, Popover, FormControl, InputLabel, Select, MenuItem, FormGroup, FormControlLabel, Checkbox, Badge, Box, Typography, OutlinedInput,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import TuneIcon from '@mui/icons-material/Tune';
import { useTranslation } from '../common/components/LocalizationProvider';
import './MainToolbar.css';

const useStyles = makeStyles()((theme, { collapsed }) => ({
  toolbar: {
    display: 'flex',
    gap: theme.spacing(1),
    justifyContent: collapsed ? 'center' : 'flex-start',
    width: collapsed ? 'auto' : '100%',
    minHeight: collapsed ? 40 : undefined,
    padding: collapsed ? theme.spacing(0.5) : undefined,
  },
  filterPanel: {
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(2),
    gap: theme.spacing(2),
    width: theme.dimensions.drawerWidthTablet,
  },
  devicesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  devicesPanel: {
    width: '100%',
    marginLeft: theme.spacing(0.5),
  },
  devicesTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#383A44',
  },
  searchContainer: {
    padding: theme.spacing(0, 1.5, 1, 1.5),
  },
}));

const MainToolbar = ({
  devicesOpen,
  setDevicesOpen,
  keyword,
  setKeyword,
  filter,
  setFilter,
  filterSort,
  setFilterSort,
  filterMap,
  setFilterMap,
}) => {
  const collapsed = !devicesOpen;
  const { classes } = useStyles({ collapsed });
  const t = useTranslation();
  const selectMenuProps = {
    PaperProps: {
      className: 'main-toolbar-filter-menu-paper',
    },
  };

  const groups = useSelector((state) => state.groups.items);
  const devices = useSelector((state) => state.devices.items);

  const toolbarRef = useRef();
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  useEffect(() => {
    if (collapsed) {
      setFilterAnchorEl(null);
    }
  }, [collapsed]);

  const deviceStatusCount = (status) => Object.values(devices).filter((d) => d.status === status).length;

  return (
    <>
      <Toolbar ref={toolbarRef} className={classes.toolbar}>
        <IconButton
          edge={collapsed ? false : 'start'}
          onClick={() => setDevicesOpen(!devicesOpen)}
          disableRipple={collapsed}
          sx={collapsed ? {
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)',
            '&:hover': { backgroundColor: '#fff' },
          } : undefined}
        >
          <MenuOpenIcon
            sx={{
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </IconButton>
        {!collapsed && (
          <Box className={classes.devicesPanel}>
            <Box className={classes.devicesHeader}>
              <Typography className={classes.devicesTitle}>Dispositivos</Typography>
              <IconButton size="small" edge="end" onClick={(e) => setFilterAnchorEl(e.currentTarget)}>
                <Badge color="info" variant="dot" invisible={!filter.statuses.length && !filter.groups.length}>
                  <TuneIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Box>
          </Box>
        )}
      </Toolbar>
      {!collapsed && (
        <Box className={classes.searchContainer}>
          <OutlinedInput
            className="main-toolbar-search-input"
            placeholder={t('sharedSearchDevices')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            size="small"
            fullWidth
          />
        </Box>
      )}
      {!collapsed && (
        <Popover
          open={!!filterAnchorEl}
          anchorEl={filterAnchorEl}
          onClose={() => setFilterAnchorEl(null)}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          PaperProps={{
            className: 'main-toolbar-filter-popover',
          }}
        >
          <Box className={`${classes.filterPanel} main-toolbar-filter-panel`}>
            <FormControl size="small">
              <InputLabel className="main-toolbar-filter-label">{t('deviceStatus')}</InputLabel>
              <Select
                className="main-toolbar-filter-select"
                label={t('deviceStatus')}
                value={filter.statuses}
                onChange={(e) => setFilter({ ...filter, statuses: e.target.value })}
                multiple
                MenuProps={selectMenuProps}
              >
                <MenuItem value="online">{`${t('deviceStatusOnline')} (${deviceStatusCount('online')})`}</MenuItem>
                <MenuItem value="offline">{`${t('deviceStatusOffline')} (${deviceStatusCount('offline')})`}</MenuItem>
                <MenuItem value="unknown">{`${t('deviceStatusUnknown')} (${deviceStatusCount('unknown')})`}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel className="main-toolbar-filter-label">{t('settingsGroups')}</InputLabel>
              <Select
                className="main-toolbar-filter-select"
                label={t('settingsGroups')}
                value={filter.groups}
                onChange={(e) => setFilter({ ...filter, groups: e.target.value })}
                multiple
                MenuProps={selectMenuProps}
              >
                {Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)).map((group) => (
                  <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel className="main-toolbar-filter-label">{t('sharedSortBy')}</InputLabel>
              <Select
                className="main-toolbar-filter-select"
                label={t('sharedSortBy')}
                value={filterSort}
                onChange={(e) => setFilterSort(e.target.value)}
                displayEmpty
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">{'\u00a0'}</MenuItem>
                <MenuItem value="name">{t('sharedName')}</MenuItem>
                <MenuItem value="lastUpdate">{t('deviceLastUpdate')}</MenuItem>
              </Select>
            </FormControl>
            <FormGroup>
              <FormControlLabel
                className="main-toolbar-filter-checkbox-label"
                control={(
                  <Checkbox
                    className="main-toolbar-filter-checkbox"
                    checked={filterMap}
                    onChange={(e) => setFilterMap(e.target.checked)}
                  />
                )}
                label={t('sharedFilterMap')}
              />
            </FormGroup>
          </Box>
        </Popover>
      )}
    </>
  );
};

export default MainToolbar;
