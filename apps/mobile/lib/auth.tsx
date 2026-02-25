/**
 * @file auth.tsx
 * Authentication context and provider for the PullUp mobile app.
 *
 * Wraps Supabase Auth and exposes the current session, user profile,
 * role, and auth actions (sign-in, sign-up, sign-out) to the React tree.
 *
 * The profile is fetched from the `users` table (not a separate `profiles`
 * table) and typed against the shared `User` interface so the mobile layer
 * stays in sync with the database schema.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { User, UserRole } from "@pullup/shared";

/**
 * Backward-compatible alias for the shared `User` type.
 *
 * Existing screens that import `UserProfile` from this module will
 * continue to work without changes.
 */
export type UserProfile = User;

/** Values exposed by the AuthContext to consumers. */
interface AuthContextValue {
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** Raw Supabase Auth user object. */
  user: SupabaseUser | null;
  /** Row from the `users` table for the signed-in user, or null. */
  profile: UserProfile | null;
  /** Shortcut for `profile.role`, or null when no profile is loaded. */
  role: UserRole | null;
  /** True while the initial session is being restored on app launch. */
  isLoading: boolean;
  /** Sign in with email + password. Returns an error message on failure. */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Create a new account with the given details. */
  signUp: (params: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    referralCode?: string;
  }) => Promise<{ error: string | null }>;
  /** Sign out and clear all local auth state. */
  signOut: () => Promise<void>;
  /** Force a re-fetch of the `users` row for the current session. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provides authentication state to the React tree.
 *
 * Wrap your root component with `<AuthProvider>` so that any descendant
 * can call `useAuth()`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Fetch the user's row from the `users` table and store it in state.
   */
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error loading profile:", error.message);
        return;
      }
      setProfile(data as UserProfile);
    } catch (err) {
      console.error("Failed to load profile:", err);
    }
  }, []);

  /** Bootstrap the session on mount and subscribe to auth state changes. */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  /** Sign in with email and password. */
  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  /** Create a new user account. */
  const signUp = async (params: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    referralCode?: string;
  }): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          full_name: params.fullName,
          role: params.role,
          referral_code: params.referralCode || null,
        },
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  /** Sign out and clear the local profile. */
  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  /** Re-fetch the profile from the database. */
  const refreshProfile = async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role: profile?.role ?? null,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth state from any component inside `<AuthProvider>`.
 *
 * @throws Error if called outside of an `AuthProvider`.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Assert that the current user has the expected role.
 *
 * Useful as a guard at the top of role-specific screens or API calls.
 *
 * @param currentRole - The user's actual role (from `useAuth().role`).
 * @param expectedRole - The role that is required.
 * @throws Error if the roles do not match or `currentRole` is null.
 *
 * @example
 * ```ts
 * const { role } = useAuth();
 * requireRole(role, "driver");
 * // safe to proceed with driver-only logic
 * ```
 */
export function requireRole(
  currentRole: UserRole | null,
  expectedRole: UserRole
): asserts currentRole is UserRole {
  if (!currentRole) {
    throw new Error("User is not authenticated or profile has not loaded");
  }
  if (currentRole !== expectedRole) {
    throw new Error(
      `Access denied: expected role "${expectedRole}" but got "${currentRole}"`
    );
  }
}
