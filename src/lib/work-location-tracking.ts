import { Capacitor, registerPlugin } from '@capacitor/core';
import { API_BASE } from './api';

type WorkLocationTrackingPlugin = {
  startTracking(options: {
    token: string;
    apiBaseUrl: string;
    attendanceId: string;
    scheduledEndAt: string;
  }): Promise<{ started: boolean }>;
  stopTracking(): Promise<{ stopped: boolean }>;
};

const nativeTracking = registerPlugin<WorkLocationTrackingPlugin>('WorkLocationTracking');

/** Starts the visible Android location foreground service for an authorised active shift. */
export async function startWorkLocationTracking(options: {
  token: string;
  attendanceId: string;
  scheduledEndAt: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!options.token || !options.attendanceId || !API_BASE.startsWith('https://')) {
    throw new Error('A valid signed-in session and active shift are required to start background GPS.');
  }
  const result = await nativeTracking.startTracking({
    ...options,
    apiBaseUrl: API_BASE,
  });
  if (!result?.started) throw new Error('Android did not confirm that the background GPS service started.');
}

/** Stops native location collection after the server confirms shift checkout. */
export async function stopWorkLocationTracking(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const result = await nativeTracking.stopTracking();
  if (!result?.stopped) throw new Error('Android did not confirm that the background GPS service stopped.');
}
