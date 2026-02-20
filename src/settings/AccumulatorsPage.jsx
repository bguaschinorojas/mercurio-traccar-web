import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Container,
  TextField,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import { useCatch } from '../reactHelper';
import { useAttributePreference } from '../common/util/preferences';
import { distanceFromMeters, distanceToMeters, distanceUnitString } from '../common/util/converter';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { devicesActions } from '../store';

const AccumulatorsPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { classes } = useSettingsStyles();
  const t = useTranslation();

  const distanceUnit = useAttributePreference('distanceUnit');

  const { deviceId } = useParams();
  const position = useSelector((state) => state.session.positions[deviceId]);
  const device = useSelector((state) => state.devices.items[deviceId]); // Agregar device del store

  const [item, setItem] = useState();

  useEffect(() => {
    // Priorizar datos del device sobre position para consistencia con StatusCard
    const deviceData = device || {};
    const positionData = position || {};
    
    setItem({
      deviceId: parseInt(deviceId, 10),
      hours: deviceData.attributes?.hours || positionData.attributes?.hours || 0,
      totalDistance: deviceData.attributes?.totalDistance || positionData.attributes?.totalDistance || 0,
    });
  }, [deviceId, position, device]); // Agregar device a las dependencias

  const handleSave = useCatch(async () => {
    await fetchOrThrow(`/api/devices/${deviceId}/accumulators`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    
    // Actualizar el device en el Redux store para consistencia
    if (device) {
      const updatedDevice = {
        ...device,
        attributes: {
          ...device.attributes,
          totalDistance: item.totalDistance,
          hours: item.hours,
        }
      };
      dispatch(devicesActions.update([updatedDevice]));
    }
    navigate(-1);
  });

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['sharedDeviceAccumulators']}>
      {item && (
        <Container maxWidth="xs" className={classes.container}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                {t('sharedRequired')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                type="number"
                value={item.hours / 3600000}
                onChange={(event) => setItem({ ...item, hours: Number(event.target.value) * 3600000 })}
                label={t('positionHours')}
              />
              <TextField
                type="number"
                value={distanceFromMeters(item.totalDistance, distanceUnit)}
                onChange={(event) => setItem({ ...item, totalDistance: distanceToMeters(Number(event.target.value), distanceUnit) })}
                label={`${t('deviceTotalDistance')} (${distanceUnitString(distanceUnit, t)})`}
              />
            </AccordionDetails>
          </Accordion>
          <div className={classes.buttons}>
            <Button
              type="button"
              color="primary"
              variant="outlined"
              onClick={() => navigate(-1)}
            >
              {t('sharedCancel')}
            </Button>
            <Button
              type="button"
              color="primary"
              variant="contained"
              onClick={handleSave}
            >
              {t('sharedSave')}
            </Button>
          </div>
        </Container>
      )}
    </PageLayout>
  );
};

export default AccumulatorsPage;
