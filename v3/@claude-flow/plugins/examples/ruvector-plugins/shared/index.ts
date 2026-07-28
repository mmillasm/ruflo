/**
 * Shared utilities for RuVector plugins
 */

export {
  // Interfaces
  type IVectorDB,
  type ILoRAEngine,
  type LoRAAdapter,
  // Fallback implementations
  FallbackVectorDB,
  FallbackLoRAEngine,
  // Factory functions
  createVectorDB,
  createLoRAEngine,
  // Utilities
  cosineSimilarity,
  generateHashEmbedding,
  LazyInitializable,
} from './vector-utils.js';
