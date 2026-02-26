import { ReactNode } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Stack,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

export interface MobileCardField<T> {
  /** Field key from the data object */
  key: keyof T | string;
  /** Label to display (i18n key or direct string) */
  label: string;
  /** Whether to use i18n for the label */
  i18nLabel?: boolean;
  /** Custom render function */
  render?: (value: any, item: T) => ReactNode;
  /** Whether this is a primary field (displayed prominently) */
  primary?: boolean;
  /** Whether this is a secondary field (displayed as subtitle) */
  secondary?: boolean;
  /** Whether to display as a chip */
  chip?: boolean;
  /** Chip color based on value */
  chipColor?: (value: any) => 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  /** Hide this field on mobile cards */
  hideOnMobile?: boolean;
}

export interface MobileCardListProps<T> {
  /** Data array to display */
  data: T[];
  /** Field configuration */
  fields: MobileCardField<T>[];
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string;
  /** Click handler for card */
  onCardClick?: (item: T) => void;
  /** Key extractor function */
  keyExtractor: (item: T) => string | number;
  /** Empty state message (i18n key) */
  emptyMessage?: string;
  /** Number of skeleton cards to show while loading */
  skeletonCount?: number;
}

/**
 * Mobile-optimized card list component that replaces DataGrid on small screens
 */
export function MobileCardList<T extends Record<string, any>>({
  data,
  fields,
  isLoading = false,
  error,
  onCardClick,
  keyExtractor,
  emptyMessage = 'common.no_data',
  skeletonCount = 5,
}: MobileCardListProps<T>) {
  const { t } = useTranslation();

  // Filter out hidden fields
  const visibleFields = fields.filter(f => !f.hideOnMobile);
  
  // Get primary, secondary, and regular fields
  const primaryField = visibleFields.find(f => f.primary);
  const secondaryField = visibleFields.find(f => f.secondary);
  const chipFields = visibleFields.filter(f => f.chip);
  const regularFields = visibleFields.filter(f => !f.primary && !f.secondary && !f.chip);

  const getFieldValue = (item: T, field: MobileCardField<T>): any => {
    const keys = String(field.key).split('.');
    let value: any = item;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  };

  const renderFieldValue = (item: T, field: MobileCardField<T>): ReactNode => {
    const value = getFieldValue(item, field);
    if (field.render) {
      return field.render(value, item);
    }
    if (value === null || value === undefined) {
      return '-';
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  };

  const getLabel = (field: MobileCardField<T>): string => {
    if (field.i18nLabel !== false) {
      return t(field.label);
    }
    return field.label;
  };

  // Loading state
  if (isLoading) {
    return (
      <Stack spacing={2}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <Card key={index} variant="outlined">
            <CardContent>
              <Skeleton variant="text" width="60%" height={28} />
              <Skeleton variant="text" width="40%" height={20} sx={{ mb: 1 }} />
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Skeleton variant="rounded" width={60} height={24} />
                <Skeleton variant="rounded" width={80} height={24} />
              </Stack>
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="80%" />
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  // Error state
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">{t(emptyMessage)}</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {data.map((item) => {
        const cardContent = (
          <CardContent sx={{ pb: 2, '&:last-child': { pb: 2 } }}>
            {/* Primary field (title) */}
            {primaryField && (
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {renderFieldValue(item, primaryField)}
              </Typography>
            )}

            {/* Secondary field (subtitle) */}
            {secondaryField && (
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {renderFieldValue(item, secondaryField)}
              </Typography>
            )}

            {/* Chip fields */}
            {chipFields.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1, gap: 0.5 }}>
                {chipFields.map((field) => {
                  const value = getFieldValue(item, field);
                  const color = field.chipColor ? field.chipColor(value) : 'default';
                  return (
                    <Chip
                      key={String(field.key)}
                      label={renderFieldValue(item, field)}
                      size="small"
                      color={color}
                    />
                  );
                })}
              </Stack>
            )}

            {/* Regular fields */}
            {regularFields.map((field) => (
              <Box key={String(field.key)} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {getLabel(field)}:
                </Typography>
                <Typography variant="body2" sx={{ textAlign: 'right', ml: 2 }}>
                  {renderFieldValue(item, field)}
                </Typography>
              </Box>
            ))}
          </CardContent>
        );

        return (
          <Card key={keyExtractor(item)} variant="outlined">
            {onCardClick ? (
              <CardActionArea onClick={() => onCardClick(item)}>
                {cardContent}
              </CardActionArea>
            ) : (
              cardContent
            )}
          </Card>
        );
      })}
    </Stack>
  );
}

export default MobileCardList;
