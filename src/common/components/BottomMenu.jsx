import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Paper, Menu, MenuItem, Typography, Badge, Box, Avatar, ButtonBase, IconButton, Tooltip,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';

import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import MapIcon from '@mui/icons-material/Map';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { sessionActions } from '../../store';
import { useTranslation } from './LocalizationProvider';
import { useDeviceReadonly, useRestriction } from '../util/permissions';
import { nativePostMessage } from './NativeInterface';

const useStyles = makeStyles()((theme, { collapsed }) => ({
  sideNavigation: {
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    width: 'var(--side-nav-width, 240px)',
    height: '100vh',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[3],
    padding: 0, // Sin padding general, lo manejaremos individualmente
    transition: 'width 0.2s ease',
  },
  logoSection: {
    padding: collapsed ? '10px' : '12px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: collapsed ? 0 : theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '& img': {
      maxWidth: collapsed ? '90px' : '120px',
      maxHeight: collapsed ? '28px' : '34px',
      width: 'auto',
      height: 'auto',
    },
  },
  userSection: {
    padding: collapsed ? '10px' : '12px 14px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? theme.spacing(1) : theme.spacing(2),
    justifyContent: collapsed ? 'center' : 'flex-start',
    cursor: 'pointer',
  },
  userInfo: {
    flex: 1,
    display: collapsed ? 'none' : 'block',
    '&:hover': {
      '& .user-name': {
        color: '#2563EB',
      },
    },
  },
  userName: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.palette.text.primary,
    lineHeight: '24px',
    transition: 'color 0.2s ease',
  },
  userId: {
    fontSize: collapsed ? '10px' : '11px',
    color: theme.palette.text.secondary,
    lineHeight: '18px',
  },
  navigationContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: collapsed ? '0' : '12px',
    padding: collapsed ? '8px 0' : '8px 16px',
    margin: collapsed ? '2px 8px' : '2px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: 'transparent',
    color: '#6B7280',
    textAlign: 'left',
    width: collapsed ? 'calc(100% - 16px)' : 'calc(100% - 28px)',
    minHeight: '40px',
    '&:hover': {
      backgroundColor: '#F9FAFB',
    },
    '&.active': {
      backgroundColor: '#EFF6FF',
      color: '#2563EB',
      '& .menu-icon': {
        color: '#2563EB',
      },
    },
  },
  menuIcon: {
    fontSize: '18px',
    color: 'inherit',
  },
  menuLabel: {
    display: collapsed ? 'none' : 'block',
    fontSize: '13px',
    fontWeight: 400,
    margin: 0,
    color: 'inherit',
    textAlign: 'left',
    flex: 1,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingBottom: theme.spacing(1),
  },
  collapseButton: {
    marginLeft: 0,
  },
}));

