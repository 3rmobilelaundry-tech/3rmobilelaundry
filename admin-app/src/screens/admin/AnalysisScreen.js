import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions, Pressable } from 'react-native';
import { Text, Card, Title, Paragraph, Button, ActivityIndicator, useTheme, DataTable } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { staff } from '../../services/api';

const useCountUp = (value, duration = 800) => {
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animated.stopAnimation();
    animated.setValue(0);
    const id = animated.addListener(({ value: next }) => setDisplay(next));
    Animated.timing(animated, {
      toValue: Number(value) || 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
    return () => {
      animated.removeListener(id);
    };
  }, [value, duration, animated]);

  return display;
};

const AnalysisScreen = () => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('daily'); // daily, weekly, monthly (for reports view, but dashboard is mostly realtime/daily snapshot)
  const pageAnim = useRef(new Animated.Value(0)).current;
  const sectionAnims = useRef([...Array(7)].map(() => new Animated.Value(0))).current;
  const hoverAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const animationsStarted = useRef(false);
  const [hoveredMetric, setHoveredMetric] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analysisRes, reportsRes] = await Promise.all([
        staff.getAnalysis('daily'),
        staff.getAnalysisReports(null, 5)
      ]);
      const nextData = analysisRes?.data && typeof analysisRes.data === 'object' ? analysisRes.data : null;
      const nextReports = Array.isArray(reportsRes?.data) ? reportsRes.data : [];
      setData(nextData);
      setReports(nextReports);
    } catch (error) {
      setError(error);
      try {
        await staff.logFrontError({
          source: 'analysis',
          message: error?.message || 'analysis_load_failed',
          stack: error?.stack || '',
          href: typeof window !== 'undefined' ? window.location.href : ''
        });
      } catch {}
      console.error('Failed to load analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const safeData = data && typeof data === 'object' ? data : {};
  const {
    popular_plans = [],
    revenue_by_school = [],
    avg_turnaround_hours = 0,
    peak_pickup_days = [],
    completion_rate = 0,
    total_orders = 0
  } = safeData;
  const safeReports = Array.isArray(reports) ? reports : [];
  const completionDisplay = useCountUp(completion_rate, 900);
  const turnaroundDisplay = useCountUp(avg_turnaround_hours, 900);
  const ordersDisplay = useCountUp(total_orders, 900);
  const metricCardWidth = width < 720 ? '100%' : width < 1100 ? '48%' : '32%';

  useEffect(() => {
    if (!loading && data && !animationsStarted.current) {
      animationsStarted.current = true;
      Animated.timing(pageAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      Animated.stagger(
        120,
        sectionAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          })
        )
      ).start();
    }
  }, [loading, data, pageAnim, sectionAnims]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Unable to load analysis right now.</Text>
        <Button onPress={loadData}>Retry</Button>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No analysis data available.</Text>
        <Button onPress={loadData}>Retry</Button>
      </View>
    );
  }

  const metrics = [
    {
      key: 'completion',
      value: completionDisplay,
      label: 'Completion Rate',
      unit: '%',
      icon: 'checkmark-circle-outline',
      iconColor: theme.colors.primary,
      iconBg: '#EAF4FF'
    },
    {
      key: 'turnaround',
      value: turnaroundDisplay,
      label: 'Avg Turnaround',
      unit: 'h',
      icon: 'time-outline',
      iconColor: '#FF9800',
      iconBg: '#FFF4E5'
    },
    {
      key: 'orders',
      value: ordersDisplay,
      label: 'Total Orders',
      unit: '',
      icon: 'cart-outline',
      iconColor: '#2196F3',
      iconBg: '#E3F2FD'
    }
  ];

  // Simple Bar Chart Component
  const BarChart = ({ data, labelKey, valueKey, color, maxVal }) => {
    const maxValue = maxVal || Math.max(...data.map(d => d[valueKey]), 1);
    const chartHeight = 200;
    const barMaxHeight = 140;
    const animatedHeights = useRef([]).current;
    const [hoverIndex, setHoverIndex] = useState(null);

    if (animatedHeights.length !== data.length) {
      animatedHeights.splice(0, animatedHeights.length, ...data.map(() => new Animated.Value(0)));
    }

    useEffect(() => {
      Animated.stagger(
        60,
        animatedHeights.map((anim, index) =>
          Animated.timing(anim, {
            toValue: Math.max(6, (Number(data[index]?.[valueKey] || 0) / maxValue) * barMaxHeight),
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false
          })
        )
      ).start();
    }, [data, maxValue, barMaxHeight, animatedHeights]);

    return (
      <View style={[styles.chartContainer, { height: chartHeight }]}>
        <View style={StyleSheet.absoluteFill}>
            {[0.25, 0.5, 0.75, 1].map((line, i) => (
                <View key={i} style={[styles.gridLine, { bottom: `${line * 100}%` }]} />
            ))}
        </View>
        
        {data.map((item, index) => {
            const barHeight = animatedHeights[index] || new Animated.Value(0);
            const isActive = hoverIndex === index;
            const displayValue = Number(item[valueKey] || 0);
            return (
                <Pressable
                  key={index}
                  onPressIn={() => setHoverIndex(index)}
                  onPressOut={() => setHoverIndex(null)}
                  onHoverIn={() => setHoverIndex(index)}
                  onHoverOut={() => setHoverIndex(null)}
                  style={styles.barWrapper}
                >
                  <View style={styles.barValueWrap}>
                    {isActive ? (
                      <View style={styles.tooltip}>
                        <Text style={styles.tooltipText}>{displayValue}</Text>
                      </View>
                    ) : (
                      <Text style={styles.barValue}>{displayValue}</Text>
                    )}
                  </View>
                  <Animated.View style={[styles.bar, { height: barHeight, backgroundColor: color }]} />
                  <Text style={styles.barLabel} numberOfLines={1}>{item[labelKey]}</Text>
                </Pressable>
            );
        })}
      </View>
    );
  };

  return (
    <Animated.ScrollView
      style={[styles.container, { opacity: pageAnim }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[styles.header, { opacity: sectionAnims[0], transform: [{ translateY: sectionAnims[0].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="analytics-outline" size={30} color={theme.colors.primary} />
            </View>
            <View>
                <Title style={styles.title}>Operational Analysis</Title>
                <Paragraph style={styles.subtitle}>Turn operations into decision-making data</Paragraph>
            </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.metricsGrid, { opacity: sectionAnims[1], transform: [{ translateY: sectionAnims[1].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        {metrics.map((item, index) => {
          const hover = hoverAnims[index];
          const scale = hover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
          const isHovered = hoveredMetric === item.key;
          return (
            <Pressable
              key={item.key}
              onPressIn={() => {
                setHoveredMetric(item.key);
                Animated.timing(hover, { toValue: 1, duration: 160, useNativeDriver: false }).start();
              }}
              onPressOut={() => {
                setHoveredMetric(null);
                Animated.timing(hover, { toValue: 0, duration: 160, useNativeDriver: false }).start();
              }}
              onHoverIn={() => {
                setHoveredMetric(item.key);
                Animated.timing(hover, { toValue: 1, duration: 160, useNativeDriver: false }).start();
              }}
              onHoverOut={() => {
                setHoveredMetric(null);
                Animated.timing(hover, { toValue: 0, duration: 160, useNativeDriver: false }).start();
              }}
              style={[styles.metricPressable, { width: metricCardWidth }]}
            >
              <Animated.View style={[styles.metricCard, { transform: [{ scale }], shadowOpacity: isHovered ? 0.18 : 0.08, elevation: isHovered ? 7 : 3 }]}>
                <Card.Content style={styles.cardContent}>
                  <View style={[styles.iconContainer, { backgroundColor: item.iconBg }]}>
                      <Ionicons name={item.icon} size={22} color={item.iconColor} />
                  </View>
                  <View>
                      <Title style={styles.metricValue}>
                        {item.key === 'completion' ? item.value.toFixed(1) : item.key === 'turnaround' ? item.value.toFixed(1) : Math.round(item.value)}
                        {item.unit}
                      </Title>
                      <Paragraph style={styles.metricLabel}>{item.label}</Paragraph>
                  </View>
                </Card.Content>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>

      <Animated.View style={[styles.sectionCard, { opacity: sectionAnims[2], transform: [{ translateY: sectionAnims[2].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Card style={styles.sectionCardInner}>
          <Card.Title 
              title="Revenue by School" 
              left={() => <Ionicons name="cash-outline" size={22} color={theme.colors.primary} />}
          />
          <Card.Content>
               {Array.isArray(revenue_by_school) && revenue_by_school.length > 0 ? (
                  <BarChart 
                      data={revenue_by_school} 
                      labelKey="school" 
                      valueKey="total_revenue" 
                      color={theme.colors.primary} 
                  />
               ) : <Text>No revenue data</Text>}
          </Card.Content>
        </Card>
      </Animated.View>

      <Animated.View style={[styles.sectionCard, { opacity: sectionAnims[3], transform: [{ translateY: sectionAnims[3].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Card style={styles.sectionCardInner}>
          <Card.Title 
              title="Most Popular Plans" 
              left={() => <Ionicons name="ribbon-outline" size={22} color={theme.colors.secondary} />}
          />
          <Card.Content>
              {Array.isArray(popular_plans) && popular_plans.length > 0 ? (
                  <BarChart 
                      data={popular_plans} 
                      labelKey="name" 
                      valueKey="count" 
                      color={theme.colors.secondary} 
                  />
              ) : <Text>No plan data</Text>}
          </Card.Content>
        </Card>
      </Animated.View>

      <Animated.View style={[styles.sectionCard, { opacity: sectionAnims[4], transform: [{ translateY: sectionAnims[4].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Card style={styles.sectionCardInner}>
          <Card.Title 
              title="Peak Pickup Days" 
              left={() => <Ionicons name="calendar-outline" size={22} color={theme.colors.error} />}
          />
          <Card.Content>
              {Array.isArray(peak_pickup_days) && peak_pickup_days.length > 0 ? (
                  <BarChart 
                      data={peak_pickup_days} 
                      labelKey="day" 
                      valueKey="count" 
                      color={theme.colors.error} 
                  />
              ) : <Text>No pickup data</Text>}
          </Card.Content>
        </Card>
      </Animated.View>

      <Animated.View style={[styles.header, { marginTop: 10, opacity: sectionAnims[5], transform: [{ translateY: sectionAnims[5].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="document-text-outline" size={26} color={theme.colors.primary} />
            </View>
            <View>
                <Title style={styles.title}>Automation Reports</Title>
                <Paragraph style={styles.subtitle}>Daily, Weekly, Monthly Snapshots</Paragraph>
            </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.sectionCard, { opacity: sectionAnims[6], transform: [{ translateY: sectionAnims[6].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Card style={styles.sectionCardInner}>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title>Period</DataTable.Title>
              <DataTable.Title>Date</DataTable.Title>
              <DataTable.Title>Type</DataTable.Title>
            </DataTable.Header>

            {safeReports.map((report, index) => (
              <DataTable.Row key={report.snapshot_id || `${report.period_type || 'report'}-${index}`}>
                <DataTable.Cell>{report.period_start || '-'}</DataTable.Cell>
                <DataTable.Cell>{report.created_at ? new Date(report.created_at).toLocaleDateString() : '-'}</DataTable.Cell>
                <DataTable.Cell>{report.period_type || '-'}</DataTable.Cell>
              </DataTable.Row>
            ))}
          </DataTable>
        </Card>
      </Animated.View>
      
      <View style={{height: 20}} />
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1200
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
    backgroundColor: '#F8FAFC'
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 10
  },
  header: {
    marginBottom: 16,
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  metricPressable: {
    minWidth: 220,
  },
  metricCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionCardInner: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: 'hidden'
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 24,
    paddingHorizontal: 6,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  bar: {
    width: 22,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 72,
  },
  barValueWrap: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  barValue: {
      fontSize: 11,
      fontWeight: '600',
      color: '#334155',
  },
  tooltip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  tooltipText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600'
  }
});

export default AnalysisScreen;
