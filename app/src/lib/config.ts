import { Platform } from 'react-native';

/**
 * The API origin. On a physical device `localhost` is the phone, not your
 * machine, so set EXPO_PUBLIC_API_URL to your computer's LAN address.
 */
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/+$/, '');

export const isWeb = Platform.OS === 'web';
