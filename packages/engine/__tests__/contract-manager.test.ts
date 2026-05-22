import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ContractManager,
  createContractManager,
  contractManager,
  type ContractDefinition,
  type ContractField,
  type ContractStatus,
  type ContractValidationResult,
  type ContractViolation,
  type ContractChangeRecord,
} from '../src/contract-manager.ts';

// ============================================================
// Construction & Factory Functions
// ============================================================

describe('Construction & Factory Functions', () => {
  test('createContractManager creates new ContractManager instance', () => {
    const cm1 = createContractManager();
    const cm2 = createContractManager();
    expect(cm1).not.toBe(cm2);
    expect(cm1).toBeInstanceOf(ContractManager);
    expect(cm2).toBeInstanceOf(ContractManager);
  });

  test('global contractManager singleton exists', () => {
    expect(contractManager).toBeInstanceOf(ContractManager);
  });

  test('ContractManager starts with no contracts', () => {
    const cm = createContractManager();
    expect(cm.listContracts().length).toBe(0);
  });

  test('createContractManager produces independent instances', () => {
    const cm1 = createContractManager();
    const cm2 = createContractManager();

    cm1.defineContract('api-a', '1.0.0', 'module-a', [
      { name: 'id', type: 'string', required: true },
    ], 'API A');

    cm2.defineContract('api-b', '1.0.0', 'module-b', [
      { name: 'id', type: 'number', required: true },
    ], 'API B');

    expect(cm1.listContracts().length).toBe(1);
    expect(cm2.listContracts().length).toBe(1);
    expect(cm1.getContractByName('api-a')).toBeDefined();
    expect(cm1.getContractByName('api-b')).toBeUndefined();
  });
});

// ============================================================
// Contract Definition
// ============================================================

describe('Contract Definition', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('defineContract creates a new contract with correct fields', () => {
    const fields: ContractField[] = [
      { name: 'id', type: 'string', required: true, description: 'Unique identifier' },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ];

    const contract = cm.defineContract('user-api', '1.0.0', 'user-service', fields, 'User API contract');

    expect(contract.name).toBe('user-api');
    expect(contract.version).toBe('1.0.0');
    expect(contract.provider).toBe('user-service');
    expect(contract.fields.length).toBe(3);
    expect(contract.description).toBe('User API contract');
    expect(contract.status).toBe('draft');
    expect(contract.consumers).toEqual([]);
    expect(contract.id).toBeTruthy();
    expect(contract.created_at).toBeGreaterThan(0);
    expect(contract.updated_at).toBeGreaterThan(0);
  });

  test('defineContract with consumers', () => {
    const contract = cm.defineContract(
      'order-api',
      '1.0.0',
      'order-service',
      [{ name: 'order_id', type: 'string', required: true }],
      'Order API',
      ['billing-service', 'shipping-service'],
    );

    expect(contract.consumers).toEqual(['billing-service', 'shipping-service']);
  });

  test('defineContract generates unique IDs', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', [], 'desc');
    const c2 = cm.defineContract('api-2', '1.0.0', 'svc-2', [], 'desc');
    expect(c1.id).not.toBe(c2.id);
  });

  test('defineContract with empty description defaults to empty string', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    expect(contract.description).toBe('');
  });

  test('defineContract timestamps are current', () => {
    const before = Date.now();
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    const after = Date.now();
    expect(contract.created_at).toBeGreaterThanOrEqual(before);
    expect(contract.created_at).toBeLessThanOrEqual(after);
    expect(contract.updated_at).toBe(contract.created_at);
  });
});

// ============================================================
// Contract Retrieval
// ============================================================

