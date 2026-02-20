import { useState } from 'react';
import {
  Button, TextField, Typography, Snackbar, Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { makeStyles } from 'tss-react/mui';
import { useNavigate } from 'react-router-dom';
import LoginLayout from './LoginLayout';
import { useTranslation } from '../common/components/LocalizationProvider';
import useQuery from '../common/util/useQuery';
import { snackBarDurationShortMs } from '../common/util/duration';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';

const useStyles = makeStyles()((theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.spacing(3),
    fontWeight: 500,
    marginLeft: theme.spacing(1),
    textTransform: 'uppercase',
  },
  resetButton: {
    backgroundColor: '#db545a',
    '&:hover': {
      backgroundColor: '#c44951',
    },
    '&:disabled': {
      backgroundColor: theme.palette.action.disabled,
      color: theme.palette.action.disabled,
    },
  },
  pageTitle: {
    fontSize: theme.spacing(2.5),
    fontWeight: 500,
    textAlign: 'center',
    marginBottom: theme.spacing(0),
    color: theme.palette.text.primary,
  },
  pageSubtitle: {
    fontSize: theme.spacing(1.8),
    textAlign: 'center',
    marginBottom: theme.spacing(0),
    color: theme.palette.text.secondary,
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing(2),
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    textDecoration: 'none',
    fontSize: theme.spacing(1.6),
    '&:hover': {
      color: theme.palette.primary.main,
    },
  },
}));

const ResetPasswordPage = () => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const t = useTranslation();
  const query = useQuery();

  const token = query.get('passwordReset');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleSubmit = useCatch(async (event) => {
    event.preventDefault();
    if (!token) {
      await fetchOrThrow('/api/password/reset', {
        method: 'POST',
        body: new URLSearchParams(`email=${encodeURIComponent(email)}`),
      });
    } else {
      await fetchOrThrow('/api/password/update', {
        method: 'POST',
        body: new URLSearchParams(`token=${encodeURIComponent(token)}&password=${encodeURIComponent(password)}`),
      });
    }
    setSnackbarOpen(true);
  });

  return (
    <LoginLayout>
      <div className={classes.container}>
        <Typography className={classes.pageTitle}>
          ¿Olvidó su contraseña?
        </Typography>
        <Typography className={classes.pageSubtitle}>
          Ingresa tu correo para que te enviemos un enlace de recuperación
        </Typography>
        
        {!token ? (
          <TextField
            required
            type="email"
            label={t('userEmail')}
            name="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        ) : (
          <TextField
            required
            label={t('userPassword')}
            name="password"
            value={password}
            type="password"
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
        <Button
          variant="contained"
          color="secondary"
          type="submit"
          onClick={handleSubmit}
          disabled={!/(.+)@(.+)\.(.{2,})/.test(email) && !password}
          fullWidth
          className={classes.resetButton}
        >
          {t('loginReset')}
        </Button>
        
        <Link
          className={classes.backLink}
          onClick={() => navigate('/login')}
          underline="none"
        >
          <ArrowBackIcon sx={{ marginRight: 1, fontSize: '1.2rem' }} />
          Volver al login
        </Link>
      </div>
      <Snackbar
        open={snackbarOpen}
        onClose={() => navigate('/login')}
        autoHideDuration={snackBarDurationShortMs}
        message={!token ? t('loginResetSuccess') : t('loginUpdateSuccess')}
      />
    </LoginLayout>
  );
};

export default ResetPasswordPage;
