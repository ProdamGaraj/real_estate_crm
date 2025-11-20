import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
        <DialogTitle>Объект №{property.unit_number} ({property.property_type})</DialogTitle>
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
                            alt={`Планировка ${activeStep + 1}`}
                        />
                        <MobileStepper
                            steps={maxSteps}
                            position="static"
                            activeStep={activeStep}
                            nextButton={
                                <Button size="small" onClick={handleNext} disabled={activeStep === maxSteps - 1}>
                                Далее <KeyboardArrowRight />
                                </Button>
                            }
                            backButton={
                                <Button size="small" onClick={handleBack} disabled={activeStep === 0}>
                                <KeyboardArrowLeft /> Назад
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
                        alt="Нет изображения"
                    />
                )}
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6">Детали</Typography>
              <Stack spacing={1} sx={{mb:2}}>
                <Typography><b>Статус:</b> {property.status}</Typography>
                <Typography><b>Площадь:</b> {property.area} м²</Typography>
                <Typography><b>Цена:</b> {Number(property.price).toLocaleString()} у.е.</Typography>
                <Divider/>
                <Typography><b>Этаж:</b> {property.floor}</Typography>
                <Typography><b>Подъезд:</b> {property.entrance || 'N/A'}</Typography>
                <Typography><b>Стояк:</b> {property.riser || 'N/A'}</Typography>
                <Typography><b>Отделка:</b> {property.has_finishing ? 'Да' : 'Нет'}</Typography>
              </Stack>

              <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 2, flexWrap: 'wrap' }}>
                {property.active_deal_id ? (
                  <Button
                    variant="contained"
                    component={RouterLink}
                    to={`/deals/${property.active_deal_id}`}
                  >
                    Перейти в сделку
                  </Button>
                ) : (
                  <>
                    {property.status === 'SELECTION' &&
                      <Button variant="contained" onClick={() => handleStatusChange('RESERVE')} disabled={updatePropMutation.isPending}>Резервировать</Button>}
                    {property.status === 'RESERVE' &&
                      <Button variant="outlined" onClick={() => handleStatusChange('SELECTION')} disabled={updatePropMutation.isPending}>Снять резерв</Button>}
                    {(property.status === 'SELECTION' || property.status === 'RESERVE') &&
                      <Button variant="contained" color="secondary" onClick={() => setBookingModalOpen(true)}>Забронировать</Button>}
                  </>
                )}
              </Stack>

              <Box component="form" onSubmit={handleSubmit(onCommentSave)}>
                <TextField
                  label="Комментарий"
                  fullWidth
                  multiline
                  rows={4}
                  defaultValue={property.description}
                  {...register('description')}
                />
                <Button type="submit" sx={{ mt: 1 }} disabled={updatePropMutation.isPending}>
                  {updatePropMutation.isPending ? <CircularProgress size={24} /> : 'Сохранить комментарий'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>

      <Dialog open={isBookingModalOpen} onClose={() => setBookingModalOpen(false)}>
          <DialogTitle>Забронировать объект №{property.unit_number}</DialogTitle>
          <DialogContent>
              <BookingForm onSubmit={onBookingSubmit} isPending={createDealMutation.isPending} />
          </DialogContent>
      </Dialog>
    </>
  );
}