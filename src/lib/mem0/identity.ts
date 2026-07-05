export function getMem0MemoryUserId(input: { userId: string; astraKey: string }): string {
  const userId = input.userId.trim();
  if (userId) {
    return userId;
  }

  throw new Error('Authenticated user id is required for memory.');
}