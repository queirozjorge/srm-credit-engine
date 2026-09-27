import { forwardRef, isValidElement, useEffect, useState, type ReactNode, type UIEvent } from 'react';
import { Autocomplete, CircularProgress, Grow, Popper, TextField, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import type { PopperProps } from '@mui/material/Popper';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { locale, translations } from '../../i18n/pt-BR';
import { uuid } from '../../common/http/contracts';
import { useApiClient } from '../../common/http/useApiClient';
import { assignorKeys } from '../services/useAssignors';
import { assignorPageSchema, assignorSchema, type Assignor } from '../services/contracts';
import { normalizeSearch } from '../services/validation';

const PAGE_SIZE = 20;
type AllAssignors = { uuid: ''; name: string; selectAll: true };
type Option = Assignor | AllAssignors;
interface Props {
  value: string;
  onChange: (uuid: string, assignor: Assignor | null) => void;
  label: string;
  placeholder: string;
  activeOnly?: boolean;
  allLabel?: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  helperText?: ReactNode;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

const AssignorPopper = forwardRef<HTMLDivElement, PopperProps>(function AssignorPopper(props, ref) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { children, ...popperProps } = props;
  return <Popper {...popperProps} ref={ref} transition>
    {({ TransitionProps, placement }) => {
      const content = typeof children === 'function' ? children({ TransitionProps, placement }) : children;
      return isValidElement(content) ? <Grow {...TransitionProps} timeout={reducedMotion ? 0 : 180}>{content}</Grow> : null;
    }}
  </Popper>;
});

function isAllOption(option: Option): option is AllAssignors {
  return 'selectAll' in option;
}

export function AssignorAutocomplete({ value, onChange, label, placeholder, activeOnly = true, allLabel,
  disabled = false, required = false, error = false, helperText, size, sx }: Props) {
  const text = translations[locale].common;
  const api = useApiClient();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const optionsQuery = useInfiniteQuery({
    queryKey: ['assignors', 'autocomplete', activeOnly, normalizeSearch(debouncedSearch)],
    enabled: open,
    staleTime: 60_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => (await api.request('/api/assignors', {
      schema: assignorPageSchema,
      signal,
      query: { q: normalizeSearch(debouncedSearch), page: pageParam, size: PAGE_SIZE, activeOnly },
    })).data,
    getNextPageParam: page => page.page < page.totalPages ? page.page + 1 : undefined,
  });
  const selectedQuery = useQuery({
    queryKey: assignorKeys.detail(value),
    enabled: uuid.safeParse(value).success,
    queryFn: async ({ signal }) => (await api.request(`/api/assignors/${value}`, { schema: assignorSchema, signal })).data,
    staleTime: 30_000,
  });
  const loaded = optionsQuery.data?.pages.flatMap(page => page.items) ?? [];
  const selected = selectedQuery.data && !loaded.some(assignor => assignor.uuid === selectedQuery.data.uuid)
    ? [selectedQuery.data, ...loaded]
    : loaded;
  const allOption: AllAssignors | null = allLabel ? { uuid: '', name: allLabel, selectAll: true } : null;
  const options: Option[] = allOption ? [allOption, ...selected] : selected;
  const selectedAssignor = value ? selectedQuery.data ?? null : null;

  function loadNext(event: UIEvent<HTMLUListElement>) {
    const list = event.currentTarget;
    if (list.scrollHeight - list.scrollTop <= list.clientHeight + 32 && optionsQuery.hasNextPage && !optionsQuery.isFetchingNextPage) {
      void optionsQuery.fetchNextPage();
    }
  }

  return <Autocomplete<Option, false, false, false>
    slots={{ popper: AssignorPopper }}
    open={open}
    onOpen={() => setOpen(true)}
    onClose={() => setOpen(false)}
    openOnFocus
    disabled={disabled}
    options={options}
    value={selectedAssignor}
    loading={optionsQuery.isLoading || selectedQuery.isFetching}
    loadingText={text.loading}
    noOptionsText={text.empty}
    filterOptions={rows => rows}
    getOptionLabel={option => option.name}
    isOptionEqualToValue={(option, selectedValue) => option.uuid === selectedValue.uuid}
    slotProps={{ listbox: { onScroll: loadNext, sx: { maxHeight: 300 } } }}
    onInputChange={(_, next, reason) => {
      if (reason === 'input') {
        setSearch(next);
      } else if (reason === 'clear' || reason === 'reset') setSearch('');
    }}
    onChange={(_, option) => {
      const assignor = option && !isAllOption(option) ? option : null;
      const nextUuid = assignor?.uuid ?? '';
      if (assignor) cache.setQueryData(assignorKeys.detail(assignor.uuid), assignor);
      onChange(nextUuid, assignor);
      setSearch('');
      setDebouncedSearch('');
    }}
    renderInput={params => <TextField {...params} label={label} placeholder={placeholder} size={size}
      required={required} error={error} helperText={helperText}
      InputProps={{ ...params.InputProps,
        endAdornment: <>{optionsQuery.isFetching && <CircularProgress color="inherit" size={18} />}{params.InputProps.endAdornment}</>,
      }} />}
    sx={sx}
  />;
}
