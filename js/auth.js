// Supabase client helper - Initialize when ready
let supabaseClient = null;
let isInitialized = false;

// Function to initialize Supabase client
function initializeSupabaseClient() {
  if (isInitialized && supabaseClient) {
    console.log('Supabase client already initialized');
    return supabaseClient;
  }

  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase configuration not found yet. URL:', SUPABASE_URL, 'KEY exists:', !!SUPABASE_ANON_KEY);
    return null;
  }

  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  isInitialized = true;
  console.log('✓ Supabase client initialized successfully');
  window.supabaseClient = supabaseClient;
  return supabaseClient;
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
  const client = initializeSupabaseClient();
  if (client) {
    console.log('✓ Supabase initialized at script load time');
  }
} else {
  console.warn('⚠ Config not yet available - will initialize on demand');
  const checkConfigInterval = setInterval(() => {
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !isInitialized) {
      clearInterval(checkConfigInterval);
      const client = initializeSupabaseClient();
      if (client) {
        console.log('✓ Supabase initialized on demand');
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

  try {
    const client = await getSupabaseClient();
    if (!client) {
      console.warn('Supabase client unavailable during auth check.');
      if (isProtectedPage) {
        window.location.href = loginPagePath();
      }
      return;
    }

    const { data } = await client.auth.getSession();
    const session = data?.session;

    // CASE 1: User is NOT logged in
    if (!session?.user?.id) {
      console.log('No session found. Current page:', currentPath);
      
      // Allow access to public auth pages (login, register)
      if (isPublicAuthPage) {
        console.log('On public auth page - allowing access');
        return;
      }
      
      // Redirect from protected pages to login
      if (isProtectedPage) {
        console.log('On protected page without session - redirecting to login');
        window.location.href = loginPagePath();
      }
      
      // For any other page, allow access (future public pages)
      return;
    }

    // CASE 2: User IS logged in
    console.log('Session found. User ID:', session.user.id);
    
    // Get user profile and role
    const profile = await getProfile(session.user.id);
    const role = profile.role;
    console.log('User role:', role);

    // If on public auth page and logged in, redirect to appropriate dashboard
    if (isPublicAuthPage) {
      console.log('Logged in user on public auth page - redirecting to dashboard');
      await redirectBasedOnRole(session.user.id);
      return;
    }

    // On protected pages - check role
    if (isStudentPage && role !== 'student') {
      console.log('On student page but user is not student - redirecting to correct dashboard');
      await redirectBasedOnRole(session.user.id);
      return;
    }

    if (isAdminPage && role !== 'admin') {
      console.log('On admin page but user is not admin - redirecting to correct dashboard');
      await redirectBasedOnRole(session.user.id);
      return;
    }

    // Logged in on correct page - do nothing
    console.log('✓ User is on correct page with correct role');

  } catch (error) {
    console.error('Auth check failed:', error);
    // On error with critical functions, sign out and redirect to login
    if (!isPublicAuthPage) {
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
async function waitForSupabaseClient(maxWait = 10000) {
  const startTime = Date.now();

  while (!isInitialized) {
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      const client = initializeSupabaseClient();
      if (client) {
        return client;
      }
    }

    if (Date.now() - startTime > maxWait) {
      console.warn('Supabase config still unavailable after wait.');
      return null;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
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