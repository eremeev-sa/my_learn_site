// Browser-local interface lock. This is not a server access-control boundary.
export const SESSION_KEY = 'dev-growth-local-session';
export const SESSION_DURATION = 12 * 60 * 60 * 1000;

function decodeHex(hex) {
  if (typeof hex !== 'string' || !/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw new Error('Некорректная запись пользователя');
  return Uint8Array.from(hex.match(/.{2}/g), value => parseInt(value, 16));
}
export async function passwordHash(password, salt, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error('Для входа открой сайт по HTTPS или через localhost');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decodeHex(salt),iterations}, key, 256);
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2,'0')).join('');
}
export async function verifyPassword(password, account) {
  const actual = await passwordHash(password, account.salt, account.iterations);
  let difference = actual.length ^ account.password_hash.length;
  for (let i=0;i<actual.length;i++) difference |= actual.charCodeAt(i) ^ account.password_hash.charCodeAt(i);
  return difference === 0;
}
export async function createAccount(username,password) {
  if(!username || username.length>100 || password.length<8 || password.length>200)throw new Error('Укажи логин и пароль от 8 до 200 символов');
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  const iterations=600000;
  return {username,salt,password_hash:await passwordHash(password,salt,iterations),iterations,revision:1};
}
export function createSession(account, now = Date.now()) {
  return {username:account.username,revision:account.revision,expiresAt:now+SESSION_DURATION};
}
export function validSession(value, account, now = Date.now()) {
  try {
    const session = typeof value === 'string' ? JSON.parse(value) : value;
    return Boolean(session && account && session.username===account.username && session.revision===account.revision && Number.isFinite(session.expiresAt) && session.expiresAt>now && session.expiresAt<=now+SESSION_DURATION);
  } catch { return false; }
}
