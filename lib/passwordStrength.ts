// Advisory only: a weak password is warned about but never blocked, so people
// can keep a password they will remember (fewer "forgot password" resets).
const COMMON = [
  'password', 'password1', 'password123', 'qwerty', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'admin', 'admin123', 'welcome', 'welcome1', 'letmein', 'abc123',
  'abcd1234', 'pogiako', 'maganda', 'mahalkita', 'kimpoy', 'dragon', 'monkey',
  'football', 'baseball', 'sunshine', 'princess', 'login', 'passw0rd', 'pkcbizoft',
]

export function passwordWarning(password: string, email = ''): string | null {
  if (!password || password.length < 8) return null // length is handled by the form

  const lower = password.toLowerCase()
  const user = email.split('@')[0]?.toLowerCase()

  if (COMMON.some((word) => lower === word || lower.replace(/\d+$/, '') === word)) {
    return 'This is a very common password, so it is easy to guess.'
  }
  if (/^(.)\1+$/.test(password)) {
    return 'A password made of one repeated character is easy to guess.'
  }
  if (/^\d+$/.test(password)) {
    const asc = '0123456789012345678901234567890'
    if (asc.includes(password) || asc.split('').reverse().join('').includes(password)) {
      return 'A run of numbers like 12345678 is easy to guess.'
    }
    return 'A password with only numbers is easier to guess.'
  }
  if (user && user.length >= 4 && lower.includes(user)) {
    return 'Your password contains part of your email address.'
  }
  return null
}
