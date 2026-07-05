'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import {
  fetchRemoteCompanionProfile,
  loadLocalCompanionProfileOnly,
  saveRemoteCompanionProfile,
} from '@/lib/astra/profile-remote';
import {
  normalizeCompanionProfile,
  saveCompanionProfile,
  type CompanionProfile,
  type CompanionProfileField,
  type InteractionPreferenceArrayField,
  type InteractionPreferenceTextField,
} from '@/lib/client/companion-profile';

const SAVE_DEBOUNCE_MS = 400;

interface UseCompanionProfileResult {
  profile: CompanionProfile;
  updateField: (field: CompanionProfileField, value: string) => void;
  updateInteractionPreference: (field: InteractionPreferenceTextField, value: string) => void;
  toggleInteractionPreference: (field: InteractionPreferenceArrayField, value: string) => void;
}

export function useCompanionProfile(): UseCompanionProfileResult {
  const remoteEnabled = isRemotePersistenceEnabled();
  const [profile, setProfile] = useState<CompanionProfile>(() =>
    typeof window !== 'undefined' ? loadLocalCompanionProfileOnly() : {},
  );
  const saveTimerRef = useRef<number | null>(null);
  const profileRef = useRef<CompanionProfile>(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!remoteEnabled) return;

    void fetchRemoteCompanionProfile()
      .then((remoteProfile) => {
        setProfile(remoteProfile);
        profileRef.current = remoteProfile;
      })
      .catch(() => {
        // keep local fallback
      });
  }, [remoteEnabled]);

  const persistProfile = useCallback(
    async (nextProfile: CompanionProfile) => {
      if (remoteEnabled) {
        await saveRemoteCompanionProfile(nextProfile);
        return;
      }
      saveCompanionProfile(nextProfile);
    },
    [remoteEnabled],
  );

  const scheduleSave = useCallback(
    (nextProfile: CompanionProfile) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        void persistProfile(nextProfile);
        saveTimerRef.current = null;
      }, SAVE_DEBOUNCE_MS);
    },
    [persistProfile],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        void persistProfile(profileRef.current);
      }
    },
    [persistProfile],
  );

  const updateField = useCallback(
    (field: CompanionProfileField, value: string) => {
      setProfile((current) => {
        const next = normalizeCompanionProfile({ ...current, [field]: value });
        profileRef.current = next;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const updateInteractionPreference = useCallback(
    (field: InteractionPreferenceTextField, value: string) => {
      setProfile((current) => {
        const next = normalizeCompanionProfile({
          ...current,
          interactionPreferences: {
            ...current.interactionPreferences,
            [field]: value,
          },
        });
        profileRef.current = next;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const toggleInteractionPreference = useCallback(
    (field: InteractionPreferenceArrayField, value: string) => {
      setProfile((current) => {
        const currentValues = current.interactionPreferences?.[field] ?? [];
        const nextValues = currentValues.includes(value)
          ? currentValues.filter((entry) => entry !== value)
          : [...currentValues, value];

        const next = normalizeCompanionProfile({
          ...current,
          interactionPreferences: {
            ...current.interactionPreferences,
            [field]: nextValues,
          },
        });
        profileRef.current = next;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  return { profile, updateField, updateInteractionPreference, toggleInteractionPreference };
}
