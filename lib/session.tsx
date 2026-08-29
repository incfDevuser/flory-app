import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { signOutFromGoogle } from '@/lib/google-auth';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/** Lo que el cliente puede leer de su propia fila (política "own profile read"). */
export type Profile = {
  onboarded_at: string | null;
  display_name: string | null;
  email: string | null;
  plan: 'free' | 'founding' | 'plus' | 'pro';
  founding_user: boolean | null;
};

type SessionValue = {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  /** `profiles.onboarded_at`. `null` = el onboarding sigue pendiente. */
  onboardedAt: string | null;
  /** True hasta saber a la vez si hay sesión y si el onboarding está hecho. */
  isLoading: boolean;
  /** Refresca el gate después de que el RPC transaccional completa el onboarding. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsRestoringSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsRestoringSession(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  // `profiles` solo deja leer la fila propia (política "own profile read", tables.sql:1022).
  // La fila la crea el trigger `handle_new_user` dentro de la misma transacción que
  // inserta en auth.users, así que para cuando hay sesión ya existe.
  const profile = useQuery({
    queryKey: queryKeys.profile(userId ?? 'anon'),
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarded_at, display_name, email, plan, founding_user')
        .eq('id', userId!)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
  });

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
  }, [queryClient, userId]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Supabase y Google mantienen sesiones distintas. La de Google se limpia para que
    // el próximo acceso permita elegir otra cuenta; un fallo aquí no reabre Supabase.
    await signOutFromGoogle().catch(() => undefined);
    queryClient.clear();
  }, [queryClient]);

  const value: SessionValue = {
    session,
    userId,
    profile: profile.data ?? null,
    onboardedAt: profile.data?.onboarded_at ?? null,
    // Sin sesión no hay perfil que esperar: el gate ya puede decidir.
    isLoading: isRestoringSession || (userId !== null && profile.isPending),
    refreshProfile,
    signOut,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  }
  return value;
}