describe('Contract Retrieval', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('getContract returns contract by ID', () => {
    const created = cm.defineContract('api', '1.0.0', 'svc', [
      { name: 'id', type: 'string', required: true },
    ]);

    const retrieved = cm.getContract(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.name).toBe('api');
  });

  test('getContract returns undefined for nonexistent ID', () => {
    expect(cm.getContract('nonexistent-id')).toBeUndefined();
  });

  test('getContractByName returns contract by name', () => {
    cm.defineContract('user-api', '1.0.0', 'user-svc', []);
    const contract = cm.getContractByName('user-api');
    expect(contract).toBeDefined();
    expect(contract!.name).toBe('user-api');
  });

  test('getContractByName returns undefined for nonexistent name', () => {
    expect(cm.getContractByName('missing')).toBeUndefined();
  });

  test('listContracts returns all contracts when no filter', () => {
    cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    cm.defineContract('api-2', '1.0.0', 'svc-2', []);
    cm.defineContract('api-3', '1.0.0', 'svc-3', []);

    expect(cm.listContracts().length).toBe(3);
  });

  test('listContracts filters by status', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    cm.defineContract('api-2', '1.0.0', 'svc-2', []);
    cm.activateContract(c1.id);

    expect(cm.listContracts('active').length).toBe(1);
    expect(cm.listContracts('draft').length).toBe(1);
  });

  test('listByProvider returns contracts for a specific provider', () => {
    cm.defineContract('api-1', '1.0.0', 'provider-a', []);
    cm.defineContract('api-2', '1.0.0', 'provider-a', []);
    cm.defineContract('api-3', '1.0.0', 'provider-b', []);

    const result = cm.listByProvider('provider-a');
    expect(result.length).toBe(2);
    expect(result.every(c => c.provider === 'provider-a')).toBe(true);
  });

  test('listByProvider returns empty array for unknown provider', () => {
    expect(cm.listByProvider('unknown').length).toBe(0);
  });

  test('listByConsumer returns contracts consumed by a specific module', () => {
    cm.defineContract('api-1', '1.0.0', 'svc-1', [], 'desc', ['consumer-a', 'consumer-b']);
    cm.defineContract('api-2', '1.0.0', 'svc-2', [], 'desc', ['consumer-a']);
    cm.defineContract('api-3', '1.0.0', 'svc-3', [], 'desc', ['consumer-c']);

    const result = cm.listByConsumer('consumer-a');
    expect(result.length).toBe(2);
  });

  test('listByConsumer returns empty array for unknown consumer', () => {
    expect(cm.listByConsumer('unknown').length).toBe(0);
  });
});

// ============================================================
// Contract Updates
// ============================================================

describe('Contract Updates', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('updateContract modifies contract fields', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', [
      { name: 'id', type: 'string', required: true },
    ]);

    const updated = cm.updateContract(contract.id, {
      version: '1.1.0',
      description: 'Updated description',
    });

    expect(updated.version).toBe('1.1.0');
    expect(updated.description).toBe('Updated description');
    expect(updated.name).toBe('api'); // unchanged
  });

  test('updateContract refreshes updated_at timestamp', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    const originalUpdatedAt = contract.updated_at;

    // Small delay to ensure different timestamp
    const updated = cm.updateContract(contract.id, { version: '1.1.0' });
    expect(updated.updated_at).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  test('updateContract throws for nonexistent contract', () => {
    expect(() => {
      cm.updateContract('nonexistent', { version: '2.0.0' });
    }).toThrow();
  });

  test('deprecateContract changes status to deprecated', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    cm.activateContract(contract.id);
    cm.deprecateContract(contract.id);

    const updated = cm.getContract(contract.id);
    expect(updated!.status).toBe('deprecated');
  });

  test('deprecateContract throws for nonexistent contract', () => {
    expect(() => {
      cm.deprecateContract('nonexistent');
    }).toThrow();
  });

  test('activateContract changes status to active', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    cm.activateContract(contract.id);

    const updated = cm.getContract(contract.id);
    expect(updated!.status).toBe('active');
  });

  test('activateContract throws for nonexistent contract', () => {
    expect(() => {
      cm.activateContract('nonexistent');
    }).toThrow();
  });
});

