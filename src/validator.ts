import { SETUP_ENTITIES, getSetupEntity, getAction } from "./schema.js";

const ENTITY_TYPES = new Set(SETUP_ENTITIES.map((e) => e.type));

export interface ValidationError {
  readonly line: number;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly definedLabels: readonly string[];
}

/**
 * Validates an FBDL script for structural correctness.
 * Checks: label definitions before use, known actions/entities, required params,
 * enum values, and basic syntax.
 */
export function validate(script: string): ValidationResult {
  const lines = script
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const errors: ValidationError[] = [];
  const definedLabels = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const lineNum = i + 1;

    if (line.startsWith("[setup]")) {
      validateSetupLine(line, lineNum, definedLabels, errors);
    } else {
      validateActionLine(line, lineNum, definedLabels, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    definedLabels: [...definedLabels],
  };
}

function validateSetupLine(
  line: string,
  lineNum: number,
  definedLabels: Set<string>,
  errors: ValidationError[],
): void {
  const content = line.slice("[setup]".length).trim();
  if (content.length === 0) {
    errors.push({ line: lineNum, message: "Empty setup block." });
    return;
  }

  const tokens = tokenize(content);
  const declarations = splitSetupDeclarations(tokens, ENTITY_TYPES);

  for (const decl of declarations) {
    if (decl.length === 0) continue;

    const typeName = decl[0];
    if (typeName === undefined) continue;

    const entity = getSetupEntity(typeName);
    if (entity === undefined) {
      errors.push({ line: lineNum, message: `Unknown setup entity type: "${typeName}".` });
      continue;
    }

    if (entity.hasLabel) {
      if (decl.length < 2 || decl[1] === "with") {
        errors.push({ line: lineNum, message: `Setup ${typeName} requires a label.` });
        continue;
      }
      const label = decl[1];
      if (label === undefined) continue;
      definedLabels.add(label);
    }

    // Check for "with { ... }" keyword params
    const withIdx = decl.indexOf("with");
    if (withIdx !== -1) {
      const paramsStr = decl.slice(withIdx + 1).join(" ");
      const params = parseKeywordBlock(paramsStr);
      if (params === null) {
        errors.push({ line: lineNum, message: `Malformed keyword block in ${typeName} setup.` });
        continue;
      }
      validateParams(entity.params, params, lineNum, typeName, errors);
    } else if (entity.params.some((p) => p.required)) {
      // Check if required params are missing
      const missing = entity.params.filter((p) => p.required).map((p) => p.name);
      if (entity.type !== "User") {
        errors.push({
          line: lineNum,
          message: `Setup ${typeName} missing required params: ${missing.join(", ")}.`,
        });
      }
    }
  }
}

function validateActionLine(
  line: string,
  lineNum: number,
  definedLabels: Set<string>,
  errors: ValidationError[],
): void {
  const tokens = tokenize(line);
  if (tokens.length < 2) {
    errors.push({ line: lineNum, message: "Action line too short." });
    return;
  }

  // Find the action name — skip Subject [as Subject] prefix
  let actionIdx = 1;
  if (tokens[1] === "as" && tokens.length > 3) {
    actionIdx = 3;
  }

  const actionName = tokens[actionIdx];
  if (actionName === undefined) {
    errors.push({ line: lineNum, message: "Could not find action name." });
    return;
  }

  const action = getAction(actionName);
  if (action === undefined) {
    errors.push({ line: lineNum, message: `Unknown action: "${actionName}".` });
    return;
  }

  // Voice switcher check
  if (tokens[1] === "as" && !action.supportsVoiceSwitcher) {
    errors.push({
      line: lineNum,
      message: `Action "${actionName}" does not support voice switcher (as).`,
    });
  }

  // Check for label after action name
  const labelIdx = actionIdx + 1;
  if (labelIdx < tokens.length) {
    const label = tokens[labelIdx];
    if (label !== undefined && label !== "with") {
      definedLabels.add(label);
    }
  }

  // Check keyword params
  const withIdx = tokens.indexOf("with");
  if (withIdx !== -1) {
    const paramsStr = tokens.slice(withIdx + 1).join(" ");
    const params = parseKeywordBlock(paramsStr);
    if (params === null) {
      errors.push({ line: lineNum, message: `Malformed keyword block in "${actionName}".` });
      return;
    }
    validateParams(action.keywordParams, params, lineNum, actionName, errors);
  } else if (action.keywordParams.some((p) => p.required)) {
    const missing = action.keywordParams.filter((p) => p.required).map((p) => p.name);
    errors.push({
      line: lineNum,
      message: `Action "${actionName}" missing required params: ${missing.join(", ")}.`,
    });
  }
}

function validateParams(
  schema: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly values?: readonly string[];
    readonly isList?: boolean;
  }[],
  provided: Map<string, string>,
  lineNum: number,
  context: string,
  errors: ValidationError[],
): void {
  const schemaMap = new Map(schema.map((p) => [p.name, p]));

  // Check required params present
  for (const param of schema) {
    if (param.required && !provided.has(param.name)) {
      errors.push({
        line: lineNum,
        message: `${context}: missing required param "${param.name}".`,
      });
    }
  }

  // Check unknown params
  for (const [key] of provided) {
    if (!schemaMap.has(key)) {
      errors.push({
        line: lineNum,
        message: `${context}: unknown param "${key}".`,
      });
    }
  }

  // Check enum values
  for (const [key, value] of provided) {
    const param = schemaMap.get(key);
    if (param?.values !== undefined) {
      const values = param.isList === true ? parseListValues(value) : [value];
      for (const v of values) {
        if (!param.values.includes(v)) {
          errors.push({
            line: lineNum,
            message: `${context}: param "${key}" invalid value "${v}". Expected: ${param.values.join(" | ")}.`,
          });
        }
      }
    }
  }
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

function tokenize(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let inBraces = 0;
  let inQuote = false;

  for (const ch of input) {
    if (ch === "'" && inBraces > 0) {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === "{" && !inQuote) {
      inBraces++;
      current += ch;
    } else if (ch === "}" && !inQuote) {
      inBraces--;
      current += ch;
    } else if (ch === " " && inBraces === 0 && !inQuote) {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function splitSetupDeclarations(tokens: string[], entityTypes: Set<string>): string[][] {
  const result: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (entityTypes.has(token) && current.length > 0) {
      result.push(current);
      current = [token];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

/**
 * Parses a `{key: value, key2: [a, b]}` block into a Map.
 * Returns null on malformed input.
 */
function parseKeywordBlock(raw: string): Map<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return new Map();

  const params = new Map<string, string>();
  // Split on commas that are not inside brackets or quotes
  const pairs = splitTopLevel(inner, ",");

  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) return null;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    if (key.length === 0) return null;
    params.set(key, value);
  }

  return params;
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;

  for (const ch of input) {
    if (ch === "'" && depth === 0) {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === "[" && !inQuote) {
      depth++;
      current += ch;
    } else if (ch === "]" && !inQuote) {
      depth--;
      current += ch;
    } else if (ch === delimiter && depth === 0 && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function parseListValues(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [trimmed];
}
