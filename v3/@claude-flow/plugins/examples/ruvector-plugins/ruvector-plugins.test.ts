/**
 * RuVector Plugins Test Suite
 *
 * Tests for all RuVector-powered plugins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookEvent } from '../../src/index.js';
import type {
  ReasoningTrajectory,
  ReasoningStep,
  CodeChunk,
  CodeSearchResult,
  LearningPattern,
  AdaptationResult,
  Intent,
  IntentHandler,
  RouteResult,
  ToolUsagePattern,
  ToolSequence,
  OptimizationSuggestion,
  HookPattern,
  PatternMatch,
  HookRecommendation,
} from './index.js';

// Type tests for ReasoningBank
describe('ReasoningBank Types', () => {
  it('should have correct ReasoningStep structure', () => {
    const step: ReasoningStep = {
      thought: 'Analyzing the problem',
      action: 'Search for patterns',
      observation: 'Found matching patterns',
      reward: 0.8,
    };

    expect(step.thought).toBeDefined();
    expect(step.action).toBeDefined();
    expect(step.observation).toBeDefined();
    expect(typeof step.reward).toBe('number');
  });

  it('should have correct ReasoningTrajectory structure', () => {
    const trajectory: ReasoningTrajectory = {
      id: 'traj-001',
      task: 'Debug authentication flow',
      steps: [
        {
          thought: 'Check auth middleware',
          action: 'Read auth.ts',
          observation: 'Found token validation issue',
          reward: 0.9,
        },
      ],
      outcome: 'success',
      totalReward: 0.9,
      timestamp: Date.now(),
      metadata: { category: 'debugging' },
    };

    expect(trajectory.id).toBe('traj-001');
    expect(trajectory.outcome).toBe('success');
    expect(trajectory.steps.length).toBe(1);
  });

  it('should allow optional metadata', () => {
    const trajectory: ReasoningTrajectory = {
      id: 'traj-002',
      task: 'Simple task',
      steps: [],
      outcome: 'success',
      totalReward: 1.0,
      timestamp: Date.now(),
    };

    expect(trajectory.metadata).toBeUndefined();
  });
});

// Type tests for SemanticCodeSearch
describe('SemanticCodeSearch Types', () => {
  it('should have correct CodeChunk structure', () => {
    const chunk: CodeChunk = {
      id: 'chunk-001',
      content: 'function hello() { return "world"; }',
      filePath: '/src/utils.ts',
      startLine: 10,
      endLine: 12,
      language: 'typescript',
      symbols: ['hello'],
    };

    expect(chunk.id).toBe('chunk-001');
    expect(chunk.language).toBe('typescript');
    expect(chunk.symbols).toContain('hello');
  });

  it('should have correct CodeSearchResult structure', () => {
    const result: CodeSearchResult = {
      chunk: {
        id: 'chunk-002',
        content: 'class UserService {}',
        filePath: '/src/services/user.ts',
        startLine: 1,
        endLine: 50,
        language: 'typescript',
        symbols: ['UserService'],
      },
      score: 0.95,
      highlights: ['UserService'],
    };

    expect(result.score).toBeGreaterThan(0);
    expect(result.chunk.symbols).toContain('UserService');
  });

  it('should allow optional symbols and metadata', () => {
    const chunk: CodeChunk = {
      id: 'chunk-003',
      content: '# Comment only',
      filePath: '/src/config.py',
      startLine: 1,
      endLine: 1,
      language: 'python',
    };

    expect(chunk.symbols).toBeUndefined();
  });
});

// Type tests for SONA Learning
describe('SONALearning Types', () => {
  it('should have correct LearningPattern structure', () => {
    const pattern: LearningPattern = {
      id: 'pattern-001',
      category: 'code-review',
      input: 'Review this function for bugs',
      output: 'Found null pointer dereference',
      embedding: new Float32Array([0.1, 0.2, 0.3]),
      adapterId: 'adapter-001',
      quality: 0.92,
      usageCount: 15,
      lastUsed: Date.now(),
    };

    expect(pattern.category).toBe('code-review');
    expect(pattern.quality).toBeGreaterThan(0.9);
    expect(pattern.embedding).toBeInstanceOf(Float32Array);
  });

  it('should have correct AdaptationResult structure', () => {
    const result: AdaptationResult = {
      patternId: 'pattern-002',
      adapterId: 'adapter-002',
      improvement: 0.15,
      newQuality: 0.87,
      latencyMs: 0.05,
    };

    expect(result.improvement).toBeGreaterThan(0);
    expect(result.latencyMs).toBeLessThan(1);
  });
});

// Type tests for Intent Router
describe('IntentRouter Types', () => {
  it('should have correct Intent structure', () => {
    const intent: Intent = {
      id: 'intent-coding',
      name: 'coding',
      description: 'Code writing and implementation',
      examples: [
        'Write a function to sort an array',
        'Implement the login feature',
        'Create a new component',
      ],
      priority: 1,
    };

    expect(intent.examples.length).toBeGreaterThan(0);
    expect(intent.priority).toBe(1);
  });

  it('should have correct IntentHandler structure', () => {
    const handler: IntentHandler = {
      intentId: 'intent-coding',
      agentType: 'coder',
      tools: ['Edit', 'Write', 'Read'],
      confidence: 0.95,
    };

    expect(handler.tools).toContain('Edit');
    expect(handler.confidence).toBeGreaterThan(0.9);
  });

  it('should have correct RouteResult structure', () => {
    const result: RouteResult = {
      intent: {
        id: 'intent-testing',
        name: 'testing',
        description: 'Testing and validation',
        examples: ['Write tests', 'Run test suite'],
        priority: 2,
      },
      handler: {
        intentId: 'intent-testing',
        agentType: 'tester',
        tools: ['Bash', 'Read'],
        confidence: 0.88,
      },
      confidence: 0.88,
      alternatives: [],
    };

    expect(result.handler.agentType).toBe('tester');
  });
});

// Type tests for MCP Tool Optimizer
describe('MCPToolOptimizer Types', () => {
  it('should have correct ToolUsagePattern structure', () => {
    const pattern: ToolUsagePattern = {
      id: 'usage-001',
      toolSequence: ['Read', 'Edit', 'Bash'],
      context: 'fixing-bug',
      successRate: 0.92,
      avgDuration: 5000,
      usageCount: 50,
    };

    expect(pattern.toolSequence).toHaveLength(3);
    expect(pattern.successRate).toBeGreaterThan(0.9);
  });

  it('should have correct ToolSequence structure', () => {
    const sequence: ToolSequence = {
      tools: ['Glob', 'Grep', 'Read'],
      confidence: 0.85,
      reasoning: 'Search, then filter, then read details',
    };

    expect(sequence.tools[0]).toBe('Glob');
    expect(sequence.reasoning).toBeDefined();
  });

  it('should have correct OptimizationSuggestion structure', () => {
    const suggestion: OptimizationSuggestion = {
      currentSequence: ['Read', 'Read', 'Read'],
      suggestedSequence: ['Glob', 'Read'],
      expectedImprovement: 0.3,
      reasoning: 'Use Glob to find files first, then Read targeted files',
    };

    expect(suggestion.expectedImprovement).toBeGreaterThan(0);
    expect(suggestion.suggestedSequence.length).toBeLessThan(
      suggestion.currentSequence.length
    );
  });
});

// Type tests for Hook Pattern Library
describe('HookPatternLibrary Types', () => {
  it('should have correct HookPattern structure', () => {
    const pattern: HookPattern = {
      id: 'hook-format-ts',
      filePattern: '*.ts',
      operation: 'save',
      hookType: 'pre',
      command: 'prettier --write',
      successRate: 0.98,
      usageCount: 200,
    };

    expect(pattern.hookType).toBe('pre');
    expect(pattern.successRate).toBeGreaterThan(0.95);
  });

  it('should have correct PatternMatch structure', () => {
    const match: PatternMatch = {
      pattern: {
        id: 'hook-lint',
        filePattern: '*.js',
        operation: 'commit',
        hookType: 'pre',
        command: 'eslint --fix',
        successRate: 0.95,
        usageCount: 100,
      },
      score: 0.92,
      reasoning: 'High success rate for JavaScript linting',
    };

    expect(match.score).toBeGreaterThan(0.9);
    expect(match.reasoning).toBeDefined();
  });

  it('should have correct HookRecommendation structure', () => {
    const recommendation: HookRecommendation = {
      filePath: '/src/app.tsx',
      operation: 'save',
      recommendations: [
        {
          pattern: {
            id: 'hook-format-tsx',
            filePattern: '*.tsx',
            operation: 'save',
            hookType: 'pre',
            command: 'prettier --write',
            successRate: 0.97,
            usageCount: 150,
          },
          score: 0.95,
          reasoning: 'TSX files benefit from auto-formatting',
        },
      ],
      confidence: 0.95,
    };

    expect(recommendation.recommendations.length).toBeGreaterThan(0);
    expect(recommendation.confidence).toBeGreaterThan(0.9);
  });
});

// Integration type tests
describe('Plugin Integration Types', () => {
  it('should export all plugin types', async () => {
    // Dynamic import to verify exports work
    const exports = await import('./index.js');

    expect(exports.reasoningBankPlugin).toBeDefined();
    expect(exports.semanticCodeSearchPlugin).toBeDefined();
    expect(exports.sonaLearningPlugin).toBeDefined();
    expect(exports.intentRouterPlugin).toBeDefined();
    expect(exports.mcpToolOptimizerPlugin).toBeDefined();
    expect(exports.hookPatternLibraryPlugin).toBeDefined();
    expect(exports.registerAllRuVectorPlugins).toBeDefined();
  });

  it('should export all class instances', async () => {
    const exports = await import('./index.js');

    expect(exports.ReasoningBank).toBeDefined();
    expect(exports.SemanticCodeSearch).toBeDefined();
    expect(exports.SONALearning).toBeDefined();
    expect(exports.IntentRouter).toBeDefined();
    expect(exports.MCPToolOptimizer).toBeDefined();
    expect(exports.HookPatternLibrary).toBeDefined();
  });
});

// Plugin metadata tests
//
// Contract note (ADR-323): PluginMetadata identifies a plugin by `name`
// (kebab-case slug — the registry key) and categorizes it via `tags`.
// The SDK has never had `id`, `capabilities`, or human-readable display
// names; the original assertions here were written against an API that
// never existed. These assert the real contract in src/types/index.ts.
describe('Plugin Metadata', () => {
  it('reasoningBankPlugin should have correct metadata', async () => {
    const { reasoningBankPlugin } = await import('./index.js');
    const metadata = reasoningBankPlugin.metadata;

    expect(metadata.name).toBe('reasoning-bank');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('reasoning');
    expect(metadata.tags).toContain('learning');
  });

  it('semanticCodeSearchPlugin should have correct metadata', async () => {
    const { semanticCodeSearchPlugin } = await import('./index.js');
    const metadata = semanticCodeSearchPlugin.metadata;

    expect(metadata.name).toBe('semantic-code-search');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('search');
    expect(metadata.tags).toContain('code');
  });

  it('sonaLearningPlugin should have correct metadata', async () => {
    const { sonaLearningPlugin } = await import('./index.js');
    const metadata = sonaLearningPlugin.metadata;

    expect(metadata.name).toBe('sona-learning');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('learning');
    expect(metadata.tags).toContain('adaptation');
  });

  it('intentRouterPlugin should have correct metadata', async () => {
    const { intentRouterPlugin } = await import('./index.js');
    const metadata = intentRouterPlugin.metadata;

    expect(metadata.name).toBe('intent-router');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('routing');
  });

  it('mcpToolOptimizerPlugin should have correct metadata', async () => {
    const { mcpToolOptimizerPlugin } = await import('./index.js');
    const metadata = mcpToolOptimizerPlugin.metadata;

    expect(metadata.name).toBe('mcp-tool-optimizer');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('optimization');
  });

  it('hookPatternLibraryPlugin should have correct metadata', async () => {
    const { hookPatternLibraryPlugin } = await import('./index.js');
    const metadata = hookPatternLibraryPlugin.metadata;

    expect(metadata.name).toBe('hook-pattern-library');
    expect(metadata.version).toBeDefined();
    expect(metadata.tags).toContain('hooks');
    expect(metadata.tags).toContain('patterns');
  });
});

// MCP Tool definitions tests
//
// Contract note (ADR-323): IPlugin exposes tools via the registration
// method `registerMCPTools()`, not a `.tools` property. This is how the
// plugin registries (src/registry/*) collect tools in production.
describe('MCP Tool Definitions', () => {
  it('reasoningBankPlugin should define expected tools', async () => {
    const { reasoningBankPlugin } = await import('./index.js');
    const tools = reasoningBankPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('reasoning-store');
    expect(toolNames).toContain('reasoning-retrieve');
    expect(toolNames).toContain('reasoning-judge');
    expect(toolNames).toContain('reasoning-distill');
    expect(toolNames).toContain('reasoning-stats');
  });

  it('semanticCodeSearchPlugin should define expected tools', async () => {
    const { semanticCodeSearchPlugin } = await import('./index.js');
    const tools = semanticCodeSearchPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('code-index');
    expect(toolNames).toContain('code-search');
    expect(toolNames).toContain('code-similar');
    expect(toolNames).toContain('code-stats');
  });

  it('sonaLearningPlugin should define expected tools', async () => {
    const { sonaLearningPlugin } = await import('./index.js');
    const tools = sonaLearningPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('sona-learn');
    expect(toolNames).toContain('sona-retrieve');
    expect(toolNames).toContain('sona-feedback');
    expect(toolNames).toContain('sona-stats');
  });

  it('intentRouterPlugin should define expected tools', async () => {
    const { intentRouterPlugin } = await import('./index.js');
    const tools = intentRouterPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('intent-route');
    expect(toolNames).toContain('intent-register');
    expect(toolNames).toContain('intent-stats');
  });

  it('mcpToolOptimizerPlugin should define expected tools', async () => {
    const { mcpToolOptimizerPlugin } = await import('./index.js');
    const tools = mcpToolOptimizerPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('tool-optimize');
    expect(toolNames).toContain('tool-suggest-next');
    expect(toolNames).toContain('tool-stats');
  });

  it('hookPatternLibraryPlugin should define expected tools', async () => {
    const { hookPatternLibraryPlugin } = await import('./index.js');
    const tools = hookPatternLibraryPlugin.registerMCPTools?.() ?? [];
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('hook-recommend');
    expect(toolNames).toContain('hook-record');
    expect(toolNames).toContain('hook-stats');
  });
});

// Hook definitions tests
//
// Contract note (ADR-323): IPlugin exposes hooks via `registerHooks()`, not
// a `.hooks` property, and HookDefinition.event carries HookEvent enum
// values (e.g. 'hook:post-task-complete'), not PascalCase member names.
// The original test also asserted 'PostToolCall', which has never been a
// HookEvent member (the real event is PostToolUse), and expected file
// operation hooks from hookPatternLibraryPlugin that were only ever seed
// DATA inside its pattern library — the plugin registers a single
// PostToolUse recording hook.
describe('Hook Definitions', () => {
  it('reasoningBankPlugin should define learning hooks', async () => {
    const { reasoningBankPlugin } = await import('./index.js');
    const hooks = reasoningBankPlugin.registerHooks?.() ?? [];

    expect(hooks.length).toBeGreaterThan(0);
    const hookEvents = hooks.map((h) => h.event);
    expect(hookEvents).toContain(HookEvent.PostTaskComplete);
  });

  it('intentRouterPlugin should define routing hooks', async () => {
    const { intentRouterPlugin } = await import('./index.js');
    const hooks = intentRouterPlugin.registerHooks?.() ?? [];

    expect(hooks.length).toBeGreaterThan(0);
    const hookEvents = hooks.map((h) => h.event);
    expect(hookEvents).toContain(HookEvent.PreTaskExecute);
  });

  it('mcpToolOptimizerPlugin should define optimization hooks', async () => {
    const { mcpToolOptimizerPlugin } = await import('./index.js');
    const hooks = mcpToolOptimizerPlugin.registerHooks?.() ?? [];

    expect(hooks.length).toBeGreaterThan(0);
    const hookEvents = hooks.map((h) => h.event);
    expect(hookEvents).toContain(HookEvent.PostToolUse);
    expect(hookEvents).toContain(HookEvent.PostTaskComplete);
  });

  it('hookPatternLibraryPlugin should define pattern-recording hooks', async () => {
    const { hookPatternLibraryPlugin } = await import('./index.js');
    const hooks = hookPatternLibraryPlugin.registerHooks?.() ?? [];

    expect(hooks.length).toBeGreaterThan(0);
    const hookEvents = hooks.map((h) => h.event);
    expect(hookEvents).toContain(HookEvent.PostToolUse);
  });
});
