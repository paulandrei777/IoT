// Supabase client helper
const SUPABASE_URL = 'https://oytfdethkubdbgnvgexr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dGZkZXRoa3ViZGJnbnZnZXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTcwNjYsImV4cCI6MjA4ODg5MzA2Nn0.yIhA3RXuAEtf7ZRthJQQ9JabsOn65XWH1HV7slp1TrU';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function loginPagePath() {
  const base = window.location.pathname;
  if (base.includes('/admin/')) return '../client/login.html';
  if (base.includes('/client/')) return 'login.html';
  return '/client/login.html';
}

function studentDashboardPath() { return '../client/home.html'; }
function adminDashboardPath() { return '../admin/dashboard.html'; }

// -------------------- PROFILE --------------------

async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

// -------------------- LOGIN --------------------

async function loginWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// -------------------- REGISTER --------------------

async function signUpWithEmail(fullName, email, password) {
  // Dito natin ipinapasa ang fullName sa metadata
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  if (error) throw error;

  // TANDAAN: Wala na dapat createProfile() dito dahil 
  // ang Database Trigger (handle_new_user) na ang bahala sa profiles table.
  return data;
}

// -------------------- REDIRECT --------------------

async function redirectBasedOnRole(userId) {
  const profile = await getProfile(userId);

  if (!profile || !profile.role) {
    throw new Error('Role not found.');
  }

  if (profile.role === 'admin') {
    window.location.href = adminDashboardPath();
  } else if (profile.role === 'student') {
    window.location.href = studentDashboardPath();
  } else {
    throw new Error('Invalid role.');
  }
}

// -------------------- SESSION CHECK --------------------

async function checkSessionAndRedirect() {
  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session;

  if (session?.user?.id) {
    await redirectBasedOnRole(session.user.id);
  }
}

// -------------------- LOGOUT --------------------

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = loginPagePath();
}

// -------------------- EXPORTS --------------------

window.logout = logout;
window.checkSessionAndRedirect = checkSessionAndRedirect;
window.loginWithEmail = loginWithEmail;
window.signUpWithEmail = signUpWithEmail;
window.redirectBasedOnRole = redirectBasedOnRole;