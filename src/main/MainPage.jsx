import {
  useState, useCallback, useEffect,
} from 'react';
import { Paper } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import DeviceList from './DeviceList';
import BottomMenu from '../common/components/BottomMenu';
import StatusCard from '../common/components/StatusCard';
import { devicesActions } from '../store';
import usePersistedState from '../common/util/usePersistedState';
import EventsDrawer from './EventsDrawer';
import useFilter from './useFilter';
import MainToolbar from './MainToolbar';
import MainMap from './MainMap';
import { useAttributePreference } from '../common/util/preferences';
import useFeatures from '../common/util/useFeatures';

const SIDEBAR_EXPANDED_WIDTH = 300;
const SIDEBAR_COLLAPSED_WIDTH = 52;

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    [theme.breakpoints.up('md')]: {
      left: 'var(--side-nav-width, 240px)',
    },
    [theme.breakpoints.down('md')]: {
      left: 'var(--side-nav-width, 240px)',
    },
  },
  sidebar: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {
      position: 'fixed',
      zIndex: 3,
      top: theme.spacing(3),
      left: `calc(var(--side-nav-width, 240px) + ${theme.spacing(3)})`,
      width: `${SIDEBAR_EXPANDED_WIDTH}px`, // Ancho de 300px
      bottom: theme.spacing(3),
      height: `calc(100vh - ${theme.spacing(6)})`, // Altura con márgenes
      transition: theme.transitions.create('width', {
        duration: theme.transitions.duration.shorter,
      }),
    },
    [theme.breakpoints.down('md')]: {
      height: '100%',
      width: '100%',
      marginLeft: 'var(--side-nav-width, 240px)',
    },
  },
  header: {
    pointerEvents: 'auto',
    zIndex: 6,
  },
  headerCollapsed: {
    width: 'auto',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
  footer: {
    pointerEvents: 'auto',
    zIndex: 5,
  },
  middle: {
    flex: 1,
    display: 'grid',
  },
  contentMap: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
  },
  contentList: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
    zIndex: 4,
  },
}));

const MainPage = () => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const theme = useTheme();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const mapOnSelect = useAttributePreference('mapOnSelect', true);
  const features = useFeatures();

  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const positions = useSelector((state) => state.session.positions);
  const eventsAvailable = useSelector((state) => !!state.events.items.length);
  const [filteredPositions, setFilteredPositions] = useState([]);
  const selectedPosition = filteredPositions.find((position) => selectedDeviceId && position.deviceId === selectedDeviceId);

  const [filteredDevices, setFilteredDevices] = useState([]);

  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = usePersistedState('filter', {
    statuses: [],
    groups: [],
  });
  const [filterSort, setFilterSort] = usePersistedState('filterSort', '');
  const [filterMap, setFilterMap] = usePersistedState('filterMap', false);

  const [devicesOpen, setDevicesOpen] = useState(desktop);
  const [eventsOpen, setEventsOpen] = useState(false);

  const onEventsClick = useCallback(() => setEventsOpen(true), [setEventsOpen]);

  useEffect(() => {
    if (!desktop && mapOnSelect && selectedDeviceId) {
      setDevicesOpen(false);
    }
  }, [desktop, mapOnSelect, selectedDeviceId]);

  useFilter(keyword, filter, filterSort, filterMap, positions, setFilteredDevices, setFilteredPositions);

  return (
    <div className={classes.root}>
      <BottomMenu
        eventsAvailable={eventsAvailable}
        onEventsClick={onEventsClick}
        showEvents={!features.disableEvents}
      />
      {desktop && (
        <div className={classes.mapContainer}>
          <MainMap
            filteredPositions={filteredPositions}
            selectedPosition={selectedPosition}
          />
        </div>
      )}
      <div
        className={classes.sidebar}
        style={desktop ? { width: `${devicesOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH}px` } : undefined}
      >
        <Paper
          square
          elevation={devicesOpen ? 3 : 0}
          className={`${classes.header} ${devicesOpen ? '' : classes.headerCollapsed}`}
        >
          <MainToolbar
            filteredDevices={filteredDevices}
            devicesOpen={devicesOpen}
            setDevicesOpen={setDevicesOpen}
            keyword={keyword}
            setKeyword={setKeyword}
            filter={filter}
            setFilter={setFilter}
            filterSort={filterSort}
            setFilterSort={setFilterSort}
            filterMap={filterMap}
            setFilterMap={setFilterMap}
          />
        </Paper>
        <div className={classes.middle}>
          {!desktop && (
            <div className={classes.contentMap}>
              <MainMap
                filteredPositions={filteredPositions}
                selectedPosition={selectedPosition}
              />
            </div>
          )}
          <Paper square className={classes.contentList} style={devicesOpen ? {} : { visibility: 'hidden' }}>
            <DeviceList devices={filteredDevices} />
          </Paper>
        </div>
      </div>
      <EventsDrawer open={eventsOpen} onClose={() => setEventsOpen(false)} />
      {selectedDeviceId && (
        <StatusCard
          deviceId={selectedDeviceId}
          position={selectedPosition}
          onClose={() => dispatch(devicesActions.selectId(null))}
          desktopPadding={theme.dimensions.drawerWidthDesktop}
          anchorToSidebar={desktop}
          sidebarWidth={devicesOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH}
          sidebarGap={devicesOpen ? 10 : 24}
        />
      )}
    </div>
  );
};

export default MainPage;
