// Supabase client helper - Initialize when ready
let supabaseClient = null;
let isInitialized = false;

// Track if we've already warned about missing config to avoid spam
let configWarningGiven = false;
let gracePeriodStarted = false;

function initializeSupabaseClient() {
  if (isInitialized && supabaseClient) {
    console.log('Supabase client already initialized');
    return supabaseClient;
  }

  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (!configWarningGiven) {
      console.error('❌ [INIT] Supabase configuration incomplete');
      console.error(`  - SUPABASE_URL: ${typeof SUPABASE_URL} = "${SUPABASE_URL}" ${SUPABASE_URL ? '✓' : '❌'}`);
      console.error(`  - SUPABASE_ANON_KEY: ${typeof SUPABASE_ANON_KEY} = "${SUPABASE_ANON_KEY}" ${SUPABASE_ANON_KEY ? '✓' : '❌'}`);
      console.error('  👉 Verify server .env has SUPABASE_URL and SUPABASE_ANON_KEY set');
      configWarningGiven = true;
    }
    return null;
  }

  try {
    console.log('🔄 [INIT] Creating Supabase client...');
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isInitialized = true;
    configWarningGiven = false;
    console.log('✓ Supabase client initialized successfully');
    console.log(`  - URL: ${SUPABASE_URL.substring(0, 50)}...`);
    window.supabaseClient = supabaseClient;
    return supabaseClient;
  } catch (error) {
    console.error('❌ [INIT] Failed to create Supabase client:', error);
    return null;
  }
}

async function getSupabaseClient() {
  if (isInitialized && supabaseClient) {
    return supabaseClient;
  }

  const client = await waitForSupabaseClient();
  return client;
}

// Initialize immediately if config is available
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
  console.log('🎯 [INIT] Config available immediately at script load time');
  console.log(`  - URL type: ${typeof window.SUPABASE_URL}, length: ${window.SUPABASE_URL.length}`);
  console.log(`  - Key type: ${typeof window.SUPABASE_ANON_KEY}, length: ${window.SUPABASE_ANON_KEY.length}`);
  const client = initializeSupabaseClient();
  if (client) {
    console.log('✓ Supabase initialized at script load time');
  }
} else {
  console.log('⏳ [INIT] Config not found at script load. Checking window state...');
  console.log(`  - window.SUPABASE_URL: ${typeof window.SUPABASE_URL} = ${window.SUPABASE_URL}`);
  console.log(`  - window.SUPABASE_ANON_KEY: ${typeof window.SUPABASE_ANON_KEY} = ${window.SUPABASE_ANON_KEY}`);
  console.log('  Waiting for server injection...');
  
  let pollCount = 0;
  const checkConfigInterval = setInterval(() => {
    pollCount++;
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !isInitialized) {
      console.log(`🔌 [INIT] Config detected after ${pollCount} polls (${pollCount * 100}ms)`);
      clearInterval(checkConfigInterval);
      const client = initializeSupabaseClient();
      if (client) {
        console.log('✓ Supabase initialized after config injection');
      }
    }
  }, 100);
}

function loginPagePath() {
  return '/login.html';
}

function studentDashboardPath() {
  return '/';
}

function adminDashboardPath() {
  return '/admin/dashboard.html';
}

// -------------------- PROFILE --------------------

async function getProfile(userId) {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not available.');
  }

  console.log('Fetching profile for userId:', userId);
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    throw error;
  }
  console.log('Profile fetched successfully:', data);
  return data;
}

// -------------------- LOGIN --------------------

async function loginWithEmail(email, password) {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not available.');
  }

  console.log('Attempting login for:', email);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.error('Login error:', error);
    throw error;
  }
  console.log('Login successful');
  return data;
}

// -------------------- REGISTER --------------------

async function signUpWithEmail(fullName, email, password) {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not available.');
  }

  console.log('Attempting signup for:', email);
  // Dito natin ipinapasa ang fullName sa metadata
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  if (error) {
    console.error('Signup error:', error);
    throw error;
  }

  console.log('Signup successful');
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

