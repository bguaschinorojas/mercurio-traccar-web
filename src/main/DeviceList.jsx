import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { VariableSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { devicesActions, groupsActions } from '../store';
import { useEffectAsync, useCatchCallback } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import DeviceRow from './DeviceRow';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { REPORT_COLOR_PALETTE, normalizeReportColor } from '../common/util/reportColor';

const useStyles = makeStyles()((theme) => ({
  list: {
    maxHeight: '100%',
  },
  listInner: {
    position: 'relative',
    margin: theme.spacing(1.5, 0),
  },
  groupHeader: {
    height: '36px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    color: '#6B7280',
    backgroundColor: '#F8FAFC',
    borderTop: 'none',
    borderBottom: '1px solid #E5E7EB',
    fontSize: '12px',
    fontWeight: 600,
  },
  groupHeaderContent: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  groupHeaderTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6B7280',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingRight: '8px',
  },
  groupMenuButton: {
    color: '#6B7280',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    '&:hover': {
      backgroundColor: '#EEF2F7',
    },
  },
  menuItemLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.palette.text.primary,
    cursor: 'default',
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
}));

const OuterElement = forwardRef(function OuterElement(props, ref) {
  const theme = useTheme();
  const { className, style, ...rest } = props;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        direction: theme.direction, 
      }}
      {...rest}
    />
  );
});

const GroupHeaderRow = ({ row, style }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const t = useTranslation();
  const groups = useSelector((state) => state.groups.items);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const group = row.groupId ? groups[row.groupId] : null;
  const menuOpen = Boolean(menuAnchorEl);
  const selectedColor = normalizeReportColor(group?.attributes?.['web.reportColor']) || REPORT_COLOR_PALETTE[0];

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = (event) => {
    event?.stopPropagation();
    setMenuAnchorEl(null);
  };

  const saveGroupColor = useCatchCallback(async (colorValue) => {
    if (!group?.id) {
      return;
    }

    const normalized = normalizeReportColor(colorValue);
    if (!normalized) {
      return;
    }

    const updatedGroup = {
      ...group,
      attributes: {
        ...(group.attributes || {}),
        'web.reportColor': normalized,
      },
    };

    const response = await fetchOrThrow(`/api/groups/${group.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedGroup),
    });

    dispatch(groupsActions.update([await response.json()]));
  }, [dispatch, group]);

  const handleColorSelect = (event, colorValue) => {
    event.stopPropagation();
    saveGroupColor(colorValue);
    setMenuAnchorEl(null);
  };

  return (
    <div style={style} className={classes.groupHeader}>
      <div className={classes.groupHeaderContent}>
        <Typography variant="caption" className={classes.groupHeaderTitle}>{row.title}</Typography>
        {group?.id ? (
          <>
            <IconButton
              size="small"
              className={classes.groupMenuButton}
              onClick={handleMenuOpen}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={menuAnchorEl}
              open={menuOpen}
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
                    className={`${classes.colorOption} ${selectedColor === colorValue ? classes.colorOptionSelected : ''}`}
                    sx={{ backgroundColor: colorValue }}
                    aria-label={`${t('deviceChangeColor') || 'Cambiar color'} ${colorValue}`}
                  />
                ))}
              </Box>
            </Menu>
          </>
        ) : null}
      </div>
    </div>
  );
};

const DeviceList = ({ devices }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const groups = useSelector((state) => state.groups.items);
  const listRef = useRef(null);

  const [, setTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 60000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/devices');
    dispatch(devicesActions.refresh(await response.json()));
  }, []);

  const items = useMemo(() => {
    if (!devices.length) return [];
    const withIndex = devices.map((device, index) => ({ device, index }));
    const getGroupMeta = (device) => {
      if (device.groupId && groups?.[device.groupId]) {
        return {
          id: groups[device.groupId].id,
          name: groups[device.groupId].name || 'Grupo por defecto',
        };
      }
      return {
        id: null,
        name: 'Grupo por defecto',
      };
    };

    const sorted = withIndex.sort((a, b) => {
      const groupA = getGroupMeta(a.device);
      const groupB = getGroupMeta(b.device);
      const byName = groupA.name.localeCompare(groupB.name, 'es', { sensitivity: 'base' });
      if (byName !== 0) {
        return byName;
      }
      if ((groupA.id || 0) !== (groupB.id || 0)) {
        return (groupA.id || 0) - (groupB.id || 0);
      }
      return a.index - b.index;
    });

    const result = [];
    let lastGroupKey = null;
    for (const entry of sorted) {
      const groupMeta = getGroupMeta(entry.device);
      const groupKey = groupMeta.id ?? 'default';
      if (groupKey !== lastGroupKey) {
        result.push({
          type: 'header',
          title: groupMeta.name,
          groupId: groupMeta.id,
        });
        lastGroupKey = groupKey;
      }
      result.push({ type: 'device', device: entry.device });
    }
    return result;
  }, [devices, groups]);

  const getItemSize = (index) => (items[index]?.type === 'header' ? 36 : 72);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0, true);
  }, [items]);

  const Row = ({ data, index, style }) => {
    const row = data[index];
    if (row?.type === 'header') {
      return <GroupHeaderRow row={row} style={style} />;
    }
    return (
      <DeviceRow item={row.device} style={style} />
    );
  };

  return (
    <AutoSizer className={classes.list}>
      {({ height, width }) => (
        <VariableSizeList
          ref={listRef}
          width={width}
          height={height}
          itemCount={items.length}
          itemData={items}
          itemSize={getItemSize}
          overscanCount={10}
          outerElementType={OuterElement}
          itemKey={(index, data) => {
            const row = data[index];
            if (!row) return `row-${index}`;
            return row.type === 'header'
              ? `group-${row.groupId ?? 'default'}-${row.title}`
              : `device-${row.device.id}`;
          }}
        >
          {Row}
        </VariableSizeList>
      )}
    </AutoSizer>
  );
};

export default DeviceList;