// ============================================================
// Consumer Management
// ============================================================

describe('Consumer Management', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('addConsumer adds a new consumer to the contract', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', []);
    cm.addConsumer(contract.id, 'new-consumer');

    const updated = cm.getContract(contract.id);
    expect(updated!.consumers).toContain('new-consumer');
  });

  test('addConsumer does not duplicate existing consumer', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', [], 'desc', ['existing']);
    cm.addConsumer(contract.id, 'existing');

    const updated = cm.getContract(contract.id);
    expect(updated!.consumers.length).toBe(1);
  });

  test('addConsumer throws for nonexistent contract', () => {
    expect(() => {
      cm.addConsumer('nonexistent', 'consumer');
    }).toThrow();
  });

  test('removeConsumer removes a consumer from the contract', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', [], 'desc', ['a', 'b', 'c']);
    cm.removeConsumer(contract.id, 'b');

    const updated = cm.getContract(contract.id);
    expect(updated!.consumers).toEqual(['a', 'c']);
  });

  test('removeConsumer is safe for nonexistent consumer', () => {
    const contract = cm.defineContract('api', '1.0.0', 'svc', [], 'desc', ['a']);
    cm.removeConsumer(contract.id, 'nonexistent');

    const updated = cm.getContract(contract.id);
    expect(updated!.consumers).toEqual(['a']);
  });

  test('removeConsumer throws for nonexistent contract', () => {
    expect(() => {
      cm.removeConsumer('nonexistent', 'consumer');
    }).toThrow();
  });
});

// ============================================================
// Payload Validation
// ============================================================

describe('Payload Validation', () => {
  let cm: ContractManager;
  let contractId: string;

  beforeEach(() => {
    cm = createContractManager();
    const contract = cm.defineContract('user-api', '1.0.0', 'user-svc', [
      { name: 'id', type: 'string', required: true, description: 'User ID' },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'active', type: 'boolean', required: false },
      { name: 'metadata', type: 'object', required: false },
      { name: 'tags', type: 'array', required: false },
    ]);
    contractId = contract.id;
  });

  test('valid payload passes validation', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      age: 30,
      active: true,
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.contract_id).toBe(contractId);
    expect(result.checked_at).toBeGreaterThan(0);
  });

  test('missing required field produces error', () => {
    const result = cm.validatePayload(contractId, {
      name: 'Alice',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.field === 'id')).toBe(true);
    expect(result.errors[0].severity).toBe('error');
  });

  test('type mismatch produces error', () => {
    const result = cm.validatePayload(contractId, {
      id: 123, // should be string
      name: 'Alice',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'id' && e.expected === 'string')).toBe(true);
  });

  test('unknown fields produce warnings', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      unknown_field: 'surprise',
    });

    expect(result.valid).toBe(true); // warnings don't invalidate
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].field).toBe('unknown_field');
    expect(result.warnings[0].severity).toBe('warning');
  });

  test('optional field with wrong type produces error', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      age: 'thirty', // should be number
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'age')).toBe(true);
  });

  test('object type validates correctly', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      metadata: { key: 'value' },
    });

    expect(result.valid).toBe(true);
  });

  test('array type validates correctly', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      tags: ['admin', 'beta'],
    });

    expect(result.valid).toBe(true);
  });

  test('array type mismatch with non-array produces error', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      tags: 'not-an-array',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'tags')).toBe(true);
  });

  test('object type mismatch with array produces error', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      metadata: [1, 2, 3], // array, not plain object
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'metadata')).toBe(true);
  });

  test('null value for required field produces error', () => {
    const result = cm.validatePayload(contractId, {
      id: null,
      name: 'Alice',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'id')).toBe(true);
  });

  test('undefined value for optional field is ok', () => {
    const result = cm.validatePayload(contractId, {
      id: 'user-123',
      name: 'Alice',
      age: undefined,
    });

    expect(result.valid).toBe(true);
  });

  test('validatePayload throws for nonexistent contract', () => {
    expect(() => {
      cm.validatePayload('nonexistent', { id: '123' });
    }).toThrow();
  });

  test('any type accepts any value', () => {
    const contract = cm.defineContract('flexible-api', '1.0.0', 'svc', [
      { name: 'data', type: 'any', required: true },
    ]);

    const result1 = cm.validatePayload(contract.id, { data: 'string' });
    const result2 = cm.validatePayload(contract.id, { data: 123 });
    const result3 = cm.validatePayload(contract.id, { data: { nested: true } });

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result3.valid).toBe(true);
  });

  test('empty payload against contract with all optional fields is valid', () => {
    const contract = cm.defineContract('optional-api', '1.0.0', 'svc', [
      { name: 'opt1', type: 'string', required: false },
      { name: 'opt2', type: 'number', required: false },
    ]);

    const result = cm.validatePayload(contract.id, {});
    expect(result.valid).toBe(true);
  });

  test('multiple missing required fields all reported', () => {
    const result = cm.validatePayload(contractId, {});

    expect(result.valid).toBe(false);
    const errorFields = result.errors.map(e => e.field);
    expect(errorFields).toContain('id');
    expect(errorFields).toContain('name');
  });
});

