/**
 * Honeycomb v2 - Contract Manager
 *
 * Manages interface contracts between modules and sub-honeycombs.
 * Ensures API compatibility, tracks contract versions, and detects
 * breaking changes to maintain 100% inter-module consistency.
 *
 * Architecture principle #3: Contract-First - parallel agents must
 * establish interface contracts before independent execution.
 */

import crypto from 'node:crypto';

// ============================================================
// Type Definitions
// ============================================================

/** Lifecycle status of a contract */
export type ContractStatus = 'draft' | 'active' | 'deprecated' | 'broken';

/** A single field within a contract definition */
export interface ContractField {
  name: string;
  type: string; // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  required: boolean;
  description?: string;
}

/** Complete contract definition between a provider and its consumers */
export interface ContractDefinition {
  id: string;
  name: string;
  version: string; // semver-like: "1.0.0"
  status: ContractStatus;
  provider: string; // Module/sub-honeycomb providing this interface
  consumers: string[]; // Modules/sub-honeycombs consuming this interface
  fields: ContractField[];
  description: string;
  created_at: number;
  updated_at: number;
}

/** Result of validating a payload against a contract */
export interface ContractValidationResult {
  contract_id: string;
  valid: boolean;
  errors: ContractViolation[];
  warnings: ContractViolation[];
  checked_at: number;
}

/** A single violation discovered during validation */
export interface ContractViolation {
  field: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Record of changes between two versions of a contract */
export interface ContractChangeRecord {
  contract_id: string;
  from_version: string;
  to_version: string;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    field: string;
    details: string;
    breaking: boolean;
  }>;
  timestamp: number;
}

// ============================================================
// Supported Field Types
// ============================================================

const SUPPORTED_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'any']);

// ============================================================
// ContractManager
// ============================================================

export class ContractManager {
  /** All registered contracts keyed by ID */
  private contracts: Map<string, ContractDefinition> = new Map();

  /** Chronological history of all version comparisons */
  private change_history: ContractChangeRecord[] = [];

  // ----------------------------------------------------------
  // Contract Definition
  // ----------------------------------------------------------

  /**
   * Define a new contract between a provider and optional consumers.
   * The contract starts in 'draft' status and must be explicitly activated.
   *
   * @param name        - Human-readable contract name
   * @param version     - Semver-like version string (e.g. "1.0.0")
   * @param provider    - Module or sub-honeycomb providing this interface
   * @param fields      - Array of field definitions
   * @param description - Optional description of the contract's purpose
   * @param consumers   - Optional array of consuming module names
   * @returns The newly created ContractDefinition
   */
  defineContract(
    name: string,
    version: string,
    provider: string,
    fields: ContractField[],
    description: string = '',
    consumers: string[] = [],
  ): ContractDefinition {
    const now = Date.now();
    const contract: ContractDefinition = {
      id: crypto.randomUUID(),
      name,
      version,
      status: 'draft',
      provider,
      consumers: [...consumers],
      fields: [...fields],
      description,
      created_at: now,
      updated_at: now,
    };

    this.contracts.set(contract.id, contract);
    return contract;
  }

  // ----------------------------------------------------------
  // Contract Retrieval
  // ----------------------------------------------------------

  /**
   * Retrieve a contract by its unique ID.
   * @returns The contract definition, or undefined if not found.
   */
  getContract(contractId: string): ContractDefinition | undefined {
    return this.contracts.get(contractId);
  }

  /**
   * Retrieve a contract by its human-readable name.
   * If multiple contracts share the same name, the first match is returned.
   * @returns The contract definition, or undefined if not found.
   */
  getContractByName(name: string): ContractDefinition | undefined {
    for (const contract of this.contracts.values()) {
      if (contract.name === name) {
        return contract;
      }
    }
    return undefined;
  }

  /**
   * List all contracts, optionally filtered by status.
   * @param status - If provided, only contracts with this status are returned.
   * @returns Array of matching contract definitions.
   */
  listContracts(status?: ContractStatus): ContractDefinition[] {
    const all = Array.from(this.contracts.values());
    if (status === undefined) {
      return all;
    }
    return all.filter((c) => c.status === status);
  }

