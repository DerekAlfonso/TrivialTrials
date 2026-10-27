import type { Config } from '@netlify/functions';
import { supabaseStoreFromEnv } from '../../server/supabaseStore';

/** Hourly: delete games nobody has touched for 12 hours. */
export default async () => {
  const deleted = await supabaseStoreFromEnv().cleanup(12 * 60);
  console.log(`cleanup: deleted ${deleted} idle games`);
};

export const config: Config = {
  schedule: '@hourly',
};
