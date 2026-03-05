import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, Platform, ActivityIndicator, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { student } from '../services/api';
import { theme } from '../constants/theme';
import { useSync } from '../context/SyncContext';

export default function BookPickupScreen({ route, navigation }) {
  const { user, mode, emergencyConfig: emergencyFromRoute } = route.params || {};
  const { lastEvent, enqueuePickupAction } = useSync();
  const isEmergency = mode === 'emergency';
  const [date, setDate] = useState(null); // stores { label, value }
  const [time, setTime] = useState(null); // stores { label, value }
  const [clothesCount, setClothesCount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [clothesTouched, setClothesTouched] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [emergencyConfig, setEmergencyConfig] = useState(emergencyFromRoute || null);
  
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [pickupDaysLabel, setPickupDaysLabel] = useState('N/A');
  const [processingTimeline, setProcessingTimeline] = useState('');
  const defaultProcessingTimeline = 'Laundry is ready within 24–48 hours after pickup.';

  // Extra Clothes Payment State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [extraDetails, setExtraDetails] = useState({ count: 0, amount: 0, planUsage: 0 });
  
  // Paystack State
  const [isVerifying, setIsVerifying] = useState(false);
  const [paystackRef, setPaystackRef] = useState(null);

  const planType = subscription?.Plan?.type;
  const pickupLimit = subscription?.Plan?.max_pickups ?? 0;
  const clothLimit = subscription?.Plan?.clothes_limit ?? 0;
  const remainingPickups = subscription?.remaining_pickups ?? 0;
  const remainingClothes = Math.max(subscription?.remaining_clothes ?? 0, 0);
  const pickupsUsed = pickupLimit > 0 ? pickupLimit - remainingPickups : 0;
  const isWeeklyPickupLimitOne = pickupLimit === 1;
  const isMonthlyOrSemester = planType === 'monthly' || planType === 'semester';
  const shouldLockToClothLimit = isWeeklyPickupLimitOne;
  const shouldLockToRemaining = isMonthlyOrSemester && remainingPickups === 1;
  const minClothes = shouldLockToClothLimit ? clothLimit : (shouldLockToRemaining ? remainingClothes : 1);
  const enforcedMin = Math.max(minClothes || 1, 1);
  const shouldEnforceMin = !isEmergency && (shouldLockToClothLimit || shouldLockToRemaining);
  const isPickupLimitReached = !isEmergency && ((pickupLimit > 0 && pickupsUsed >= pickupLimit) || remainingPickups <= 0);
  const emergencyPricingMode = emergencyConfig?.pricing_mode || 'per_item';
  const emergencyPricePerItem = Number(emergencyConfig?.price_per_item || 0);
  const emergencyBaseFee = Number(emergencyConfig?.base_fee || 0);
  const emergencyTotal = useMemo(() => {
    if (!isEmergency) return 0;
    const count = Number.isNaN(parseInt(clothesCount, 10)) ? 0 : parseInt(clothesCount, 10);
    if (emergencyPricingMode === 'flat') return emergencyBaseFee;
    if (emergencyPricingMode === 'hybrid') return emergencyBaseFee + count * emergencyPricePerItem;
    return count * emergencyPricePerItem;
  }, [isEmergency, clothesCount, emergencyPricingMode, emergencyPricePerItem, emergencyBaseFee]);

  const isNetworkError = (error) => {
    const status = error?.response?.status;
    if (status) return false;
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || message.includes('network') || message.includes('timeout') || message.includes('failed to fetch');
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      student.getConfig(),
      student.getSubscription(user.user_id)
    ]).then(([configRes, subRes]) => {
      // Handle Config
      const incomingEmergency = configRes.data?.emergency || null;
      if (incomingEmergency) {
        setEmergencyConfig(incomingEmergency);
      }
      const timelineText = String(configRes.data?.processing_timeline_text || '').trim();
      setProcessingTimeline(timelineText || defaultProcessingTimeline);
      const window = configRes.data.pickup_window;
      if (!isEmergency && window) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const rawDays = Array.isArray(window.pickup_days)
          ? window.pickup_days
          : (Array.isArray(window.days) ? window.days : (window.day ? [window.day] : []));
        const cleanedDays = rawDays.filter(day => days.includes(day));
        const uniqueDays = Array.from(new Set(cleanedDays));
        const targetDays = uniqueDays.length ? uniqueDays : (window.day ? [window.day] : []);
        const targetIndices = targetDays.map(day => days.indexOf(day)).filter(idx => idx >= 0);
        setPickupDaysLabel(targetDays.length ? targetDays.join(', ') : 'N/A');

        const nextDates = [];
        let d = new Date();
        for (let i = 0; i < 60; i++) {
            if (targetIndices.includes(d.getDay())) {
                const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const value = d.toISOString().split('T')[0];
                if (!nextDates.find(entry => entry.value === value)) {
                  nextDates.push({ label, value });
                }
                if (nextDates.length >= 6) break;
            }
            d.setDate(d.getDate() + 1);
        }
        setAvailableDates(nextDates);

        const times = [];
        if (window.blocks) {
             ['morning', 'afternoon', 'evening'].forEach(key => {
                 const block = window.blocks[key];
                 if (block) {
                    times.push({
                        label: `${key.charAt(0).toUpperCase() + key.slice(1)} (${block.start}-${block.end})`,
                        value: `${block.start} - ${block.end}`
                    });
                 }
             });
        }
        setAvailableTimes(times);
      }
      
      // Handle Subscription
      setSubscription(subRes.data);
      setConfigLoading(false);
    }).catch(err => {
        console.error(err);
        setConfigLoading(false);
    });
  }, [user.user_id]);

  useEffect(() => {
    if (!user || !lastEvent || lastEvent.type !== 'settings_updated') return;
    student.getConfig().then((configRes) => {
      const incomingEmergency = configRes.data?.emergency || null;
      if (incomingEmergency) {
        setEmergencyConfig(incomingEmergency);
      }
      const timelineText = String(configRes.data?.processing_timeline_text || '').trim();
      setProcessingTimeline(timelineText || defaultProcessingTimeline);
    }).catch((err) => {
      console.error(err);
    });
  }, [lastEvent, user]);

  useEffect(() => {
    if (!subscription) return;
    if (shouldEnforceMin && !clothesTouched) {
      setClothesCount(String(enforcedMin));
    }
  }, [subscription, shouldEnforceMin, enforcedMin, clothesTouched]);

  const handleClothesChange = (value) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setClothesTouched(true);
    if (sanitized === '') {
      setClothesCount('');
      return;
    }
    const numeric = parseInt(sanitized, 10);
    if (shouldEnforceMin && numeric < enforcedMin) {
      setClothesCount(String(enforcedMin));
      return;
    }
    setClothesCount(String(numeric));
  };

  const adjustClothesCount = (delta) => {
    const lowerBound = shouldEnforceMin ? enforcedMin : 0;
    const currentRaw = parseInt(clothesCount, 10);
    const current = Number.isNaN(currentRaw) ? lowerBound : currentRaw;
    let next = current + delta;
    if (shouldEnforceMin && next < enforcedMin) {
      next = enforcedMin;
    }
    if (!shouldEnforceMin && next < 0) {
      next = 0;
    }
    setClothesTouched(true);
    setClothesCount(String(next));
  };

  const handleBook = () => {
    if (loading) return;

    const count = parseInt(clothesCount);
    if (isNaN(count) || count <= 0) {
      if (Platform.OS === 'web') window.alert('Invalid clothes count');
      else Alert.alert('Error', 'Invalid clothes count');
      return;
    }

    if (isEmergency) {
      if (configLoading || !emergencyConfig) {
        if (Platform.OS === 'web') window.alert('Loading emergency settings. Please try again.');
        else Alert.alert('Emergency Laundry', 'Loading emergency settings. Please try again.');
        return;
      }
      if (!emergencyConfig?.enabled) {
        if (Platform.OS === 'web') window.alert('Emergency laundry is not available right now.');
        else Alert.alert('Emergency Laundry', 'Emergency laundry is not available right now.');
        return;
      }
      if (emergencyConfig?.available === false) {
        if (Platform.OS === 'web') window.alert('Emergency laundry is temporarily unavailable.');
        else Alert.alert('Emergency Laundry', 'Emergency laundry is temporarily unavailable.');
        return;
      }
      if (!pickupAddress.trim()) {
        if (Platform.OS === 'web') window.alert('Pickup address is required');
        else Alert.alert('Error', 'Pickup address is required');
        return;
      }
      submitEmergency();
      return;
    }

    if (!date || !time) {
      if (Platform.OS === 'web') window.alert('Please select date and time');
      else Alert.alert('Error', 'Please select date and time');
      return;
    }
    if (availableDates.length && !availableDates.find(d => d.value === date.value)) {
      const msg = 'Pickup is only available on configured pickup days.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (!subscription) {
      Alert.alert('Error', 'No active subscription found');
      return;
    }
    if (isPickupLimitReached) {
      const msg = 'Pickup limit reached';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    let planUsage = 0;
    let extra = 0;

    const requiredMin = shouldEnforceMin ? enforcedMin : 1;
    if (isNaN(count) || count < requiredMin) {
      const msg = `Minimum clothes count is ${requiredMin}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    const baseRemaining = shouldLockToClothLimit ? clothLimit : remainingClothes;
    const allowedRemaining = Math.max(baseRemaining, 0);
    if (count <= allowedRemaining) {
      planUsage = count;
      extra = 0;
    } else {
      planUsage = allowedRemaining;
      extra = count - allowedRemaining;
    }

    if (extra > 0) {
        // 400 is fallback price if not in settings (should ideally come from backend config)
        // Ideally we pass extra to backend and let it calculate, but for UI we need to show it.
        // Assuming 400 per item for now as seen in student.js fallback
        const pricePerItem = 400; 
        setExtraDetails({
            count: extra,
            amount: extra * pricePerItem,
            planUsage
        });
        setShowPaymentModal(true);
    } else {
        submitOrder(null, null);
    }
  };

  const submitEmergency = async () => {
    setLoading(true);
    try {
      const count = parseInt(clothesCount, 10);
      const res = await student.bookEmergency({
        user_id: user.user_id,
        clothes_count: count,
        pickup_address: pickupAddress.trim(),
        delivery_address: deliveryAddress.trim() || pickupAddress.trim(),
        description: notes
      });
      const order = res.data?.order;
      const total = res.data?.pricing?.total ?? emergencyTotal;
      const emergencyPlan = {
        name: 'Emergency Laundry',
        price: total,
        duration_days: 0,
        payment_methods: ['cash', 'paystack'],
        type: 'emergency',
        delivery_window_text: emergencyConfig?.delivery_window_text
      };
      navigation.navigate('PlanPayment', {
        user,
        plan: emergencyPlan,
        order,
        order_type: 'emergency',
        payment_context: 'emergency_laundry',
        emergency: {
          clothes_count: count,
          pricing: res.data?.pricing || null
        }
      });
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueuePickupAction({
          type: 'emergency',
          payload: {
            user_id: user.user_id,
            clothes_count: parseInt(clothesCount, 10),
            pickup_address: pickupAddress.trim(),
            delivery_address: deliveryAddress.trim() || pickupAddress.trim(),
            description: notes
          }
        });
        const msg = 'Emergency request queued. It will be submitted when you are back online.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Queued', msg);
        return;
      }
      const errMsg = error.response?.data?.error || error.message;
      if (Platform.OS === 'web') window.alert(errMsg);
      else Alert.alert('Emergency Request Failed', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const submitOrder = async (method, reference) => {
    if (method && method !== 'paystack' && method !== 'cash') {
      const msg = 'Bank transfer is no longer available for pickup payments.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Payment Method Unavailable', msg);
      return;
    }
    setLoading(true);
    setShowPaymentModal(false);
    try {
        const count = parseInt(clothesCount);
        const res = await student.bookPickup({
          user_id: user.user_id,
          pickup_date: date.value,
          pickup_time: time.value,
          clothes_count: count,
          notes,
          payment_method: method,
          payment_reference: reference
        });
        
        const { code } = res.data;
        const successMsg = `Booking confirmed! Your Pickup Code is ${code?.code_value || 'PENDING'}`;
        
        if (Platform.OS === 'web') {
          window.alert(successMsg);
          navigation.goBack();
        } else {
          Alert.alert('Success', successMsg, [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        }
    } catch (error) {
        if (isNetworkError(error)) {
          await enqueuePickupAction({
            type: 'book',
            payload: {
              user_id: user.user_id,
              pickup_date: date.value,
              pickup_time: time.value,
              clothes_count: parseInt(clothesCount),
              notes,
              payment_method: method,
              payment_reference: reference
            }
          });
          const msg = 'Pickup request queued. It will be submitted when you are back online.';
          if (Platform.OS === 'web') {
            window.alert(msg);
            navigation.goBack();
          } else {
            Alert.alert('Queued', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
          }
          return;
        }
        const errMsg = error.response?.data?.error || error.message;
        const friendly = errMsg && errMsg.toLowerCase().includes('pickup only available')
          ? 'Pickup is only available on configured pickup days.'
          : errMsg;
        if (Platform.OS === 'web') window.alert(friendly);
        else Alert.alert('Booking Failed', friendly);
    } finally {
        setLoading(false);
    }
  };

  const handlePayment = async (method) => {
    setPaymentMethod(method);
    if (method === 'paystack') {
        if (!user.email) {
            if (Platform.OS === 'web') window.alert('Email required for Paystack');
            else Alert.alert('Error', 'Email required for Paystack payment.');
            return;
        }

        try {
            setLoading(true);
            
            let callbackUrl = 'https://standard-callback.com'; // Default fallback
            if (Platform.OS === 'web') {
                callbackUrl = window.location.href; // Return to current page
            }
            
            const res = await student.initializePayment({
                email: user.email,
                amount: extraDetails.amount, 
                callback_url: callbackUrl,
                metadata: {
                    user_id: user.user_id,
                    custom_fields: [
                        { display_name: "Payment For", variable_name: "payment_for", value: "Extra Clothes" }
                    ]
                }
            });
            
            const { authorization_url, reference } = res.data;
            setPaystackRef(reference);
            setLoading(false);
            
            if (Platform.OS === 'web') {
                window.open(authorization_url, '_blank');
                setIsVerifying(true);
            } else {
                const supported = await Linking.canOpenURL(authorization_url);
                if (supported) {
                    await Linking.openURL(authorization_url);
                    setIsVerifying(true);
                } else {
                     Alert.alert('Error', 'Cannot open payment link');
                }
            }
        } catch (error) {
            setLoading(false);
            const msg = error.response?.data?.error || error.message;
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Payment Error', msg);
        }
    } else if (method === 'cash') {
        submitOrder(method, null);
    } else {
        const msg = 'Bank transfer is no longer available for pickup payments.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Payment Method Unavailable', msg);
    }
  };

  const lowerBound = shouldEnforceMin ? enforcedMin : 0;
  const parsedCount = parseInt(clothesCount, 10);
  const safeCount = Number.isNaN(parsedCount) ? 0 : parsedCount;
  const isDecrementDisabled = safeCount <= lowerBound;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{isEmergency ? 'Emergency Laundry' : 'Book Pickup'}</Text>
        <Text style={styles.sub}>{isEmergency ? 'Same-day delivery within hours' : 'Schedule a laundry pickup'}</Text>
      </View>

      {configLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={theme.colors.secondary} style={{ marginBottom: 12 }} />
          <Text style={styles.loadingText}>{isEmergency ? 'Preparing emergency request' : 'Loading available pickup slots'}</Text>
        </View>
      ) : (
        <>
          {!isEmergency && (
            <>
              {!!processingTimeline && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} />
                      <Text style={styles.sectionLabel}>Laundry Processing Timeline</Text>
                    </View>
                    <Text style={styles.sectionMeta}>After pickup</Text>
                  </View>
                  <Text style={styles.timelineText}>{processingTimeline}</Text>
                </View>
              )}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.sectionLabel}>Pickup Date</Text>
                  </View>
                  <Text style={styles.sectionMeta}>Global: {pickupDaysLabel}</Text>
                </View>
                <View style={styles.chipsWrap}>
                  {availableDates.map((d) => (
                    <TouchableOpacity key={d.value} style={[styles.chip, date?.value===d.value && styles.chipActive]} onPress={() => setDate(d)} activeOpacity={0.85}>
                      <Text style={[styles.chipText, date?.value===d.value && styles.chipTextActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.sectionLabel}>Pickup Time</Text>
                  </View>
                  <Text style={styles.sectionMeta}>Choose a slot</Text>
                </View>
                <View style={styles.grid}>
                  {availableTimes.map((t) => (
                    <TouchableOpacity key={t.value} style={[styles.cell, time?.value===t.value && styles.cellActive]} onPress={() => setTime(t)} activeOpacity={0.85}>
                      <Text style={[styles.cellText, time?.value===t.value && styles.cellTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </>
      )}

      {isEmergency && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flash-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.sectionLabel}>Emergency Details</Text>
            </View>
            <Text style={styles.sectionMeta}>{emergencyConfig?.delivery_window_text || 'Delivered within 2–8 hours (same day)'}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Pickup Address</Text>
            <TextInput
              style={styles.input}
              value={pickupAddress}
              onChangeText={setPickupAddress}
              placeholder="Enter pickup address"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Delivery Address</Text>
            <TextInput
              style={styles.input}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="Enter delivery address (optional)"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
        </View>
      )}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="shirt-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.sectionLabel}>Number of Clothes</Text>
          </View>
          <Text style={styles.sectionMeta}>Set your item count</Text>
        </View>
        {subscription && !isEmergency && (
          <Text style={styles.helperText}>
            You have <Text style={styles.helperEmphasis}>{remainingClothes}</Text> clothes and <Text style={styles.helperEmphasis}>{remainingPickups}</Text> pickups remaining.
          </Text>
        )}
        {shouldEnforceMin && (
          <Text style={styles.helperText}>
            Minimum clothes count is <Text style={styles.helperEmphasis}>{enforcedMin}</Text>.
          </Text>
        )}
        {isPickupLimitReached && (
          <Text style={styles.limitText}>Pickup limit reached</Text>
        )}
        <View style={styles.quantityRow}>
          <TouchableOpacity
            style={[styles.quantityBtn, isDecrementDisabled && styles.quantityBtnDisabled]}
            onPress={() => adjustClothesCount(-1)}
            disabled={isDecrementDisabled}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={18} color={isDecrementDisabled ? theme.colors.textTertiary : theme.colors.secondary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, styles.quantityInput]}
            placeholder="e.g., 10"
            value={clothesCount}
            onChangeText={handleClothesChange}
            keyboardType="numeric"
            placeholderTextColor={theme.colors.textTertiary}
          />
          <TouchableOpacity
            style={styles.quantityBtn}
            onPress={() => adjustClothesCount(1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color={theme.colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>{isEmergency ? 'Estimated Total' : 'Total Items'}</Text>
          <Text style={styles.totalValue}>{isEmergency ? `₦${emergencyTotal}` : safeCount}</Text>
        </View>
        <TouchableOpacity style={[styles.btn, (loading || isPickupLimitReached) && styles.btnDisabled]} onPress={handleBook} disabled={loading || isPickupLimitReached} activeOpacity={0.9}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnContent}>
              <Text style={styles.btnText}>{isEmergency ? 'Request Emergency' : 'Book Pickup'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {!isEmergency && (
        <Modal visible={showPaymentModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{isVerifying ? 'Confirm Payment' : 'Extra Clothes Payment'}</Text>
                
                {isVerifying ? (
                    <View style={{ alignItems: 'center' }}>
                         <Text style={styles.modalDesc}>Please complete the payment in your browser.</Text>
                         <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#0EA5A8', width: '100%'}]} onPress={() => submitOrder('paystack', paystackRef)}>
                            <Text style={styles.payBtnText}>I Have Paid</Text>
                         </TouchableOpacity>
                         <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                            setIsVerifying(false);
                            setPaystackRef(null);
                         }}>
                            <Text style={styles.cancelText}>Cancel</Text>
                         </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <Text style={styles.modalDesc}>You have exceeded your plan limit.</Text>
                        
                        <View style={styles.breakdown}>
                            <View style={styles.row}><Text>Plan Usage:</Text><Text>{extraDetails.planUsage} items</Text></View>
                            <View style={styles.row}><Text>Extra Clothes:</Text><Text>{extraDetails.count} items</Text></View>
                            <View style={[styles.row, styles.totalRow]}><Text style={styles.modalTotalLabel}>Amount to Pay:</Text><Text style={styles.modalTotalValue}>N{extraDetails.amount}</Text></View>
                        </View>

                        <Text style={styles.methodLabel}>Select Payment Method:</Text>
                        
                        {loading ? (
                            <ActivityIndicator size="large" color="#0EA5A8" style={{ marginVertical: 20 }} />
                        ) : (
                            <>
                                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#0EA5A8'}]} onPress={() => handlePayment('paystack')}>
                                    <Text style={styles.payBtnText}>Pay with Paystack</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#D97706'}]} onPress={() => handlePayment('cash')}>
                                    <Text style={styles.payBtnText}>Pay Cash on Pickup</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        
                        {!loading && (
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPaymentModal(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>
        </View>
      </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 16, paddingTop: 18 },
  header: { marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  sub: { color: theme.colors.textSecondary, marginTop: 4, marginBottom: 6 },
  loadingCard: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4 },
  loadingText: { color: theme.colors.textSecondary, fontSize: 13 },
  sectionCard: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  sectionMeta: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  helperText: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  helperEmphasis: { fontWeight: '700', color: theme.colors.secondary },
  limitText: { fontSize: 13, color: theme.colors.error, marginBottom: 6, fontWeight: '600' },
  timelineText: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.colors.primaryLight, borderRadius: 14, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark },
  chipText: { color: theme.colors.primaryDark, fontWeight: '600' },
  chipTextActive: { color: theme.colors.surface, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48%', paddingVertical: 12, backgroundColor: theme.colors.background, borderRadius: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  cellActive: { backgroundColor: theme.colors.secondaryLight, borderColor: theme.colors.secondary },
  cellText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 12 },
  cellTextActive: { color: theme.colors.secondaryDark, fontWeight: '700' },
  fieldGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6 },
  input: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 12, color: theme.colors.text },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  quantityInput: { flex: 1, textAlign: 'center', fontWeight: '700' },
  quantityBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.secondaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(13,148,136,0.25)' },
  quantityBtnDisabled: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
  footer: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4 },
  totalLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  totalValue: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  btn: { backgroundColor: theme.colors.secondary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  btnDisabled: { opacity: 0.6 },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: theme.colors.surface, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center', color: theme.colors.text },
  modalDesc: { textAlign: 'center', color: theme.colors.textSecondary, marginBottom: 18 },
  breakdown: { backgroundColor: theme.colors.background, padding: 16, borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8, marginTop: 4 },
  modalTotalLabel: { fontWeight: '700', color: theme.colors.text },
  modalTotalValue: { fontWeight: '800', color: theme.colors.secondary },
  methodLabel: { fontWeight: '700', marginBottom: 12, color: theme.colors.text },
  payBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  payBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { alignItems: 'center', marginTop: 10 },
  cancelText: { color: theme.colors.error, fontWeight: '600' }
});