// ============================================================
// Field Validation
// ============================================================

describe('Field Validation', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('validateField returns null for valid string field', () => {
    const field: ContractField = { name: 'name', type: 'string', required: true };
    expect(cm.validateField(field, 'hello')).toBeNull();
  });

  test('validateField returns violation for wrong type', () => {
    const field: ContractField = { name: 'name', type: 'string', required: true };
    const violation = cm.validateField(field, 123);
    expect(violation).not.toBeNull();
    expect(violation!.field).toBe('name');
    expect(violation!.expected).toBe('string');
    expect(violation!.actual).toBe('number');
  });

  test('validateField handles number type', () => {
    const field: ContractField = { name: 'count', type: 'number', required: true };
    expect(cm.validateField(field, 42)).toBeNull();
    expect(cm.validateField(field, 'not-a-number')).not.toBeNull();
  });

  test('validateField handles boolean type', () => {
    const field: ContractField = { name: 'active', type: 'boolean', required: true };
    expect(cm.validateField(field, true)).toBeNull();
    expect(cm.validateField(field, false)).toBeNull();
    expect(cm.validateField(field, 'true')).not.toBeNull();
  });

  test('validateField handles object type (non-array, non-null)', () => {
    const field: ContractField = { name: 'meta', type: 'object', required: true };
    expect(cm.validateField(field, { a: 1 })).toBeNull();
    expect(cm.validateField(field, [1, 2])).not.toBeNull(); // array is not object
    expect(cm.validateField(field, null)).not.toBeNull(); // null is not object
  });

  test('validateField handles array type', () => {
    const field: ContractField = { name: 'items', type: 'array', required: true };
    expect(cm.validateField(field, [1, 2, 3])).toBeNull();
    expect(cm.validateField(field, [])).toBeNull();
    expect(cm.validateField(field, { a: 1 })).not.toBeNull();
  });

  test('validateField handles any type', () => {
    const field: ContractField = { name: 'data', type: 'any', required: true };
    expect(cm.validateField(field, 'string')).toBeNull();
    expect(cm.validateField(field, 123)).toBeNull();
    expect(cm.validateField(field, null)).toBeNull();
    expect(cm.validateField(field, undefined)).toBeNull();
  });
});

// ============================================================
// Version Comparison
// ============================================================

