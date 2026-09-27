import { useId, useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

export type FormattedFieldProps = Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'type' | 'onFocus' | 'onBlur'> & {
  value: string;
  onValueChange: (value: string) => void;
  parse: (draft: string) => string | null;
  format: (value: string) => string;
  editable?: (value: string) => string;
  invalidMessage: string;
};

export function FormattedField({ value, onValueChange, parse, format, editable = (current) => current,
  invalidMessage, error, helperText, id, ...props }: FormattedFieldProps) {
  const generatedId = useId();
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState({ source: value, draft: editable(value), invalid: false });
  if (value !== state.source) setState({ source: value, draft: editable(value), invalid: false });
  const displayed = focused || state.invalid ? state.draft : format(value);
  return (
    <TextField {...props} id={id ?? generatedId} type="text" value={displayed}
      error={Boolean(error || state.invalid)} helperText={state.invalid ? invalidMessage : helperText}
      onFocus={() => { setFocused(true); if (!state.invalid) setState({ source: value, draft: editable(value), invalid: false }); }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        const draft = event.target.value;
        const parsed = draft === '' ? '' : parse(draft);
        const next = parsed ?? '';
        setState({ source: next, draft, invalid: parsed === null });
        onValueChange(next);
      }} />
  );
}
