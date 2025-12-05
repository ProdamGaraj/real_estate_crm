import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, Typography, Box, TextField, Button,
  Stack, CircularProgress, MobileStepper, Paper, Grid, Divider
} from '@mui/material';
import { useForm } from 'react-hook-form';
import type { Property } from '../../api/buildings';
import { updateProperty } from '../../api/properties';
import { createDeal } from '../../api/deals';
import type { DealPayload } from '../../api/deals';
import BookingForm from '../deals/BookingForm';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';

interface ModalProps {
  property: Property | null;
  buildingId: number;
  open: boolean;
  onClose: () => void;
}

export default function PropertyDetailModal({ property, buildingId, open, onClose }: ModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isBookingModalOpen, setBookingModalOpen] = useState(false);
  const { register, handleSubmit, setValue } = useForm<{ description: string }>();

  const [activeStep, setActiveStep] = useState(0);

  const layoutImages = useMemo(() => {
    if (!property?.layout) return [];
    const images = [
      property.layout.main_layout_image,
      property.layout.extra_layout_image,
      property.layout.floor_plan_image,
      property.layout.usp_image,
    ];
    return images.filter(Boolean) as string[];
  }, [property]);

  const maxSteps = layoutImages.length;

  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setValue('description', property?.description || '');
    }
  }, [property, open, setValue]);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const updatePropMutation = useMutation({
    mutationFn: updateProperty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', String(buildingId)] });
      onClose();
    },
  });

  const createDealMutation = useMutation({
      mutationFn: createDeal,
      onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: ['building', String(buildingId)] });
          setBookingModalOpen(false);
          onClose();
          navigate(`/deals/${data.id}`);
      }
  });

  const handleStatusChange = (status: 'SELECTION' | 'RESERVE') => {
    if (!property) return;
    updatePropMutation.mutate({ buildingId, propertyId: property.id, payload: { status } });
  };

  const onCommentSave = (data: { description: string }) => {
    if (!property) return;
    updatePropMutation.mutate({ buildingId, propertyId: property.id, payload: { description: data.description } });
  };

  const onBookingSubmit = (data: DealPayload) => {
      if (!property) return;
      createDealMutation.mutate({ ...data, property: property.id });
  };

  if (!property) return null;

  return (
    <>
      <Dialog open={open && !isBookingModalOpen} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>{t('pages.properties.property_number', { number: property.unit_number })} ({t(`property_types.${property.property_type}`)})</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>

            <Grid item xs={12} md={6}>
                {maxSteps > 0 ? (
                    <Box sx={{ flexGrow: 1 }}>
                        <Paper
                            square
                            elevation={0}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                height: 50,
                                pl: 2,
                                bgcolor: 'background.default',
                            }}
                        >
                            <Typography>{property.layout?.name} {activeStep + 1}/{maxSteps}</Typography>
                        </Paper>
                        <Box
                            component="img"
                            sx={{
                                height: 400,
                                display: 'block',
                                width: '100%',
                                objectFit: 'contain',
                                overflow: 'hidden',
                            }}
                            src={layoutImages[activeStep]}
                            alt={`${t('pages.properties.layout')} ${activeStep + 1}`}
                        />
                        <MobileStepper
                            steps={maxSteps}
                            position="static"
                            activeStep={activeStep}
                            nextButton={
                                <Button size="small" onClick={handleNext} disabled={activeStep === maxSteps - 1}>
                                {t('common.next')} <KeyboardArrowRight />
                                </Button>
                            }
                            backButton={
                                <Button size="small" onClick={handleBack} disabled={activeStep === 0}>
                                <KeyboardArrowLeft /> {t('common.back')}
                                </Button>
                            }
                        />
                    </Box>
                ) : (
                     <Box
                        component="img"
                        sx={{
                            height: 400,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            objectFit: 'contain',
                            overflow: 'hidden',
                            borderRadius: 2,
                            bgcolor: 'grey.200'
                        }}
                        src={'https://placehold.co/600x400/eee/ccc?text=No+Image'}
                        alt={t('pages.properties.no_image')}
                    />
                )}
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6">{t('common.details')}</Typography>
              <Stack spacing={1} sx={{mb:2}}>
                <Typography><b>{t('forms.status')}:</b> {t(`statuses.property.${property.status}`)}</Typography>
                <Typography><b>{t('pages.properties.area')}:</b> {property.area} {t('pages.properties.sqm')}</Typography>
                <Typography><b>{t('table.price')}:</b> {Number(property.price).toLocaleString()} {t('common.currency')}</Typography>
                <Divider/>
                <Typography><b>{t('pages.properties.floor')}:</b> {property.floor}</Typography>
                <Typography><b>{t('pages.properties.entrance')}:</b> {property.entrance || 'N/A'}</Typography>
                <Typography><b>{t('pages.properties.riser')}:</b> {property.riser || 'N/A'}</Typography>
                <Typography><b>{t('pages.properties.finishing')}:</b> {property.has_finishing ? t('common.yes') : t('common.no')}</Typography>
              </Stack>

              <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 2, flexWrap: 'wrap' }}>
                {property.active_deal_id ? (
                  <Button
                    variant="contained"
                    component={RouterLink}
                    to={`/deals/${property.active_deal_id}`}
                  >
                    {t('pages.properties.go_to_deal')}
                  </Button>
                ) : (
                  <>
                    {property.status === 'SELECTION' &&
                      <Button variant="contained" onClick={() => handleStatusChange('RESERVE')} disabled={updatePropMutation.isPending}>{t('pages.properties.reserve')}</Button>}
                    {property.status === 'RESERVE' &&
                      <Button variant="outlined" onClick={() => handleStatusChange('SELECTION')} disabled={updatePropMutation.isPending}>{t('pages.properties.remove_reserve')}</Button>}
                    {(property.status === 'SELECTION' || property.status === 'RESERVE') &&
                      <Button variant="contained" color="secondary" onClick={() => setBookingModalOpen(true)}>{t('pages.properties.book')}</Button>}
                  </>
                )}
              </Stack>

              <Box component="form" onSubmit={handleSubmit(onCommentSave)}>
                <TextField
                  label={t('forms.comment')}
                  fullWidth
                  multiline
                  rows={4}
                  defaultValue={property.description}
                  {...register('description')}
                />
                <Button type="submit" sx={{ mt: 1 }} disabled={updatePropMutation.isPending}>
                  {updatePropMutation.isPending ? <CircularProgress size={24} /> : t('pages.properties.save_comment')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>

      <Dialog open={isBookingModalOpen} onClose={() => setBookingModalOpen(false)}>
          <DialogTitle>{t('pages.properties.book_property', { number: property.unit_number })}</DialogTitle>
          <DialogContent>
              <BookingForm onSubmit={onBookingSubmit} isPending={createDealMutation.isPending} />
          </DialogContent>
      </Dialog>
    </>
  );
}