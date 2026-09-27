import { formatCnpj, normalizeCnpj } from '../format/document';
import { locale, translations } from '../../i18n/pt-BR';
import { FormattedField, type FormattedFieldProps } from './FormattedField';

type Props = Omit<FormattedFieldProps, 'parse' | 'format' | 'editable' | 'invalidMessage' | 'slotProps'>;

export function CnpjField(props: Props) {
  return <FormattedField {...props} parse={normalizeCnpj} format={formatCnpj}
    invalidMessage={translations[locale].common.fields.document}
    slotProps={{ htmlInput: { autoCapitalize: 'characters', spellCheck: false } }} />;
}
