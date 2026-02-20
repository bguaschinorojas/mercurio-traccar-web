import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import BottomMenu from '../common/components/BottomMenu';
import { useTranslation } from '../common/components/LocalizationProvider';
import ReportsMenu from './components/ReportsMenu';

const useStyles = makeStyles()((theme) => ({
  root: {
    minHeight: '100vh',
    backgroundColor: theme.palette.background.default,
  },
  content: {
    height: '100vh',
    padding: 0,
    boxSizing: 'border-box',
    display: 'flex',
    [theme.breakpoints.up('md')]: {
      marginLeft: 'var(--side-nav-width, 240px)',
    },
  },
  panel: {
    width: 260,
    maxWidth: 260,
    minWidth: 260,
    height: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: theme.spacing(2, 2, 1, 2),
  },
  menuContainer: {
    flex: 1,
    overflowY: 'auto',
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
}));

const ReportsHomePage = () => {
  const { classes } = useStyles();
  const theme = useTheme();
  const t = useTranslation();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <div className={classes.root}>
      {desktop && <BottomMenu />}
      <Box className={classes.content}>
        <Paper className={classes.panel} elevation={3}>
          <Box className={classes.header}>
            <Typography className={classes.title}>{t('reportTitle')}</Typography>
            <Typography className={classes.subtitle}>Selecciona un reporte</Typography>
          </Box>
          <Box className={classes.menuContainer}>
            <ReportsMenu />
          </Box>
        </Paper>
      </Box>
    </div>
  );
};

export default ReportsHomePage;
