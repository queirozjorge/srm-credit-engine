import { InputAdornment } from '@mui/material';
import { formatDecimal, moneyFormat, parseDecimalInput, rateFormat } from '../format/decimal';
import { locale, translations } from '../../i18n/pt-BR';
import { FormattedField, type FormattedFieldProps } from './FormattedField';

type Props = Omit<FormattedFieldProps, 'parse' | 'format' | 'editable' | 'invalidMessage' | 'slotProps'> & {
  kind?: 'money' | 'rate'; currency?: 'BRL' | 'USD'; allowNegative?: boolean;
};

export function DecimalField({ kind = 'money', currency = 'BRL', allowNegative = false, ...props }: Props) {
  const format = { ...(kind === 'money' ? moneyFormat : rateFormat), allowNegative };
  const text = translations[locale].common.fields;
  return <FormattedField {...props} invalidMessage={text.decimal}
    parse={(draft) => parseDecimalInput(draft, format)} format={(value) => formatDecimal(value, format)}
    editable={(value) => value.replace('.', ',')}
    slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { startAdornment: kind === 'money'
      ? <InputAdornment position="start">{text.currencies[currency]}</InputAdornment> : undefined } }} />;
}