  /**
   * List all contracts provided by a specific module.
   * @param provider - Provider module name.
   * @returns Array of contract definitions from this provider.
   */
  listByProvider(provider: string): ContractDefinition[] {
    return Array.from(this.contracts.values()).filter(
      (c) => c.provider === provider,
    );
  }

  /**
   * List all contracts consumed by a specific module.
   * @param consumer - Consumer module name.
   * @returns Array of contract definitions consumed by this module.
   */
  listByConsumer(consumer: string): ContractDefinition[] {
    return Array.from(this.contracts.values()).filter((c) =>
      c.consumers.includes(consumer),
    );
  }

  // ----------------------------------------------------------
  // Contract Updates
  // ----------------------------------------------------------

  /**
   * Update an existing contract with partial changes.
   * Automatically refreshes the `updated_at` timestamp.
   *
   * @param contractId - ID of the contract to update.
   * @param updates    - Partial fields to merge into the contract.
   * @returns The updated contract definition.
   * @throws Error if the contract does not exist.
   */
  updateContract(
    contractId: string,
    updates: Partial<ContractDefinition>,
  ): ContractDefinition {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }

    // Apply updates (excluding id and created_at which are immutable)
    const { id: _id, created_at: _created, ...safeUpdates } = updates;

    Object.assign(contract, safeUpdates, { updated_at: Date.now() });

