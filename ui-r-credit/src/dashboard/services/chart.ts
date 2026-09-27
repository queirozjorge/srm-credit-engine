export function chartScale(values: string[]) {
  const units = values.map(value => BigInt(value.replace('.', '')));
  const maximum = units.reduce((a, b) => a > b ? a : b, 0n);
  // Conversão limitada às coordenadas do desenho. Valores financeiros e rótulos continuam decimais exatos.
  return { heights: units.map(value => maximum === 0n ? 0 : Number(value * 10000n / maximum) / 100), empty: maximum === 0n,
    maximum: `${maximum / 100n}.${String(maximum % 100n).padStart(2, '0')}` };
}
