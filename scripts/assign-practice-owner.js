const { createClient } = require('@supabase/supabase-js');

const PRACTICE_QUERY = '%tzn bergheim%';
const OWNER_EMAIL = 'info@tierarztpraxis-horrem.de';
const DOMAIN = 'tierarztpraxis-horrem.de';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function listAllUsers() {
  const all = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    all.push(...users);

    if (users.length < perPage) break;
    page += 1;
  }

  return all;
}

async function run() {
  const practiceRes = await supabase
    .from('practices')
    .select('id, name, slug, features')
    .ilike('name', PRACTICE_QUERY)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (practiceRes.error || !practiceRes.data) {
    throw new Error(`Practice not found: ${practiceRes.error?.message || 'no result'}`);
  }

  const practice = practiceRes.data;
  const users = await listAllUsers();

  const ownerUser = users.find((u) => (u.email || '').toLowerCase() === OWNER_EMAIL);
  if (!ownerUser) {
    throw new Error(`Owner user not found: ${OWNER_EMAIL}`);
  }

  const lennartUser = users.find((u) => {
    const email = String(u.email || '').toLowerCase();
    const fullName = String(u.user_metadata?.full_name || u.user_metadata?.name || '').toLowerCase();
    return fullName.includes('lennart reimann') || email.includes('lennart');
  });

  const features = practice.features && typeof practice.features === 'object' ? { ...practice.features } : {};
  features.hr_module = true;

  const updatePracticeRes = await supabase.from('practices').update({ features }).eq('id', practice.id);
  if (updatePracticeRes.error) throw updatePracticeRes.error;

  const assignments = [{ practice_id: practice.id, user_id: ownerUser.id, role: 'owner' }];

  if (lennartUser && lennartUser.id !== ownerUser.id) {
    assignments.push({ practice_id: practice.id, user_id: lennartUser.id, role: 'member' });
  }

  const membershipUpsertRes = await supabase
    .from('practice_memberships')
    .upsert(assignments, { onConflict: 'practice_id,user_id' });

  if (membershipUpsertRes.error) throw membershipUpsertRes.error;

  const domainRes = await supabase
    .from('practice_domain_links')
    .upsert({
      practice_id: practice.id,
      domain: DOMAIN,
      created_by: ownerUser.id,
    }, { onConflict: 'domain' });

  if (domainRes.error) throw domainRes.error;

  const checkRes = await supabase
    .from('practice_memberships')
    .select('practice_id, user_id, role')
    .eq('practice_id', practice.id)
    .in('user_id', assignments.map((a) => a.user_id));

  if (checkRes.error) throw checkRes.error;

  const output = {
    practice: {
      id: practice.id,
      name: practice.name,
      slug: practice.slug,
      hr_module: true,
    },
    owner: {
      id: ownerUser.id,
      email: ownerUser.email,
      role: 'owner',
    },
    lennart: lennartUser
      ? {
          id: lennartUser.id,
          email: lennartUser.email || null,
          assignedRole: lennartUser.id === ownerUser.id ? 'owner' : 'member',
        }
      : null,
    memberships: checkRes.data || [],
    domainLinked: DOMAIN,
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
