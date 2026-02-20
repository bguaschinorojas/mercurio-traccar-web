import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { VariableSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useTheme } from '@mui/material/styles';
import { Typography } from '@mui/material';
import { devicesActions } from '../store';
import { useEffectAsync } from '../reactHelper';
import DeviceRow from './DeviceRow';
import fetchOrThrow from '../common/util/fetchOrThrow';

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
    const getGroupName = (device) => {
      if (device.groupId && groups?.[device.groupId]) {
        return groups[device.groupId].name || 'Grupo por defecto';
      }
      return 'Grupo por defecto';
    };
    const sorted = withIndex.sort((a, b) => {
      const groupA = getGroupName(a.device);
      const groupB = getGroupName(b.device);
      if (groupA === groupB) return a.index - b.index;
      return groupA.localeCompare(groupB, 'es', { sensitivity: 'base' });
    });
    const result = [];
    let lastGroup = null;
    for (const entry of sorted) {
      const groupName = getGroupName(entry.device);
      if (groupName !== lastGroup) {
        result.push({ type: 'header', title: groupName });
        lastGroup = groupName;
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
      return (
        <div style={style} className={classes.groupHeader}>
          <Typography variant="caption">{row.title}</Typography>
        </div>
      );
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
            return row.type === 'header' ? `group-${row.title}` : `device-${row.device.id}`;
          }}
        >
          {Row}
        </VariableSizeList>
      )}
    </AutoSizer>
  );
};

export default DeviceList;