async function checkAuthAndRedirect() {
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath === '/login.html' || currentPath === '/client/login.html';
  const isRegisterPage = currentPath === '/register.html' || currentPath === '/client/register.html';
  const isPublicAuthPage = isLoginPage || isRegisterPage;
  const isStudentPage = currentPath === '/' || currentPath === '/client/home.html' || currentPath.startsWith('/client/');
  const isAdminPage = currentPath.startsWith('/admin/');
  const isProtectedPage = isStudentPage || isAdminPage;

  // Grace period: allow initial page render before checking session
  if (!gracePeriodStarted && isProtectedPage) {
    gracePeriodStarted = true;
    console.log('⏳ Starting 2-second grace period before auth check...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  try {
    // Wait for Supabase client to be ready
    const client = await getSupabaseClient();
    if (!client) {
      console.warn('⚠ Supabase client not available during auth check.');
      if (isProtectedPage) {
        console.log('Redirecting to login due to no Supabase client');
        window.location.href = loginPagePath();
      }
      return;
    }

    // Fetch session from Supabase
    const { data } = await client.auth.getSession();
    const session = data?.session;
    
    // DEBUG: Log the actual session state
    console.log('📋 Session Check Result:', {
      sessionExists: !!session,
      userId: session?.user?.id || 'none',
      userEmail: session?.user?.email || 'none',
      sessionRaw: JSON.stringify(session, null, 2)
    });

    // CASE 1: User is NOT logged in
    if (!session?.user?.id) {
      console.log('❌ No valid session. Current page:', currentPath);
      
      // Allow access to public auth pages (login, register)
      if (isPublicAuthPage) {
        console.log('✓ On public auth page - access allowed');
        return;
      }
      
      // Redirect from protected pages to login
      if (isProtectedPage) {
        console.log('🔐 On protected page without session - redirecting to login');
        window.location.href = loginPagePath();
      }
      
      // For any other page, allow access
      return;
    }

    // CASE 2: User IS logged in
    console.log('✅ Session found. User ID:', session.user.id);
    
    // Get user profile and role
    try {
      const profile = await getProfile(session.user.id);
      const role = profile.role;
      console.log('👤 User role:', role);

      // If on public auth page and logged in, redirect to appropriate dashboard
      if (isPublicAuthPage) {
        console.log('User logged in but on auth page - redirecting to dashboard');
        await redirectBasedOnRole(session.user.id);
        return;
      }

      // On protected pages - check role
      if (isStudentPage && role !== 'student') {
        console.log('On student page but user role is', role, '- redirecting');
        await redirectBasedOnRole(session.user.id);
        return;
      }

      if (isAdminPage && role !== 'admin') {
        console.log('On admin page but user role is', role, '- redirecting');
        await redirectBasedOnRole(session.user.id);
        return;
      }

      // Logged in on correct page - do nothing
      console.log('✓ User is on correct page with correct role');
      
    } catch (profileError) {
      console.error('Error fetching profile:', profileError);
      if (!isPublicAuthPage) {
        window.location.href = loginPagePath();
      }
    }

  } catch (error) {
    console.error('❌ Auth check failed:', error);
    // On error, redirect to login only if on protected page
    if (isProtectedPage && !isPublicAuthPage) {
      try {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
        }
      } catch (e) {
        console.error('Signout error:', e);
      }
      window.location.href = loginPagePath();
    }
  }
}

// Keep old function for backward compatibility
async function checkSessionAndRedirect() {
  return checkAuthAndRedirect();
}

// -------------------- LOGOUT --------------------

async function logout() {
  try {
    const client = await getSupabaseClient();
    if (!client) {
      console.warn('Cannot log out because Supabase client is unavailable.');
      window.location.href = loginPagePath();
      return;
    }

    console.log('Logging out...');
    await client.auth.signOut();
    console.log('Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
  }
  window.location.href = loginPagePath();
}

// -------------------- INITIALIZATION HELPER --------------------

// Function to wait for Supabase client to be ready
async function waitForSupabaseClient(maxWait = 15000) {
  const startTime = Date.now();
  let warningLogged = false;
  let pollCount = 0;

  while (!isInitialized) {
    pollCount++;
    
    // Try to initialize if config just became available
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      const client = initializeSupabaseClient();
      if (client) {
        console.log('✓ Supabase client ready');
        return client;
      }
    }

    // Check if critical config is missing
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      const elapsed = Date.now() - startTime;
      if (elapsed > 5000 && !warningLogged) {
        console.error('✗ CRITICAL: Supabase config not injected after 5 seconds');
        console.error('  📋 Window state after 5s:');
        console.error(`    - window.SUPABASE_URL: ${typeof window.SUPABASE_URL} = "${String(window.SUPABASE_URL).substring(0, 50)}${String(window.SUPABASE_URL).length > 50 ? '...' : ''}"`);
        console.error(`    - window.SUPABASE_ANON_KEY: ${typeof window.SUPABASE_ANON_KEY} = "${String(window.SUPABASE_ANON_KEY).substring(0, 50)}${String(window.SUPABASE_ANON_KEY).length > 50 ? '...' : ''}"`);
        console.error('  👉 Check server logs for injection details');
        warningLogged = true;
      }
    }

    // Soft timeout
    if (Date.now() - startTime > maxWait) {
      console.warn(`⏱ Supabase initialization timeout after ${maxWait}ms (${pollCount} polls)`);
      console.warn('  📋 Final window state:');
      console.warn(`    - window.SUPABASE_URL: ${typeof window.SUPABASE_URL} = "${String(window.SUPABASE_URL).substring(0, 50)}"`);
      console.warn(`    - window.SUPABASE_ANON_KEY: ${typeof window.SUPABASE_ANON_KEY} = "${String(window.SUPABASE_ANON_KEY).substring(0, 50)}"`);
      return null;
    }

    // Small delay to avoid busy-waiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return supabaseClient;
}

// -------------------- EXPORTS --------------------

window.logout = logout;
window.checkSessionAndRedirect = checkSessionAndRedirect;
window.checkAuthAndRedirect = checkAuthAndRedirect;
window.loginWithEmail = loginWithEmail;
window.signUpWithEmail = signUpWithEmail;
window.redirectBasedOnRole = redirectBasedOnRole;
window.initializeSupabaseClient = initializeSupabaseClient;
window.waitForSupabaseClient = waitForSupabaseClient;
window.initPasswordToggle = initPasswordToggle;

// -------------------- PASSWORD TOGGLE --------------------

function initPasswordToggle() {
  document.querySelector('.password-toggle').addEventListener('click', function() {
    const input = this.parentElement.querySelector('input');
    const img = this.querySelector('.eye-icon');
    
    const hideIcon = '/assets/icons/hide.png';
    const showIcon = '/assets/icons/show.png';
    
    if (input.type === 'password') {
      input.type = 'text';
      img.src = showIcon;
    } else {
      input.type = 'password';
      img.src = hideIcon;
    }
  });
}