describe('Version Comparison', () => {
  let cm: ContractManager;
  let contractId: string;

  beforeEach(() => {
    cm = createContractManager();
    const contract = cm.defineContract('api', '1.0.0', 'svc', [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ], 'API contract');
    contractId = contract.id;
  });

  test('compareVersions detects added fields', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'email', type: 'string', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    expect(record.changes.some(c => c.type === 'added' && c.field === 'email')).toBe(true);
    expect(record.changes.find(c => c.field === 'email')!.breaking).toBe(false); // optional added
  });

  test('compareVersions detects added required field as breaking', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'email', type: 'string', required: true }, // required = breaking
    ];

    const record = cm.compareVersions(contractId, newFields);
    expect(record.changes.find(c => c.field === 'email')!.breaking).toBe(true);
  });

  test('compareVersions detects removed fields', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      // 'name' removed
      { name: 'age', type: 'number', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    expect(record.changes.some(c => c.type === 'removed' && c.field === 'name')).toBe(true);
  });

  test('compareVersions marks removed required field as breaking', () => {
    const newFields: ContractField[] = [
      // 'id' removed (was required)
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    const removal = record.changes.find(c => c.field === 'id' && c.type === 'removed');
    expect(removal).toBeDefined();
    expect(removal!.breaking).toBe(true);
  });

  test('compareVersions detects type changes as breaking', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'number', required: true }, // was string
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    const modification = record.changes.find(c => c.field === 'id' && c.type === 'modified');
    expect(modification).toBeDefined();
    expect(modification!.breaking).toBe(true);
  });

  test('compareVersions detects required flag change (optional to required) as breaking', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: true }, // was optional
    ];

    const record = cm.compareVersions(contractId, newFields);
    const modification = record.changes.find(c => c.field === 'age' && c.type === 'modified');
    expect(modification).toBeDefined();
    expect(modification!.breaking).toBe(true);
  });

  test('compareVersions detects required to optional change as non-breaking', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: false }, // was required
      { name: 'age', type: 'number', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    const modification = record.changes.find(c => c.field === 'name' && c.type === 'modified');
    expect(modification).toBeDefined();
    expect(modification!.breaking).toBe(false);
  });

  test('compareVersions with no changes returns empty changes', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    expect(record.changes.length).toBe(0);
  });

  test('compareVersions records contract_id and version info', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'email', type: 'string', required: false },
    ];

    const record = cm.compareVersions(contractId, newFields);
    expect(record.contract_id).toBe(contractId);
    expect(record.from_version).toBe('1.0.0');
    expect(record.timestamp).toBeGreaterThan(0);
  });

  test('compareVersions throws for nonexistent contract', () => {
    expect(() => {
      cm.compareVersions('nonexistent', []);
    }).toThrow();
  });

  test('compareVersions is recorded in change history', () => {
    const newFields: ContractField[] = [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'email', type: 'string', required: false },
    ];

    cm.compareVersions(contractId, newFields);

    const history = cm.getChangeHistory(contractId);
    expect(history.length).toBe(1);
    expect(history[0].contract_id).toBe(contractId);
  });
});

// ============================================================
// Change History
// ============================================================

describe('Change History', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('getChangeHistory returns empty array initially', () => {
    expect(cm.getChangeHistory().length).toBe(0);
  });

  test('getChangeHistory filters by contract_id', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', [
      { name: 'id', type: 'string', required: true },
    ]);
    const c2 = cm.defineContract('api-2', '1.0.0', 'svc-2', [
      { name: 'name', type: 'string', required: true },
    ]);

    cm.compareVersions(c1.id, [
      { name: 'id', type: 'string', required: true },
      { name: 'email', type: 'string', required: false },
    ]);
    cm.compareVersions(c2.id, [
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false },
    ]);

    const history1 = cm.getChangeHistory(c1.id);
    const history2 = cm.getChangeHistory(c2.id);
    const allHistory = cm.getChangeHistory();

    expect(history1.length).toBe(1);
    expect(history2.length).toBe(1);
    expect(allHistory.length).toBe(2);
  });

  test('getChangeHistory returns all records without filter', () => {
    const c = cm.defineContract('api', '1.0.0', 'svc', [
      { name: 'id', type: 'string', required: true },
    ]);

    cm.compareVersions(c.id, [
      { name: 'id', type: 'string', required: true },
      { name: 'extra', type: 'string', required: false },
    ]);

    cm.compareVersions(c.id, [
      { name: 'id', type: 'string', required: true },
      { name: 'extra', type: 'string', required: false },
      { name: 'more', type: 'number', required: false },
    ]);

    expect(cm.getChangeHistory().length).toBe(2);
  });
});

