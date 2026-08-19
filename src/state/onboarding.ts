import { create } from 'zustand';

import {
  getHasOnboarded,
  getStoredRole,
  setOnboarded,
  type OnboardingRole,
} from '@/lib/onboarding-status';

type OnboardingState = {
  hasOnboarded: boolean | null;
  role: OnboardingRole | null;
  loadFromStorage: () => Promise<void>;
  setRole: (role: OnboardingRole) => void;
  complete: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hasOnboarded: null,
  role: null,
  loadFromStorage: async () => {
    try {
      const [hasOnboarded, role] = await Promise.all([getHasOnboarded(), getStoredRole()]);
      set({ hasOnboarded, role });
    } catch {
      set({ hasOnboarded: false });
    }
  },
  setRole: (role) => set({ role }),
  complete: async () => {
    const { role } = get();
    try {
      await setOnboarded(role);
    } catch {
      // Storage write failed — still let the user proceed rather than
      // leaving them stuck on the success screen with no way forward.
    }
    set({ hasOnboarded: true });
  },
}));
