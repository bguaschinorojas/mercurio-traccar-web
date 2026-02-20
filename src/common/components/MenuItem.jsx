import { makeStyles } from 'tss-react/mui';
import { ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Link } from 'react-router-dom';

const useStyles = makeStyles()(() => ({
  menuItemText: {
    whiteSpace: 'nowrap',
  },
}));

const MenuItem = ({
  title,
  link,
  icon,
  selected,
  className,
  showIcon = true,
  primaryTypographyProps,
}) => {
  const { classes } = useStyles();
  return (
    <ListItemButton key={link} component={Link} to={link} selected={selected} className={className}>
      {showIcon && icon ? <ListItemIcon>{icon}</ListItemIcon> : null}
      <ListItemText
        primary={title}
        className={classes.menuItemText}
        primaryTypographyProps={primaryTypographyProps}
      />
    </ListItemButton>
  );
};

export default MenuItem;