// ============================================================
// Consistency Report
// ============================================================

describe('Consistency Report', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('getConsistencyReport with no contracts', () => {
    const report = cm.getConsistencyReport();
    expect(report.total_contracts).toBe(0);
    expect(report.active).toBe(0);
    expect(report.broken).toBe(0);
    expect(report.deprecated).toBe(0);
    expect(report.consistency_pct).toBe(100);
  });

  test('getConsistencyReport counts contracts by status', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    const c2 = cm.defineContract('api-2', '1.0.0', 'svc-2', []);
    const c3 = cm.defineContract('api-3', '1.0.0', 'svc-3', []);

    cm.activateContract(c1.id);
    cm.activateContract(c2.id);
    cm.deprecateContract(c3.id);

    const report = cm.getConsistencyReport();
    expect(report.total_contracts).toBe(3);
    expect(report.active).toBe(2);
    expect(report.deprecated).toBe(1);
    expect(report.broken).toBe(0);
  });

  test('getConsistencyReport calculates consistency percentage', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    const c2 = cm.defineContract('api-2', '1.0.0', 'svc-2', []);

    cm.activateContract(c1.id);
    cm.activateContract(c2.id);

    // Manually mark one as broken
    cm.updateContract(c2.id, { status: 'broken' });

    const report = cm.getConsistencyReport();
    expect(report.broken).toBe(1);
    expect(report.consistency_pct).toBe(50); // 1 of 2 active/broken is broken
  });
});

// ============================================================
// Check All Contracts
// ============================================================

describe('Check All Contracts', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('checkAllContracts returns validation results for active contracts', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', [
      { name: 'id', type: 'string', required: true },
    ]);
    const c2 = cm.defineContract('api-2', '1.0.0', 'svc-2', [
      { name: 'name', type: 'string', required: true },
    ]);

    cm.activateContract(c1.id);
    cm.activateContract(c2.id);

    const results = cm.checkAllContracts();
    expect(results.size).toBe(2);

    for (const [, result] of results) {
      expect(result.valid).toBe(true);
    }
  });

  test('checkAllContracts skips non-active contracts', () => {
    const c1 = cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    cm.defineContract('api-2', '1.0.0', 'svc-2', []); // draft

    cm.activateContract(c1.id);

    const results = cm.checkAllContracts();
    expect(results.size).toBe(1);
  });

  test('checkAllContracts returns empty map when no active contracts', () => {
    cm.defineContract('api-1', '1.0.0', 'svc-1', []); // draft
    const results = cm.checkAllContracts();
    expect(results.size).toBe(0);
  });
});

// ============================================================
// Reset
// ============================================================

describe('Reset', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('reset clears all contracts', () => {
    cm.defineContract('api-1', '1.0.0', 'svc-1', []);
    cm.defineContract('api-2', '1.0.0', 'svc-2', []);
    cm.reset();

    expect(cm.listContracts().length).toBe(0);
  });

  test('reset clears change history', () => {
    const c = cm.defineContract('api', '1.0.0', 'svc', [
      { name: 'id', type: 'string', required: true },
    ]);
    cm.compareVersions(c.id, [
      { name: 'id', type: 'string', required: true },
      { name: 'extra', type: 'string', required: false },
    ]);

    cm.reset();
    expect(cm.getChangeHistory().length).toBe(0);
  });

  test('reset allows fresh contract creation', () => {
    cm.defineContract('api', '1.0.0', 'svc', []);
    cm.reset();
    const contract = cm.defineContract('api-new', '1.0.0', 'svc-new', []);
    expect(contract.name).toBe('api-new');
    expect(cm.listContracts().length).toBe(1);
  });
});

