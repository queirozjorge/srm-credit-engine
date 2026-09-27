import { useId, useState } from 'react';
import { Box, Stack, Typography, useMediaQuery } from '@mui/material';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate } from '../../common/format/dates';
import type { Dashboard } from '../services/contracts';
import { chartScale } from '../services/chart';
import { locale, translations } from '../../i18n/pt-BR';
export function PaymentsChart({ rows, currency }: { rows: Dashboard['dailyPayments']; currency: 'BRL' | 'USD' }) {
  const text = translations[locale].dashboard; const title = useId(); const description = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const compact = useMediaQuery('(max-width:600px)'); const width = compact ? 320 : 720;
  const values = rows.map(row => currency === 'BRL' ? row.paymentBrl : row.paymentUsd); const scale = chartScale(values);
  const step = (width - 40) / Math.max(rows.length, 1);
  return <Stack spacing={1.5}>
    <Typography variant="body2">{scale.empty ? text.empty : text.maximum(formatDecimal(scale.maximum, moneyFormat), currency)}</Typography>
    <Box component="svg" role="group" aria-labelledby={`${title} ${description}`} viewBox={`0 0 ${width} 200`} sx={{ width: '100%', maxHeight: 240, color: 'primary.main', display: 'block', '& rect:focus-visible': { outline: 'none', stroke: '#fff', strokeWidth: 3 } }}>
      <title id={title}>{text.chart} · {text.currencies[currency]}</title><desc id={description}>{text.chartDescription}</desc>
      <path d={`M20 164 H${width - 20}`} stroke="currentColor" opacity="0.3" />
      {rows.map((row, index) => {
        const barX = 20 + index * step + step * .15;
        const barY = 164 - scale.heights[index]! * 1.4;
        const barHeight = scale.heights[index]! * 1.4;
        const date = formatCivilDate(row.date);
        const amount = formatDecimal(values[index]!, moneyFormat);
        const label = `${date} · ${currency} ${amount}`;
        const tooltipWidth = Math.min(width - 8, Math.max(124, label.length * (compact ? 6 : 7) + 16));
        const tooltipX = Math.max(4, Math.min(width - tooltipWidth - 4, barX + step * .35 - tooltipWidth / 2));
        const active = hoveredIndex === index || focusedIndex === index;
        return <g key={row.date}>
          <rect
            x={barX} y={barY} width={step * .7} height={barHeight} rx="3" fill="currentColor"
            role="img" aria-label={label} tabIndex={0}
            onPointerEnter={() => setHoveredIndex(index)} onPointerLeave={() => setHoveredIndex(null)}
            onFocus={() => setFocusedIndex(index)} onBlur={() => setFocusedIndex(null)}
          />
          {active && <g aria-hidden="true" pointerEvents="none">
            <rect x={tooltipX} y={Math.max(4, barY - 40)} width={tooltipWidth} height="32" rx="5" fill="#173f3b" />
            <text x={tooltipX + tooltipWidth / 2} y={Math.max(4, barY - 40) + 21} textAnchor="middle" fill="#fff" fontSize={compact ? 11 : 12} textLength={tooltipWidth - 16} lengthAdjust="spacingAndGlyphs">{label}</text>
          </g>}
          {(index === 0 || index === rows.length - 1 || index === Math.floor(rows.length / 2)) && <text x={20 + index * step + step / 2} y="190" textAnchor="middle" fill="currentColor" fontSize={compact ? 16 : 13}>{date.slice(0, 5)}</text>}
        </g>;
      })}
    </Box>
  </Stack>;
}