    return contract;
  }

  /**
   * Transition a contract to 'deprecated' status.
   * @param contractId - ID of the contract to deprecate.
   * @throws Error if the contract does not exist.
   */
  deprecateContract(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    contract.status = 'deprecated';
    contract.updated_at = Date.now();
  }

  /**
   * Transition a contract to 'active' status.
   * @param contractId - ID of the contract to activate.
   * @throws Error if the contract does not exist.
   */
  activateContract(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    contract.status = 'active';
    contract.updated_at = Date.now();
  }

  // ----------------------------------------------------------
  // Consumer Management
  // ----------------------------------------------------------

  /**
   * Add a consumer to a contract's consumer list.
   * Duplicate consumers are silently ignored.
   *
   * @param contractId - ID of the contract.
   * @param consumer   - Name of the consuming module.
   * @throws Error if the contract does not exist.
   */
  addConsumer(contractId: string, consumer: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    if (!contract.consumers.includes(consumer)) {
      contract.consumers.push(consumer);
      contract.updated_at = Date.now();
    }
  }

  /**
   * Remove a consumer from a contract's consumer list.
   * Removing a non-existent consumer is a no-op.
   *
   * @param contractId - ID of the contract.
   * @param consumer   - Name of the consuming module to remove.
   * @throws Error if the contract does not exist.
   */
  removeConsumer(contractId: string, consumer: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    const index = contract.consumers.indexOf(consumer);
    if (index !== -1) {
      contract.consumers.splice(index, 1);
      contract.updated_at = Date.now();
    }
  }

  // ----------------------------------------------------------
  // Payload Validation
  // ----------------------------------------------------------

  /**
   * Validate a payload against a contract's field definitions.
   *
   * - Missing required fields produce errors.
   * - Type mismatches produce errors.
   * - Unknown fields (not in the contract) produce warnings.
   * - A result with zero errors is considered valid (warnings are informational).
   *
   * @param contractId - ID of the contract to validate against.
   * @param payload    - Key-value payload to check.
   * @returns Validation result with errors and warnings.
   * @throws Error if the contract does not exist.
   */
  validatePayload(
    contractId: string,
    payload: Record<string, unknown>,
  ): ContractValidationResult {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }

    const errors: ContractViolation[] = [];
    const warnings: ContractViolation[] = [];

    // Build a set of known field names for unknown-field detection
    const knownFields = new Set(contract.fields.map((f) => f.name));

    // Check each defined field against the payload
    for (const field of contract.fields) {
      const value = payload[field.name];

      // Check for missing required fields
      if (value === undefined || value === null) {
        if (field.required) {
          errors.push({
            field: field.name,
            expected: field.type,
            actual: value === null ? 'null' : 'undefined',
            severity: 'error',
            message: `Required field '${field.name}' is ${value === null ? 'null' : 'missing'}`,
          });
        }
        continue;
      }

      // Type validation
      const violation = this.validateField(field, value);
      if (violation) {
        errors.push(violation);
      }
    }

    // Check for unknown fields
    for (const key of Object.keys(payload)) {
      if (!knownFields.has(key)) {
        // Skip undefined values in the payload (they are effectively absent)
        if (payload[key] === undefined) {
          continue;
        }
        warnings.push({
          field: key,
          expected: 'not defined in contract',
          actual: typeof payload[key],
          severity: 'warning',
          message: `Unknown field '${key}' is not defined in contract '${contract.name}'`,
        });
      }
    }

    return {
      contract_id: contractId,
      valid: errors.length === 0,
      errors,
      warnings,
      checked_at: Date.now(),
    };
  }

  /**
   * Validate a single field's value against its type definition.
   *
   * @param field - The field definition to validate against.
   * @param value - The actual value to check.
   * @returns A ContractViolation if the value doesn't match, or null if valid.
   */
  validateField(field: ContractField, value: unknown): ContractViolation | null {
    // 'any' type always passes
    if (field.type === 'any') {
      return null;
    }

    const actualType = this.getValueType(value);

    if (actualType !== field.type) {
      return {
        field: field.name,
        expected: field.type,
        actual: actualType,
        severity: 'error',
        message: `Field '${field.name}' expected type '${field.type}' but got '${actualType}'`,
      };
    }

    return null;
  }

  // ----------------------------------------------------------
  // Version Comparison
  // ----------------------------------------------------------

  /**
   * Compare the current contract fields with a proposed set of new fields.
   * Detects added, removed, and modified fields and determines which changes
   * are breaking.
   *
   * Breaking changes:
   * - Removing a required field
   * - Removing an optional field (consumers may depend on it)
   * - Changing a field's type
   * - Making an optional field required
   * - Adding a new required field (existing consumers won't provide it)
   *
   * Non-breaking changes:
   * - Adding a new optional field
   * - Making a required field optional (relaxation)
   *
   * The comparison is recorded in the change history.
   *
   * @param contractId - ID of the contract to compare against.
   * @param newFields  - Proposed new set of fields.
   * @returns A change record documenting all differences.
   * @throws Error if the contract does not exist.
   */
  compareVersions(
    contractId: string,
    newFields: ContractField[],
  ): ContractChangeRecord {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }

    const changes: ContractChangeRecord['changes'] = [];

    // Build lookup maps by field name
    const currentMap = new Map<string, ContractField>();
    for (const f of contract.fields) {
      currentMap.set(f.name, f);
    }

    const newMap = new Map<string, ContractField>();
    for (const f of newFields) {
      newMap.set(f.name, f);
    }

    // Detect removed fields (in current but not in new)
    for (const [name, currentField] of currentMap) {
      if (!newMap.has(name)) {
        changes.push({
          type: 'removed',
          field: name,
          details: `Field '${name}' (${currentField.type}, ${currentField.required ? 'required' : 'optional'}) was removed`,
          breaking: currentField.required, // Removing a required field is always breaking
        });
      }
    }

    // Detect added and modified fields
    for (const [name, newField] of newMap) {
      const currentField = currentMap.get(name);

      if (!currentField) {
        // New field added
        changes.push({
          type: 'added',
          field: name,
          details: `Field '${name}' (${newField.type}, ${newField.required ? 'required' : 'optional'}) was added`,
          breaking: newField.required, // Adding a required field is breaking
        });
      } else {
        // Existing field - check for modifications
        const typeChanged = currentField.type !== newField.type;
        const requiredChanged = currentField.required !== newField.required;

        if (typeChanged || requiredChanged) {
          // Determine if it's a breaking change
          let breaking = false;

          if (typeChanged) {
            // Type changes are always breaking
            breaking = true;
          }

          if (requiredChanged) {
            if (!currentField.required && newField.required) {
              // optional -> required is breaking
              breaking = true;
            }
            // required -> optional is non-breaking (relaxation)
          }

          const detailParts: string[] = [];
          if (typeChanged) {
            detailParts.push(`type: ${currentField.type} -> ${newField.type}`);
          }
          if (requiredChanged) {
            detailParts.push(
              `required: ${currentField.required} -> ${newField.required}`,
            );
          }

          changes.push({
            type: 'modified',
            field: name,
            details: `Field '${name}' changed: ${detailParts.join(', ')}`,
            breaking,
          });
        }
      }
    }

    const record: ContractChangeRecord = {
      contract_id: contractId,
      from_version: contract.version,
      to_version: '', // Caller determines the new version
      changes,
      timestamp: Date.now(),
    };

    // Record in history
    this.change_history.push(record);

    return record;
  }

  // ----------------------------------------------------------
  // Change History
  // ----------------------------------------------------------

  /**
   * Retrieve change history records, optionally filtered by contract ID.
   *
   * @param contractId - If provided, only records for this contract are returned.
   * @returns Array of change records in chronological order.
   */
  getChangeHistory(contractId?: string): ContractChangeRecord[] {
    if (contractId === undefined) {
      return [...this.change_history];
    }
    return this.change_history.filter((r) => r.contract_id === contractId);
  }

  // ----------------------------------------------------------
  // Consistency Report
  // ----------------------------------------------------------

  /**
   * Generate a summary report of all contracts and their health.
   *
   * The consistency percentage is calculated as:
   *   (active / (active + broken)) * 100
   * If there are no active or broken contracts, consistency is 100%.
   *
   * @returns Summary object with counts and consistency percentage.
   */
  getConsistencyReport(): {
    total_contracts: number;
    active: number;
    broken: number;
    deprecated: number;
    consistency_pct: number;
  } {
    let active = 0;
    let broken = 0;
    let deprecated = 0;

    for (const contract of this.contracts.values()) {
      switch (contract.status) {
        case 'active':
          active++;
          break;
        case 'broken':
          broken++;
          break;
        case 'deprecated':
          deprecated++;
          break;
      }
    }

    const denominator = active + broken;
    const consistency_pct =
      denominator === 0 ? 100 : Math.round((active / denominator) * 100);

    return {
      total_contracts: this.contracts.size,
      active,
      broken,
      deprecated,
      consistency_pct,
    };
  }

  // ----------------------------------------------------------
  // Structural Checks
  // ----------------------------------------------------------

  /**
   * Check all active contracts for structural integrity.
   * Verifies that each active contract's field definitions are internally
   * consistent (valid types, no duplicate field names, etc.).
   *
   * @returns Map of contract ID to validation result for all active contracts.
   */
  checkAllContracts(): Map<string, ContractValidationResult> {
    const results = new Map<string, ContractValidationResult>();

    for (const contract of this.contracts.values()) {
      if (contract.status !== 'active') {
        continue;
      }

      const errors: ContractViolation[] = [];
      const warnings: ContractViolation[] = [];

      // Check for duplicate field names
      const fieldNames = new Set<string>();
      for (const field of contract.fields) {
        if (fieldNames.has(field.name)) {
          errors.push({
            field: field.name,
            expected: 'unique field name',
            actual: 'duplicate',
            severity: 'error',
            message: `Duplicate field name '${field.name}' in contract '${contract.name}'`,
          });
        }
        fieldNames.add(field.name);

        // Check for valid type
        if (!SUPPORTED_TYPES.has(field.type)) {
          errors.push({
            field: field.name,
            expected: `one of: ${Array.from(SUPPORTED_TYPES).join(', ')}`,
            actual: field.type,
            severity: 'error',
            message: `Unknown type '${field.type}' for field '${field.name}' in contract '${contract.name}'`,
          });
        }
      }

      // Check for empty provider
      if (!contract.provider) {
        warnings.push({
          field: 'provider',
          expected: 'non-empty string',
          actual: 'empty',
          severity: 'warning',
          message: `Contract '${contract.name}' has no provider specified`,
        });
      }

      results.set(contract.id, {
        contract_id: contract.id,
        valid: errors.length === 0,
        errors,
        warnings,
        checked_at: Date.now(),
      });
    }

    return results;
  }

  // ----------------------------------------------------------
  // Housekeeping
  // ----------------------------------------------------------

  /**
   * Clear all contracts and change history.
   * Returns the manager to its initial empty state.
   */
  reset(): void {
    this.contracts.clear();
    this.change_history.length = 0;
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Determine the contract-level type string for a runtime value.
   * Distinguishes between 'object', 'array', and 'null' (which are all
   * typeof 'object' in JavaScript).
   */
  private getValueType(value: unknown): string {
    if (value === null) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    return typeof value;
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new ContractManager instance.
 */
export function createContractManager(): ContractManager {
  return new ContractManager();
}

/**
 * Global contract manager singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const contractManager: ContractManager = createContractManager();