const BottomMenu = ({ eventsAvailable, onEventsClick, showEvents }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { classes } = useStyles({ collapsed });
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const t = useTranslation();

  const readonly = useRestriction('readonly');
  const disableReports = useRestriction('disableReports');
  const deviceReadonly = useDeviceReadonly();
  const user = useSelector((state) => state.session.user);
  const socket = useSelector((state) => state.session.socket);

  const [anchorEl, setAnchorEl] = useState(null);
  const collapsedWidth = '72px';
  const expandedWidth = '240px';

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--side-nav-width', collapsed ? collapsedWidth : expandedWidth);
  }, [collapsed]);

  const currentSelection = () => {
    if (location.pathname === `/settings/user/${user.id}`) {
      return 'account';
    } if (location.pathname.startsWith('/settings')) {
      return 'settings';
    } if (location.pathname.startsWith('/reports')) {
      return 'reports';
    } if (location.pathname === '/') {
      return 'map';
    }
    return null;
  };

  const handleAccount = () => {
    setAnchorEl(null);
    navigate(`/settings/user/${user.id}`);
  };

  const handleLogout = async () => {
    setAnchorEl(null);

    const notificationToken = window.localStorage.getItem('notificationToken');
    if (notificationToken && !user.readonly) {
      window.localStorage.removeItem('notificationToken');
      const tokens = user.attributes.notificationTokens?.split(',') || [];
      if (tokens.includes(notificationToken)) {
        const updatedUser = {
          ...user,
          attributes: {
            ...user.attributes,
            notificationTokens: tokens.length > 1 ? tokens.filter((it) => it !== notificationToken).join(',') : undefined,
          },
        };
        await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedUser),
        });
      }
    }

    await fetch('/api/session', { method: 'DELETE' });
    nativePostMessage('logout');
    navigate('/login');
    dispatch(sessionActions.updateUser(null));
  };

  const handleSelection = (event, value) => {
    switch (value) {
      case 'map':
        navigate('/');
        break;
      case 'reports':
        navigate('/reports');
        break;
      case 'settings':
        navigate('/settings/preferences');
        break;
      case 'device-add':
        if (!deviceReadonly) {
          navigate('/settings/device');
        }
        break;
      case 'account':
        if (event) {
          setAnchorEl(event.currentTarget);
        }
        break;
      case 'logout':
        handleLogout();
        break;
      default:
        break;
    }
  };

  const wrapWithTooltip = (node, title) => (
    collapsed ? (
      <Tooltip title={title} placement="right">
        <span>{node}</span>
      </Tooltip>
    ) : node
  );

  return (
    <Paper className={classes.sideNavigation} elevation={3}>
      {/* Logo Section */}
      <Box className={classes.logoSection}>
        <IconButton className={classes.collapseButton} onClick={toggleCollapsed} size="small">
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
        {!collapsed && <img src="/cruzero.png" alt="Cruzero" />}
      </Box>
      
      {/* User Section */}
      <Box className={classes.userSection} onClick={handleAccount}>
        <Avatar sx={{ width: collapsed ? 28 : 32, height: collapsed ? 28 : 32 }}>
          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </Avatar>
        <Box className={classes.userInfo}>
          <Typography className={`${classes.userName} user-name`}>
            {user.name || 'Usuario'}
          </Typography>
          <Typography className={classes.userId}>
            ID: {user.id || '-----'}
          </Typography>
        </Box>
      </Box>

      {/* Navigation Section */}
      <Box className={classes.navigationContainer}>
        {wrapWithTooltip((
          <ButtonBase
            className={`${classes.menuItem} ${currentSelection() === 'map' ? 'active' : ''}`}
            onClick={() => handleSelection(null, 'map')}
          >
            <Badge color="error" variant="dot" overlap="circular" invisible={socket !== false}>
              <MapIcon className={`${classes.menuIcon} menu-icon`} />
            </Badge>
            <Typography className={classes.menuLabel}>{t('mapTitle')}</Typography>
          </ButtonBase>
        ), t('mapTitle'))}
        
        {!disableReports && (
          wrapWithTooltip((
            <ButtonBase
              className={`${classes.menuItem} ${currentSelection() === 'reports' ? 'active' : ''}`}
              onClick={() => handleSelection(null, 'reports')}
            >
              <DescriptionIcon className={`${classes.menuIcon} menu-icon`} />
              <Typography className={classes.menuLabel}>{t('reportTitle')}</Typography>
            </ButtonBase>
          ), t('reportTitle'))
        )}

        <Box className={classes.bottomSection}>
          {showEvents && (
            wrapWithTooltip((
              <ButtonBase
                className={classes.menuItem}
                onClick={onEventsClick}
              >
                <Badge color="error" variant="dot" overlap="circular" invisible={!eventsAvailable}>
                  <NotificationsIcon className={`${classes.menuIcon} menu-icon`} />
                </Badge>
                <Typography className={classes.menuLabel}>Notificaciones</Typography>
              </ButtonBase>
            ), 'Notificaciones')
          )}

          {wrapWithTooltip((
            <ButtonBase
              className={classes.menuItem}
              onClick={() => !deviceReadonly && handleSelection(null, 'device-add')}
              disabled={deviceReadonly}
            >
              <AddIcon className={`${classes.menuIcon} menu-icon`} />
              <Typography className={classes.menuLabel}>Registrar dispositivo</Typography>
            </ButtonBase>
          ), 'Registrar dispositivo')}
          
          {wrapWithTooltip((
            <ButtonBase
              className={`${classes.menuItem} ${currentSelection() === 'settings' ? 'active' : ''}`}
              onClick={() => handleSelection(null, 'settings')}
            >
              <SettingsIcon className={`${classes.menuIcon} menu-icon`} />
              <Typography className={classes.menuLabel}>{t('settingsTitle')}</Typography>
            </ButtonBase>
          ), t('settingsTitle'))}
        </Box>
        
        {readonly && (
          wrapWithTooltip((
            <ButtonBase
              className={classes.menuItem}
              onClick={() => handleSelection(null, 'logout')}
            >
              <ExitToAppIcon className={`${classes.menuIcon} menu-icon`} />
              <Typography className={classes.menuLabel}>{t('loginLogout')}</Typography>
            </ButtonBase>
          ), t('loginLogout'))
        )}
      </Box>
      
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={handleAccount}>
          <Typography color="textPrimary">{t('settingsUser')}</Typography>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <Typography color="error">{t('loginLogout')}</Typography>
        </MenuItem>
      </Menu>
    </Paper>
  );
};

export default BottomMenu;
