import { useId } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

type Props = Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'type' | 'slotProps'> & {
  value: string; onValueChange: (value: string) => void; min?: string; max?: string;
};

export function DateField({ value, onValueChange, min, max, id, ...props }: Props) {
  const generatedId = useId();
  return <TextField {...props} id={id ?? generatedId} type="date" value={value}
    onChange={(event) => onValueChange(event.target.value)}
    slotProps={{ inputLabel: { shrink: true }, htmlInput: { min, max } }} />;
}
