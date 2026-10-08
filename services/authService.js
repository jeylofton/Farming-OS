// Demo auth provider. Stage 2 replaces this module with Supabase Auth; callers only use authenticate().
const config = require('../config');

function authenticate(username, password) {
  if (username === config.demoUser && password === config.demoPass) return { id: 'demo-owner', name: 'Demo Owner', role: 'owner' };
  return null;
}

module.exports = { authenticate };