// ============================================================
// Singleton Behavior
// ============================================================

describe('Singleton Behavior', () => {
  test('global contractManager singleton persists state', () => {
    contractManager.reset();
    contractManager.defineContract('singleton-test', '1.0.0', 'svc', []);
    expect(contractManager.listContracts().length).toBe(1);
    contractManager.reset();
  });

  test('multiple uses of global contractManager reference same instance', () => {
    contractManager.reset();
    contractManager.defineContract('test-1', '1.0.0', 'svc-1', []);
    contractManager.defineContract('test-2', '1.0.0', 'svc-2', []);
    expect(contractManager.listContracts().length).toBe(2);
    contractManager.reset();
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('Integration Tests', () => {
  let cm: ContractManager;

  beforeEach(() => {
    cm = createContractManager();
  });

  test('complete contract lifecycle', () => {
    // 1. Define contract
    const contract = cm.defineContract('order-api', '1.0.0', 'order-service', [
      { name: 'order_id', type: 'string', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'currency', type: 'string', required: true },
      { name: 'notes', type: 'string', required: false },
    ], 'Order creation API');

    expect(contract.status).toBe('draft');

    // 2. Add consumers
    cm.addConsumer(contract.id, 'billing-service');
    cm.addConsumer(contract.id, 'shipping-service');

    // 3. Activate
    cm.activateContract(contract.id);
    expect(cm.getContract(contract.id)!.status).toBe('active');

    // 4. Validate a good payload
    const goodResult = cm.validatePayload(contract.id, {
      order_id: 'ORD-001',
      amount: 99.99,
      currency: 'USD',
    });
    expect(goodResult.valid).toBe(true);

    // 5. Validate a bad payload
    const badResult = cm.validatePayload(contract.id, {
      order_id: 123, // wrong type
      // missing amount and currency
    });
    expect(badResult.valid).toBe(false);
    expect(badResult.errors.length).toBeGreaterThanOrEqual(2);

    // 6. Compare with new version
    const comparison = cm.compareVersions(contract.id, [
      { name: 'order_id', type: 'string', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'currency', type: 'string', required: true },
      { name: 'notes', type: 'string', required: false },
      { name: 'customer_id', type: 'string', required: true }, // breaking: new required
    ]);
    expect(comparison.changes.some(c => c.breaking)).toBe(true);

    // 7. Check history
    expect(cm.getChangeHistory(contract.id).length).toBe(1);

    // 8. Deprecate
    cm.deprecateContract(contract.id);
    expect(cm.getContract(contract.id)!.status).toBe('deprecated');

    // 9. Consistency report
    const report = cm.getConsistencyReport();
    expect(report.total_contracts).toBe(1);
    expect(report.deprecated).toBe(1);
  });

  test('multi-contract provider-consumer graph', () => {
    cm.defineContract('user-api', '1.0.0', 'user-svc', [
      { name: 'user_id', type: 'string', required: true },
    ], 'User API', ['order-svc', 'auth-svc']);

    cm.defineContract('order-api', '1.0.0', 'order-svc', [
      { name: 'order_id', type: 'string', required: true },
    ], 'Order API', ['billing-svc']);

    cm.defineContract('auth-api', '1.0.0', 'auth-svc', [
      { name: 'token', type: 'string', required: true },
    ], 'Auth API', ['user-svc', 'order-svc']);

    // Provider queries
    expect(cm.listByProvider('user-svc').length).toBe(1);
    expect(cm.listByProvider('auth-svc').length).toBe(1);

    // Consumer queries
    expect(cm.listByConsumer('order-svc').length).toBe(2); // consumes user-api and auth-api
    expect(cm.listByConsumer('auth-svc').length).toBe(1); // consumes user-api
  });
});
