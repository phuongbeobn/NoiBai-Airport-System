import { appConfig } from './config.js';

const tokenKey = 'vvnb_github_access_token';
const apiUrl = 'https://api.github.com';
const getToken = () => localStorage.getItem(tokenKey) ?? '';
const headers = () => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${getToken()}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

export const githubSyncConfigured = () => Boolean(
  import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID &&
  import.meta.env.VITE_GITHUB_REPOSITORY,
);
export const githubConnected = () => Boolean(getToken());

export async function startGithubDeviceLogin(onCode) {
  const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('missing client id');
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: 'repo' }),
  });
  const device = await response.json();
  if (!device.device_code) throw new Error(device.error || 'device code failed');
  onCode(device);
  const deadline = Date.now() + (device.expires_in * 1000);
  let interval = Math.max(device.interval ?? 5, 5) * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, device_code: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    });
    const token = await tokenResponse.json();
    if (token.access_token) { localStorage.setItem(tokenKey, token.access_token); return; }
    if (token.error === 'slow_down') interval += 5000;
    if (!['authorization_pending', 'slow_down'].includes(token.error)) throw new Error(token.error || 'login failed');
  }
  throw new Error('login expired');
}

export async function loadGithubConfig() {
  const path = import.meta.env.VITE_GITHUB_CONFIG_PATH || 'configure.json';
  const response = await fetch(`${apiUrl}/repos/${import.meta.env.VITE_GITHUB_REPOSITORY}/contents/${path}`, { headers: headers() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('read failed');
  const file = await response.json();
  const json = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
  return { data: JSON.parse(json), sha: file.sha };
}

export async function saveGithubConfig(data, sha) {
  const path = import.meta.env.VITE_GITHUB_CONFIG_PATH || 'configure.json';
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const response = await fetch(`${apiUrl}/repos/${import.meta.env.VITE_GITHUB_REPOSITORY}/contents/${path}`, {
    method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update VVNB configuration', content, sha, branch: 'main' }),
  });
  if (!response.ok) throw new Error('write failed');
  return (await response.json()).content.sha;
}
