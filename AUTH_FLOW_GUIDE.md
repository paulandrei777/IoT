# DominiFinds Authentication Flow Guide

## Updated Guard Logic (checkAuthAndRedirect)

### Page Classification
- **Public Auth Pages**: `/login.html`, `/register.html`
- **Protected Pages - Student**: `/client/home.html`, `/client/` (any client page)
- **Protected Pages - Admin**: `/admin/` (any admin page)

### Access Rules

#### Case 1: User NOT Logged In
| Page Type | Action |
|-----------|--------|
| Public Auth Page (login/register) | ✅ Allow access |
| Protected Page (student/admin) | ❌ Redirect to login |
| Other pages | ✅ Allow access |

#### Case 2: User IS Logged In
| Page Type | Condition | Action |
|-----------|-----------|--------|
| Public Auth Page | Any role | ❌ Redirect to dashboard |
| Student Page | Role = student | ✅ Allow access |
| Student Page | Role ≠ student | ❌ Redirect to admin dashboard |
| Admin Page | Role = admin | ✅ Allow access |
| Admin Page | Role ≠ admin | ❌ Redirect to student dashboard |

### Flow Examples

#### Example 1: New User Registration Flow
```
1. User visits /client/register.html (no session)
   → checkAuthAndRedirect allows access ✓
   → Registration form displays

2. User submits form with email, password, full_name
   → signUpWithEmail() creates account in Supabase
   → Trigger 'handle_new_user' creates profile record
   → Show success message

3. After 1.5s, redirect to /client/login.html
   → checkAuthAndRedirect allows access (no session) ✓
   → Login form displays

4. User submits login form
   → loginWithEmail() authenticates user
   → Session created
   → Get user profile and role
   → redirectBasedOnRole() sends to correct dashboard
   → Student → /client/home.html ✓
   → Admin → /admin/dashboard.html ✓
```

#### Example 2: Already Logged-In User Tries to Access Public Page
```
1. User visits /client/login.html (already has session)
   → checkAuthAndRedirect detects session + login page
   → Calls redirectBasedOnRole()
   → Redirects to user's dashboard ✓
```

#### Example 3: Student Tries to Access Admin Page
```
1. Student user visits /admin/dashboard.html (has session)
   → checkAuthAndRedirect detects session + admin page
   → Fetches profile → role = 'student'
   → Calls redirectBasedOnRole()
   → Redirects to /client/home.html ✓
```

#### Example 4: Not Logged In, Tries to Access Protected Page
```
1. User visits /client/home.html (no session)
   → checkAuthAndRedirect detects no session + protected page
   → Redirects to /client/login.html
   → User can log in ✓
```

## Console Output for Debugging

### Successful Registration Flow
```
✓ Supabase initialized at script load time
Attempting signup for: email@example.com
Signup successful
[1.5s delay]
No session found. Current page: /client/login.html
On public auth page - allowing access
✓ User is on correct page with correct role
Attempting login for: email@example.com
Login successful
Fetching profile for userId: abc123
Profile fetched successfully: {full_name: "John Doe", email: "john@school.edu", role: "student"}
✓ User is on correct page with correct role
```

### Access Attempt When Already Logged In
```
Session found. User ID: abc123
User role: student
Logged in user on public auth page - redirecting to dashboard
✓ User is on correct page with correct role
```

## Protected Pages Configuration

To add new protected pages:

1. **For student pages**: Add check for `currentPath.includes('/your-path')`
   ```javascript
   const isStudentPage = currentPath.includes('/client/home.html') || 
                         currentPath.includes('/client/') ||
                         currentPath.includes('/client/your-page');
   ```

2. **For admin pages**: Add check for `/admin/` prefix
   ```javascript
   const isAdminPage = currentPath.includes('/admin/');
   ```

3. **For new public pages**: Add to public auth pages
   ```javascript
   const isPublicPage = isLoginPage || isRegisterPage || currentPath.includes('/forgot-password.html');
   ```

## Error Handling

### Initialization Errors
- On `/register.html` or `/login.html`: Errors don't block page
- On protected pages: Errors trigger signout and redirect to login
- Console logs all errors for debugging

### Network Errors
- Profile fetch fails → User signed out and redirected to login
- Session check fails → User given error message in console
- Auth operations fail → Error displayed in form (showError)

## Testing Checklist

- [ ] Can access /register.html without session
- [ ] Can access /login.html without session
- [ ] Cannot access /client/home.html without session (redirects to login)
- [ ] Cannot access /admin/dashboard.html without session (redirects to login)
- [ ] After registration, redirects to login.html
- [ ] After login, redirects to correct dashboard based on role
- [ ] Student cannot access /admin/ (redirects to student dashboard)
- [ ] Admin cannot access /client/ (redirects to admin dashboard)
- [ ] Already logged-in user on login page redirects to dashboard
- [ ] Already logged-in user on register page redirects to dashboard
- [ ] Logout clears session and redirects to login
