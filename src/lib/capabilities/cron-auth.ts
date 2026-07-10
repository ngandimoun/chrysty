export function isCronAuthorized(request: Request, secret = process.env.CRON_SECRET): boolean {
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}
