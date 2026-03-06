import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

export default function Table({ columns, data, onRowPress, onSort, sortKey, sortOrder, emptyText }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          {columns.map((col, index) => {
            const canSort = !!col.sortKey && typeof onSort === 'function';
            const isSorted = sortKey && col.sortKey === sortKey;
            const cellStyle = [styles.cell, styles.headerCell, { width: col.width || 100, flex: col.flex }];
            if (canSort) {
              return (
                <TouchableOpacity
                  key={index}
                  style={cellStyle}
                  onPress={() => onSort(col.sortKey)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headerText}>{col.title}</Text>
                  {isSorted ? (
                    <Text style={styles.sortText}>{sortOrder === 'asc' ? '↑' : '↓'}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            }
            return (
              <View key={index} style={cellStyle}>
                <Text style={styles.headerText}>{col.title}</Text>
              </View>
            );
          })}
        </View>

        {data.map((item, rowIndex) => (
          <TouchableOpacity
            key={rowIndex}
            style={styles.row}
            onPress={onRowPress ? () => onRowPress(item) : undefined}
            activeOpacity={onRowPress ? 0.7 : 1}
            disabled={!onRowPress}
          >
            {columns.map((col, colIndex) => (
              <View key={colIndex} style={[styles.cell, { width: col.width || 100, flex: col.flex }]}>
                {col.render ? (
                  col.render(item)
                ) : (
                  <Text style={styles.cellText}>{item[col.key]}</Text>
                )}
              </View>
            ))}
          </TouchableOpacity>
        ))}
        
        {data.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{emptyText || 'No data available'}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: '100%',
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
  },
  cell: {
    paddingHorizontal: tokens.spacing.sm,
    justifyContent: 'center',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semibold,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  sortText: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
  },
  cellText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
  },
  emptyContainer: {
    padding: tokens.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: tokens.colors.textMuted,
  },
});
