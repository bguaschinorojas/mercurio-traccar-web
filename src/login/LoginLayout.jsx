import { makeStyles } from 'tss-react/mui';

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    width: '100vw',
    background: theme.palette.background.default,
  },
  logo: {
    maxWidth: '300px',
    width: '80%',
    height: 'auto',
    objectFit: 'contain',
  },
  form: {
    padding: theme.spacing(5),
    width: '100%',
    maxWidth: theme.spacing(52),
    margin: theme.spacing(2),
  },
}));

const LoginLayout = ({ children }) => {
  const { classes } = useStyles();

  return (
    <main className={classes.root}>
      <img 
        src="/cruzero.png" 
        alt="Logo Cruzero" 
        className={classes.logo}
      />
      <form className={classes.form}>
        {children}
      </form>
    </main>
  );
};

export default LoginLayout;
