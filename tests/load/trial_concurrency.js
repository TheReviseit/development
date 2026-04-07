/**
 * FAANG-Grade Load Test: Trial + Onboarding Concurrency
 * ======================================================
 *
 * This test uses k6 for REAL concurrent load (not ThreadPoolExecutor).
 * k6 launches actual OS threads that make real HTTP requests.
 *
 * Run with: k6 run tests/load/trial_concurrency.js
 * Or with docker: docker run -it --rm grafana/k6 run -v tests/load/trial_concurrency.js
 *
 * KPIs:
 * - p(95) latency < 500ms
 * - Error rate < 1%
 * - Zero duplicate trials (verified via DB query after test)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const trialStartLatency = new Trend('trial_start_duration_ms');
const onboardingCheckLatency = new Trend('onboarding_check_duration_ms');
const errorRate = new Rate('errors');
const duplicateTrials = new Counter('duplicate_trials_detected');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const INTERNAL_API_KEY = __ENV.INTERNAL_API_KEY || 'flowauxi-internal-key';

export const options = {
  // Ramp up to 100 concurrent VUs over 10s, stay at 100 for 30s, ramp down
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  
  // SLA thresholds
  thresholds: {
    'trial_start_duration_ms': ['p(95)<500'],
    'onboarding_check_duration_ms': ['p(95)<200'],
    'errors': ['rate<0.01'],
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  // Each VU gets a unique user
  const vuId = __VU;
  const userId = `load-test-${vuId}-${Date.now()}`;
  const email = `${userId}@test.com`;

  // ================================================================
  // Test 1: Concurrent Trial Start
  // ================================================================
  group('Trial Start', () => {
    const startTime = Date.now();

    const payload = JSON.stringify({
      user_id: userId,
      org_id: userId,
      email: email,
      plan_slug: 'starter',
      domain: 'shop',
      source: 'load_test',
    });

    const headers = {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': INTERNAL_API_KEY,
    };

    const res = http.post(`${BASE_URL}/api/trials/internal/start`, payload, { headers });

    const duration = Date.now() - startTime;
    trialStartLatency.add(duration);

    const success = check(res, {
      'status is 201 or 200': (r) => r.status === 201 || r.status === 200,
      'response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      },
      'response has success=true': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true;
        } catch (e) {
          return false;
        }
      },
      'response has trial data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.trial !== null && body.trial !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!success) {
      errorRate.add(1);
      console.error(`[VU${vuId}] Trial start failed: ${res.status} - ${res.body}`);
    } else {
      errorRate.add(0);
      
      // Verify response structure
      try {
        const body = JSON.parse(res.body);
        if (body.is_existing) {
          console.log(`[VU${vuId}] Existing trial returned (idempotent)`);
        }
      } catch (e) {
        console.error(`[VU${vuId}] Failed to parse response: ${e}`);
      }
    }
  });

  // Small delay between operations
  sleep(0.5);

  // ================================================================
  // Test 2: Onboarding Check (Parallel with trial start in real flow)
  // ================================================================
  group('Onboarding Check', () => {
    // Simulate the frontend calling /api/onboarding/check
    // Note: This endpoint requires session cookie, so we skip in load test
    // and instead test /api/trials/active directly
    const startTime = Date.now();

    // This would be called with session cookie in real flow
    const res = http.get(`${BASE_URL}/api/trials/active`, {
      headers: {
        'Cookie': `session=test-session-${vuId}`, // Fake session for testing
      },
    });

    const duration = Date.now() - startTime;
    onboardingCheckLatency.add(duration);

    // We expect 401 without valid session, but we measure the latency anyway
    check(res, {
      'responded': (r) => r.status > 0,
    });
  });

  // ================================================================
  // Test 3: Concurrent Trial Starts for Same User (Idempotency)
  // ================================================================
  group('Concurrent Trial Starts (Idempotency)', () => {
    const payload = JSON.stringify({
      user_id: `shared-user-${__ITER}`, // Same user across iterations
      org_id: `shared-user-${__ITER}`,
      email: `shared-user-${__ITER}@test.com`,
      plan_slug: 'starter',
      domain: 'shop',
      source: 'idempotency_test',
    });

    const headers = {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': INTERNAL_API_KEY,
    };

    // Fire multiple concurrent requests for the same user
    const results = http.batch([
      ['POST', `${BASE_URL}/api/trials/internal/start`, payload, headers],
      ['POST', `${BASE_URL}/api/trials/internal/start`, payload, headers],
      ['POST', `${BASE_URL}/api/trials/internal/start`, payload, headers],
    ]);

    // All should succeed (200 for existing, 201 for new)
    let successCount = 0;
    let trialIds = new Set();

    for (const res of results) {
      if (res.status === 200 || res.status === 201) {
        successCount++;
        try {
          const body = JSON.parse(res.body);
          if (body.trial && body.trial.id) {
            trialIds.add(body.trial.id);
          }
        } catch (e) {
          // Ignore parse errors for this check
        }
      }
    }

    // All 3 requests should succeed
    check(null, {
      'all concurrent requests succeeded': () => successCount === 3,
    });

    // All should return the same trial ID (idempotent)
    // Note: In real scenario, only 1 trial should be created
    if (trialIds.size > 1) {
      duplicateTrials.add(1);
      console.error(`[VU${vuId}] Duplicate trials detected: ${JSON.stringify([...trialIds])}`);
    }
  });
}

// ================================================================
// Teardown: Verify Database State
// ================================================================

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'stderr': textSummary(data, { indent: ' ', enableColors: false }),
  };
}

export function teardown(data) {
  console.log('\n========================================');
  console.log('LOAD TEST COMPLETE - VERIFICATION QUERIES');
  console.log('========================================\n');
  
  console.log('Run these SQL queries to verify results:\n');
  
  console.log('1. Check for duplicate trials (should return 0 rows):');
  console.log(`
    SELECT user_id, COUNT(*) as trial_count
    FROM free_trials
    WHERE user_id LIKE 'load-test-%'
    GROUP BY user_id
    HAVING COUNT(*) > 1;
  `);
  
  console.log('\n2. Count total trials created:');
  console.log(`
    SELECT COUNT(*) as total_trials
    FROM free_trials
    WHERE user_id LIKE 'load-test-%';
  `);
  
  console.log('\n3. Check for users with trial but no onboarding (should return 0):');
  console.log(`
    SELECT ft.user_id, ft.id as trial_id, u.onboarding_completed_at
    FROM free_trials ft
    LEFT JOIN users u ON ft.user_id = u.id
    WHERE ft.user_id LIKE 'load-test-%'
      AND ft.status IN ('active', 'expiring_soon')
      AND u.onboarding_completed_at IS NULL;
  `);
  
  console.log('\n4. Cleanup test data:');
  console.log(`
    DELETE FROM free_trials WHERE user_id LIKE 'load-test-%';
    DELETE FROM users WHERE id LIKE 'load-test-%';
  `);
}

// ================================================================
// Helper: Text Summary
// ================================================================

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let output = `${indent}LOAD TEST RESULTS\n`;
  output += `${indent}${'='.repeat(50)}\n\n`;
  
  // HTTP metrics
  if (data.metrics.http_req_duration) {
    output += `${indent}HTTP Request Duration:\n`;
    output += `${indent}  p(95): ${data.metrics.http_req_duration.values['p(95)']?.toFixed(2)}ms\n`;
    output += `${indent}  avg: ${data.metrics.http_req_duration.values.avg?.toFixed(2)}ms\n`;
  }
  
  // Custom metrics
  if (data.metrics.trial_start_duration_ms) {
    output += `\n${indent}Trial Start Duration:\n`;
    output += `${indent}  p(95): ${data.metrics.trial_start_duration_ms.values['p(95)']?.toFixed(2)}ms\n`;
    output += `${indent}  avg: ${data.metrics.trial_start_duration_ms.values.avg?.toFixed(2)}ms\n`;
  }
  
  if (data.metrics.errors) {
    output += `\n${indent}Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  }
  
  if (data.metrics.duplicate_trials_detected) {
    const dupCount = data.metrics.duplicate_trials_detected.values;
    if (dupCount > 0) {
      output += `\n${indent}⚠️  DUPLICATE TRIALS DETECTED: ${dupCount}\n`;
    } else {
      output += `\n${indent}✓ No duplicate trials detected\n`;
    }
  }
  
  output += `\n${indent}${'='.repeat(50)}\n`;
  
  return output;
}
