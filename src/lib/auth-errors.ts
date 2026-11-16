export function authMessage(message: string, status?: number) {
  if (status === 429 || /too many|max.*attempt|attempt.*exceed/i.test(message))
    return "Too many attempts. Wait a minute, then request a new code.";
  if (/expir/i.test(message))
    return "That code has expired or is no longer valid. Request a new code and try again.";
  if (/invalid.*(otp|code)|(otp|code).*invalid|incorrect.*code/i.test(message))
    return "That code doesn’t look right. Check all six digits or request a new code.";
  return message;
}
