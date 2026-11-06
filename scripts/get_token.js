const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient('https://owseuntgcgvflqpnmwcc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2V1bnRnY2d2ZmxxcG5td2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Nzg3OTIsImV4cCI6MjEwNjE1NDc5Mn0.L4XXan0fWLnfkQNVTexlwYNc6SjZcSG3DoobZYcl0yw');
  
  // Try sign in
  const passwords = ['123456', 'Password123!', 'admin123', 'Semestre@2026'];
  for (const p of passwords) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'xvanahirosero2026@gmail.com',
      password: p
    });
    if (data?.session) {
      console.log('Logged in with', p);
      console.log('Access token:', data.session.access_token);
      return data.session.access_token;
    }
  }
}
main();
