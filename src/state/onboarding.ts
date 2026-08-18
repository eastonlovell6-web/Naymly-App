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
    const [hasOnboarded, role] = await Promise.all([getHasOnboarded(), getStoredRole()]);
    set({ hasOnboarded, role });
  },
  setRole: (role) => set({ role }),
  complete: async () => {
    const { role } = get();
    await setOnboarded(role);
    set({ hasOnboarded: true });
  },
}));
