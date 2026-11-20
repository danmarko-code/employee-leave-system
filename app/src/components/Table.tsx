import { useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Notice, Skeleton } from './Surface';
import { colors, fonts, layout, radius, space } from '@/theme/tokens';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable. Nulls sort last. */
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  /** Relative width on wide screens. Defaults to 1. */
  flex?: number;
  /** Hidden below the mobile breakpoint. */
  hideOnMobile?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowPress?: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyAction?: { label: string; onPress: () => void };
  /** Server-side pagination. Omit for a single page. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  /** Accessible description of what a row is. */
  rowLabel?: (row: T) => string;
}

type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * The single table used by every list screen. Real columns and sortable
 * headers on wide screens; stacked label/value rows below 768px. No chevrons,
 * no cards pretending to be a table.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyAction,
  page,
  pageSize,
  total,
  onPageChange,
  rowLabel,
}: TableProps<T>) {
  const { width } = useWindowDimensions();
  const mobile = width < layout.wideBreakpoint;
  const [sort, setSort] = useState<SortState>(null);

  const visibleColumns = useMemo(
    () => (mobile ? columns.filter((column) => !column.hideOnMobile) : columns),
    [columns, mobile]
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (column: TableColumn<T>) => {
    if (!column.sortValue) return;
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, direction: 'asc' };
      if (current.direction === 'asc') return { key: column.key, direction: 'desc' };
      return null;
    });
  };

  if (error) {
    return (
      <View style={styles.frame}>
        <View style={styles.errorBody}>
          <Notice tone="error">{error}</Notice>
          {onRetry ? (
            <View style={styles.errorAction}>
              <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.frame} accessibilityLabel="Loading">
        {!mobile ? (
          <View style={[styles.headerRow, styles.headerRowFlat]}>
            {columns.map((column) => (
              <View key={column.key} style={[styles.cell, { flex: column.flex ?? 1 }]}>
                <Skeleton height={12} width="55%" />
              </View>
            ))}
          </View>
        ) : null}
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={styles.loadingRow}>
            {visibleColumns.map((column) => (
              <Skeleton key={column.key} height={14} width={column.flex && column.flex < 1 ? '30%' : '70%'} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.frame}>
        <EmptyState title={emptyTitle} action={emptyAction} />
      </View>
    );
  }

  const showPagination = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange;
  const first = showPagination ? (page! - 1) * pageSize! + 1 : 1;
  const last = showPagination ? Math.min(page! * pageSize!, total!) : rows.length;
  const pageCount = showPagination ? Math.max(1, Math.ceil(total! / pageSize!)) : 1;

  return (
    <View style={styles.frame}>
      {!mobile ? (
        <View style={styles.headerRow}>
          {columns.map((column) => {
            const active = sort?.key === column.key;
            const sortable = Boolean(column.sortValue);
            return (
              <Pressable
                key={column.key}
                onPress={() => toggleSort(column)}
                disabled={!sortable}
                accessibilityRole="button"
                accessibilityLabel={
                  sortable
                    ? `${column.header}, sorted ${active ? sort!.direction : 'not sorted'}. Sort.`
                    : column.header
                }
                style={({ pressed }) => [
                  styles.headerCell,
                  { flex: column.flex ?? 1, justifyContent: column.align === 'right' ? 'flex-end' : 'flex-start' },
                  pressed && sortable && { backgroundColor: colors.surfaceMuted },
                  Platform.OS === 'web' && sortable ? ({ cursor: 'pointer' } as ViewStyle) : null,
                ]}
              >
                <AppText variant="micro" tone="muted" style={styles.headerText}>
                  {column.header}
                </AppText>
                {sortable ? (
                  <Ionicons
                    name={active ? (sort!.direction === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={13}
                    color={active ? colors.brand : colors.faint}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {sortedRows.map((row) => {
        const key = rowKey(row);
        const content = mobile ? (
          <View style={styles.stackedRow}>
            {visibleColumns.map((column) => (
              <View key={column.key} style={styles.stackedField}>
                <AppText variant="micro" tone="muted">
                  {column.header}
                </AppText>
                <View style={styles.stackedValue}>{column.render(row)}</View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.row}>
            {columns.map((column) => (
              <View
                key={column.key}
                style={[
                  styles.cell,
                  { flex: column.flex ?? 1, alignItems: column.align === 'right' ? 'flex-end' : 'flex-start' },
                ]}
              >
                {column.render(row)}
              </View>
            ))}
          </View>
        );

        if (!onRowPress) {
          return (
            <View key={key} style={styles.rowWrap}>
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={key}
            onPress={() => onRowPress(row)}
            accessibilityRole="button"
            accessibilityLabel={rowLabel?.(row) ?? 'Open row'}
            style={({ pressed }) => [
              styles.rowWrap,
              styles.rowPressable,
              pressed && { backgroundColor: colors.surfaceMuted },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null,
            ]}
          >
            {content}
          </Pressable>
        );
      })}

      {showPagination ? (
        <View style={styles.footer}>
          <AppText variant="small" tone="muted">
            {first}–{last} of {total}
          </AppText>
          <View style={styles.pager}>
            <PagerButton
              icon="chevron-back"
              label="Previous page"
              disabled={page! <= 1}
              onPress={() => onPageChange!(page! - 1)}
            />
            <AppText variant="small" tone="muted" tabular>
              {page} / {pageCount}
            </AppText>
            <PagerButton
              icon="chevron-forward"
              label="Next page"
              disabled={page! >= pageCount}
              onPress={() => onPageChange!(page! + 1)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pagerButton,
        pressed && !disabled && { backgroundColor: colors.surfaceMuted },
        disabled && { opacity: 0.4 },
        Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as ViewStyle) : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.muted} />
    </Pressable>
  );
}

/** @deprecated alias kept for imports that prefer the explicit name. */
export const DataTable = Table;

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 40,
  },
  headerRowFlat: {
    backgroundColor: colors.surface,
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  headerText: {
    fontFamily: fonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressable: {
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: space.sm,
  },
  cell: {
    paddingHorizontal: space.md,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  stackedRow: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  stackedField: {
    gap: 2,
  },
  stackedValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    gap: space.xl,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  errorBody: {
    padding: space.lg,
    gap: space.md,
  },
  errorAction: {
    flexDirection: 'row',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexWrap: 'wrap',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pagerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
});
