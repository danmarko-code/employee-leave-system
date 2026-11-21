import { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import type { DatePreset } from '@/lib/datePicker';
import { colors, fonts, radius, space, fontSize } from '@/theme/tokens';

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialDate: string | null;
  onDateSelect: (dateString: string) => void;
  presets: DatePreset[];
  mode: 'start' | 'end' | null;
}

export default function DatePickerModal({ 
  visible, 
  onClose, 
  initialDate, 
  onDateSelect, 
  presets = [],
  mode
}: DatePickerModalProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate ? new Date(initialDate) : null);
  const [selectedDateString, setSelectedDateString] = useState('');

  useEffect(() => {
    if (visible && initialDate) {
      setSelectedDate(new Date(initialDate));
      setSelectedDateString(initialDate);
    }
  }, [visible, initialDate]);

  if (!visible) return null;

  const handlePresetSelect = (preset: DatePreset) => {
    setSelectedDate(new Date(preset.date));
    setSelectedDateString(preset.date);
    onDateSelect(preset.date);
    setShowPicker(false);
  };

  const handlePickerChange = (_event: unknown, newDate: Date | undefined) => {
    if (newDate) {
      setSelectedDate(newDate);
      setSelectedDateString(format(newDate, 'yyyy-MM-dd'));
    }
  };

  const handleConfirm = () => {
    if (selectedDate) {
      onDateSelect(selectedDateString);
      setShowPicker(false);
    }
  };

  return (
    <View style={styles.backdrop} accessibilityRole="dialog" accessibilityLabel="Date picker">
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Select {mode === 'start' ? 'Start' : 'End'} Date
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Close">
            <Ionicons name="close-outline" size={24} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Quick presets */}
        {presets.length > 0 && (
          <View style={styles.presets}>
            {presets.map((preset, index) => (
              <TouchableOpacity
                key={index}
                style={styles.preset}
                onPress={() => handlePresetSelect(preset)}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
              >
                <Text style={styles.presetText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Native date picker */}
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={selectedDate ?? new Date()}
            mode="date"
            display="default"
            onChange={handlePickerChange}
            testID="date-picker"
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !selectedDate && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selectedDate}
            accessibilityRole="button"
          >
            <Text style={styles.confirmBtnText}>{selectedDate ? 'Confirm' : 'Select Date'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.36)',
    justifyContent: 'center',
    padding: space.xl,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize.heading,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  close: {
    padding: space.xs,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  preset: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  presetText: {
    fontSize: fontSize.small,
    fontFamily: fonts.medium,
    color: colors.brandInk,
  },
  pickerWrapper: {
    minHeight: 200,
    maxHeight: 300,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  cancelBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  confirmBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.border,
  },
  confirmBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.semibold,
    color: colors.onDark,
  },
});