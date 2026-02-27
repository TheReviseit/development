/**
 * Feature Registry Validation Script
 * =====================================
 * Validates consistency between TypeScript feature registry and SQL seed file.
 *
 * Checks:
 *   1. All SQL features exist in registry
 *   2. All registry features exist in SQL (warning only)
 *   3. No duplicate feature keys
 *   4. Feature key naming conventions
 *
 * Usage:
 *   node scripts/validate-registry.js
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const REGISTRY_PATH = path.join(__dirname, '../shared/features/registry.ts');
const SEED_SQL_PATH = path.join(__dirname, '../backend/migrations/seed_plan_features.sql');
const GENERATED_JSON_PATH = path.join(__dirname, '../backend/features_registry.json');

// =============================================================================
// Validation Functions
// =============================================================================

function extractFeatureKeysFromSQL(sqlContent) {
  /**
   * Extract feature keys from SQL INSERT statements.
   * Looks for patterns like: ('create_product', ...)
   */
  const featureKeyPattern = /\('([a-z_]+)',\s*\d+,/g;
  const matches = [...sqlContent.matchAll(featureKeyPattern)];
  const features = matches.map(m => m[1]);

  // Remove duplicates
  return [...new Set(features)];
}

function extractFeatureKeysFromRegistry(registryContent) {
  /**
   * Extract feature keys from TypeScript registry.
   * Looks for object keys in FEATURES = { ... }
   */
  const featureKeyPattern = /^\s*(\w+):\s*\{/gm;
  const matches = [...registryContent.matchAll(featureKeyPattern)];
  return matches.map(m => m[1]);
}

function validateNamingConvention(featureKey) {
  /**
   * Validate feature key naming convention:
   *   - Lowercase only
   *   - Snake_case (underscores allowed)
   *   - No numbers at start
   *   - 3-50 characters
   */
  const pattern = /^[a-z][a-z_]{2,49}$/;
  return pattern.test(featureKey);
}

// =============================================================================
// Main Validation
// =============================================================================

function main() {
  console.log('=' .repeat(70));
  console.log('Feature Registry Validation');
  console.log('='.repeat(70));
  console.log();

  let hasErrors = false;

  // ========================================
  // Step 1: Read files
  // ========================================
  console.log('📂 Reading files...');

  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`❌ Registry file not found: ${REGISTRY_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(SEED_SQL_PATH)) {
    console.error(`❌ Seed SQL file not found: ${SEED_SQL_PATH}`);
    process.exit(1);
  }

  const registryContent = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const sqlContent = fs.readFileSync(SEED_SQL_PATH, 'utf8');

  // ========================================
  // Step 2: Extract feature keys
  // ========================================
  console.log('🔍 Extracting feature keys...');

  const sqlFeatures = extractFeatureKeysFromSQL(sqlContent);
  const registryKeys = extractFeatureKeysFromRegistry(registryContent);

  console.log(`   - SQL features: ${sqlFeatures.length}`);
  console.log(`   - Registry features: ${registryKeys.length}`);
  console.log();

  // ========================================
  // Step 3: Check for missing features in registry
  // ========================================
  console.log('✅ Checking SQL features exist in registry...');

  const missingInRegistry = sqlFeatures.filter(k => !registryKeys.includes(k));

  if (missingInRegistry.length > 0) {
    console.error(`❌ Features in seed SQL but missing from registry:`);
    missingInRegistry.forEach(k => console.error(`   - ${k}`));
    console.error();
    hasErrors = true;
  } else {
    console.log('   ✓ All SQL features exist in registry');
  }

  // ========================================
  // Step 4: Check for missing features in SQL (warning only)
  // ========================================
  console.log('⚠️  Checking registry features exist in SQL...');

  const missingInSQL = registryKeys.filter(k => !sqlFeatures.includes(k));

  if (missingInSQL.length > 0) {
    console.warn(`⚠️  Features in registry but not seeded in DB:`);
    missingInSQL.forEach(k => console.warn(`   - ${k}`));
    console.warn('   (This is not an error, but new features should be added to seed SQL)');
    console.warn();
  } else {
    console.log('   ✓ All registry features exist in SQL');
  }

  // ========================================
  // Step 5: Check for duplicate keys
  // ========================================
  console.log('🔍 Checking for duplicate feature keys...');

  const duplicatesInRegistry = registryKeys.filter((k, i) => registryKeys.indexOf(k) !== i);

  if (duplicatesInRegistry.length > 0) {
    console.error(`❌ Duplicate feature keys in registry:`);
    [...new Set(duplicatesInRegistry)].forEach(k => console.error(`   - ${k}`));
    console.error();
    hasErrors = true;
  } else {
    console.log('   ✓ No duplicates found');
  }

  // ========================================
  // Step 6: Validate naming conventions
  // ========================================
  console.log('📝 Validating feature key naming conventions...');

  const invalidNames = registryKeys.filter(k => !validateNamingConvention(k));

  if (invalidNames.length > 0) {
    console.error(`❌ Invalid feature key names (must be lowercase snake_case, 3-50 chars):`);
    invalidNames.forEach(k => console.error(`   - ${k}`));
    console.error();
    hasErrors = true;
  } else {
    console.log('   ✓ All feature keys follow naming conventions');
  }

  // ========================================
  // Step 7: Verify generated JSON
  // ========================================
  console.log('📦 Checking generated JSON...');

  if (fs.existsSync(GENERATED_JSON_PATH)) {
    try {
      const jsonContent = JSON.parse(fs.readFileSync(GENERATED_JSON_PATH, 'utf8'));
      const jsonKeys = Object.keys(jsonContent);

      if (jsonKeys.length !== registryKeys.length) {
        console.error(`❌ Generated JSON has different number of features (${jsonKeys.length} vs ${registryKeys.length})`);
        hasErrors = true;
      } else {
        console.log(`   ✓ Generated JSON has ${jsonKeys.length} features`);
      }
    } catch (e) {
      console.error(`❌ Failed to parse generated JSON: ${e.message}`);
      hasErrors = true;
    }
  } else {
    console.warn('   ⚠️  Generated JSON not found (run: npm run build:registry)');
  }

  // ========================================
  // Summary
  // ========================================
  console.log();
  console.log('='.repeat(70));

  if (hasErrors) {
    console.error('❌ Validation FAILED');
    console.error('   Fix the errors above and try again');
    process.exit(1);
  } else {
    console.log('✅ Validation PASSED');
    console.log(`   - ${registryKeys.length} features defined`);
    console.log(`   - ${sqlFeatures.length} features seeded in DB`);
    console.log('   - Registry and SQL are consistent');
    process.exit(0);
  }
}

// =============================================================================
// Run
// =============================================================================

if (require.main === module) {
  main();
}

module.exports = { extractFeatureKeysFromSQL, extractFeatureKeysFromRegistry, validateNamingConvention };
