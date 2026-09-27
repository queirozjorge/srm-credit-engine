import { useId, useState } from 'react';
import { Box, Button, Collapse, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate } from '../../common/format/dates';
import type { Dashboard } from '../services/contracts';
import { chartScale } from '../services/chart';
import { locale, translations } from '../../i18n/pt-BR';
export function PaymentsChart({ rows, currency }: { rows: Dashboard['dailyPayments']; currency: 'BRL' | 'USD' }) {
  const text = translations[locale].dashboard; const title = useId(); const description = useId();
  const [expanded, setExpanded] = useState(false); const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const compact = useMediaQuery('(max-width:600px)'); const width = compact ? 320 : 720;
  const values = rows.map(row => currency === 'BRL' ? row.paymentBrl : row.paymentUsd); const scale = chartScale(values);
  const step = (width - 40) / Math.max(rows.length, 1);
  return <Stack spacing={1.5}>
    <Typography variant="body2">{scale.empty ? text.empty : text.maximum(formatDecimal(scale.maximum, moneyFormat), currency)}</Typography>
    <Box component="svg" role="img" aria-labelledby={`${title} ${description}`} viewBox={`0 0 ${width} 200`} sx={{ width: '100%', maxHeight: 240, color: 'primary.main', display: 'block' }}>
      <title id={title}>{text.chart} · {text.currencies[currency]}</title><desc id={description}>{text.chartDescription}</desc>
      <path d={`M20 164 H${width - 20}`} stroke="currentColor" opacity="0.3" />
      {rows.map((row, index) => <g key={row.date}>
        <rect x={20 + index * step + step * .15} y={164 - scale.heights[index]! * 1.4} width={step * .7} height={scale.heights[index]! * 1.4} rx="3" fill="currentColor">
          <title>{formatCivilDate(row.date)} · {currency} {formatDecimal(values[index]!, moneyFormat)}</title>
        </rect>
        {(index === 0 || index === rows.length - 1 || index === Math.floor(rows.length / 2)) && <text x={20 + index * step + step / 2} y="190" textAnchor="middle" fill="currentColor" fontSize={compact ? 16 : 13}>{formatCivilDate(row.date).slice(0, 5)}</text>}
      </g>)}
    </Box>
    <Button aria-expanded={expanded} sx={{ alignSelf: 'flex-start' }} onClick={() => setExpanded(!expanded)}>{text.daily}</Button>
    <Collapse in={expanded} timeout={reduced ? 0 : 180}>
      <TableContainer component={Paper} variant="outlined" tabIndex={0} role="region" aria-label={text.daily} sx={{ maxHeight: 260 }}>
        <Table size="small" stickyHeader aria-label={text.daily}><TableHead><TableRow><TableCell>{text.day}</TableCell><TableCell align="right">{text.payment} · {currency}</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((row, index) => <TableRow key={row.date}><TableCell>{formatCivilDate(row.date)}</TableCell><TableCell align="right">{formatDecimal(values[index]!, moneyFormat)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </TableContainer>
    </Collapse>
  </Stack>;
}
