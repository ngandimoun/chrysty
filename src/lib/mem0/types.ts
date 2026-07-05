export interface RetrievedMemory {
  id: string;
  memory: string;
  score?: number;
  categories?: string[];
}

export interface MemoryContext {
  workspaceId: string;
  astraKey: string;
  memoryUserId: string;
  userId?: string;
}
