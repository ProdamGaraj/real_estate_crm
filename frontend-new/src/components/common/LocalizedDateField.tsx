import React from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { getDateFnsLocale } from '../../utils/translations';

interface LocalizedDateFieldProps {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

/**
 * A localized date picker that respects the current i18n language
 */
export const LocalizedDateField: React.FC<LocalizedDateFieldProps> = ({
  label,
  value,
  onChange,
  size = 'small',
  fullWidth = true,
  disabled = false,
  minDate,
  maxDate,
}) => {
  // Convert string to Date for DatePicker
  const dateValue = value ? new Date(value) : null;

  const handleChange = (newValue: Date | null) => {
    if (newValue) {
      // Format as YYYY-MM-DD for API compatibility
      const year = newValue.getFullYear();
      const month = String(newValue.getMonth() + 1).padStart(2, '0');
      const day = String(newValue.getDate()).padStart(2, '0');
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange(null);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={getDateFnsLocale()}>
      <DatePicker
        label={label}
        value={dateValue}
        onChange={handleChange}
        disabled={disabled}
        minDate={minDate}
        maxDate={maxDate}
        slotProps={{
          textField: {
            size,
            fullWidth,
          },
        }}
      />
    </LocalizationProvider>
  );
};

export default LocalizedDateField;
