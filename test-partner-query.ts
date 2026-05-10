import { getAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/request-client';

async function test() {
  const adminDb = getAdminClient();
  // We need to bypass the React cache for testing, so we import createClient directly:
  const { createClient } = require('@/lib/supabase/server');
  const userDb = await createClient();

  const targetId = process.argv[2]; // pass ID as arg

  if (!targetId) {
      const { data: partners } = await adminDb.from('partners').select('id').limit(1);
      if (partners && partners.length > 0) {
          console.log("Found a partner to test with:", partners[0].id);
          testId(partners[0].id, userDb);
      }
  } else {
      testId(targetId, userDb);
  }
}

async function testId(targetId: string, userDb: any) {
  const { data, error } = await userDb.from('partners').select('id').eq('id', targetId).single();
  console.log("User DB Result:", data, error);
}

test();
