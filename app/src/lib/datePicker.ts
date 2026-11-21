import { useState, useCallback } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import type { LeaveTypeDto } from '@leave/shared';

export interface DatePreset {
  label: string;
  date: string; // yyyy-MM-dd
}

export interface DatePickerHookResult {
  visible: boolean;
  mode: 'start' | 'end' | null;
  presets: DatePreset[];
  openPicker: (mode: 'start' | 'end') => void;
  closePicker: () => void;
  selectDate: (dateString: string) => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
}

export function useDatePicker(
  selectedType: LeaveTypeDto | null,
  startDate: string,
  endDate: string,
  onDateSelect: (date: string, mode: 'start' | 'end') => void
): DatePickerHookResult {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'start' | 'end' | null>(null);
  const [presets, setPresets] = useState<DatePreset[]>([]);

  const buildPresets = useCallback((pickerMode: 'start' | 'end'): DatePreset[] => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');
    
    const options: DatePreset[] = [
      { label: 'Today', date: todayStr },
      { label: 'Tomorrow', date: tomorrowStr },
    ];

    if (selectedType) {
      const entitlement = selectedType.yearlyEntitlement;
      
      // Next working day
      let nextWorkingDay = addDays(today, 1);
      while (nextWorkingDay.getDay() === 0 || nextWorkingDay.getDay() === 6) {
        nextWorkingDay = addDays(nextWorkingDay, 1);
      }
      options.push({ label: 'Next Working Day', date: format(nextWorkingDay, 'yyyy-MM-dd') });

      // This week (Monday to Friday)
      const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
      const thisFriday = addDays(thisMonday, 4);
      options.push({ label: 'This Week (Mon-Fri)', date: `${format(thisMonday, 'yyyy-MM-dd')} - ${format(thisFriday, 'yyyy-MM-dd')}` });

      // Next week
      const nextMonday = addDays(thisMonday, 7);
      const nextFriday = addDays(nextMonday, 4);
      options.push({ label: 'Next Week (Mon-Fri)', date: `${format(nextMonday, 'yyyy-MM-dd')} - ${format(nextFriday, 'yyyy-MM-dd')}` });

      if (entitlement >= 5) {
        const fiveDaysFromToday = addDays(today, 5);
        options.push({ label: `5 Days from Today`, date: `${todayStr} - ${format(fiveDaysFromToday, 'yyyy-MM-dd')}` });
      }
      if (entitlement >= 10) {
        const tenDaysFromToday = addDays(today, 10);
        options.push({ label: `10 Days from Today`, date: `${todayStr} - ${format(tenDaysFromToday, 'yyyy-MM-dd')}` });
      }
    }

    const isValidPreset = (date: string): boolean => {
      if (pickerMode === 'start') {
        const presetDate = new Date(date);
        const todayDate = new Date();
        return presetDate >= todayDate;
      }
      if (pickerMode === 'end' && startDate) {
        const presetDate = new Date(date);
        const startDateObj = new Date(startDate);
        return presetDate >= startDateObj;
      }
      return true;
    };

    return options.filter(opt => isValidPreset(opt.date.split(' - ')[0] ?? ''));
  }, [selectedType, startDate]);

  const openPicker = useCallback((pickerMode: 'start' | 'end') => {
    setMode(pickerMode);
    setPresets(buildPresets(pickerMode));
    setVisible(true);
  }, [buildPresets]);

  const closePicker = useCallback(() => {
    setVisible(false);
    setMode(null);
    setPresets([]);
  }, []);

  const selectDate = useCallback((dateString: string) => {
    if (mode) {
      onDateSelect(dateString, mode);
    }
    closePicker();
  }, [mode, onDateSelect, closePicker]);

  return { visible, mode, presets, openPicker, closePicker, selectDate };
}
