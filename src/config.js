const storageMode = import.meta.env.VITE_STORAGE_MODE ?? 'local';

export const appConfig = Object.freeze({
  storageMode,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
});

export const isSupabaseConfigured = () =>
  appConfig.storageMode === 'supabase' &&
  Boolean(appConfig.supabaseUrl) &&
  Boolean(appConfig.supabaseAnonKey);
