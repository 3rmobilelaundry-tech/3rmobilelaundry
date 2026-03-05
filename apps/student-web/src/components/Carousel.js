import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet, Linking, Platform, useWindowDimensions } from 'react-native';
import { theme } from '../constants/theme';
import { API_URL } from '../services/api';

const Carousel = ({ data }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef(null);
  const { width } = useWindowDimensions();
  const itemWidth = useMemo(() => width * 0.85, [width]);
  const itemHeight = useMemo(() => itemWidth * 0.66, [itemWidth]);
  const sidePadding = useMemo(() => Math.max(0, (width - itemWidth) / 2), [width, itemWidth]);

  // Auto-scroll logic
  useEffect(() => {
    if (data && data.length > 1) {
      const interval = setInterval(() => {
        setActiveIndex(prevIndex => {
            let nextIndex = prevIndex + 1;
            if (nextIndex >= data.length) nextIndex = 0;
            
            flatListRef.current?.scrollToIndex({
                index: nextIndex,
                animated: true
            });
            return nextIndex;
        });
      }, 5000); // 5 seconds
      return () => clearInterval(interval);
    }
  }, [data]);

  const handlePress = useCallback((link) => {
    if (link) {
        Linking.openURL(link).catch(err => console.error("Couldn't load page", err));
    }
  }, []);

  const renderItem = useCallback(({ item }) => {
    const uri = item.image_url.startsWith('http') 
      ? item.image_url 
      : (API_URL || '') + item.image_url;

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => handlePress(item.link)} style={[styles.cardContainer, { width: itemWidth, height: itemHeight }]}>
         <Image 
            source={{ uri }} 
            style={styles.image} 
            resizeMode="cover" 
          />
         {(item.title || item.description) && (
           <View style={styles.textOverlay}>
             {item.title && <Text style={styles.title}>{item.title}</Text>}
             {item.description && <Text style={styles.description}>{item.description}</Text>}
           </View>
         )}
      </TouchableOpacity>
    );
  }, [handlePress, itemWidth, itemHeight]);

  const getItemLayout = useCallback((_, index) => ({
    length: itemWidth,
    offset: itemWidth * index,
    index,
  }), [itemWidth]);

  const onMomentumScrollEnd = useCallback((event) => {
     const index = Math.round(event.nativeEvent.contentOffset.x / itemWidth);
     setActiveIndex(index);
  }, [itemWidth]);

  const keyExtractor = useCallback((item) => item.id ? item.id.toString() : Math.random().toString(), []);

  if (!data || !Array.isArray(data) || data.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={getItemLayout}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={itemWidth}
        snapToAlignment="center"
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
      />
      {/* Dots Indicator */}
      {data.length > 1 && (
        <View style={styles.pagination}>
          {data.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex ? styles.activeDot : null]} />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.m,
  },
  cardContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    marginRight: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: theme.spacing.s,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  description: {
    color: '#eee',
    fontSize: 12,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: theme.colors.primary,
  },
});

export default Carousel;
