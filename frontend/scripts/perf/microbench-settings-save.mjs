/**
 * Microbenchmark: AI Settings save client-side serialization cost.
 *
 * Usage (from frontend/):
 *   node scripts/perf/microbench-settings-save.mjs
 *   node scripts/perf/microbench-settings-save.mjs --iterations=2000
 */

const ITERATIONS = Number(
  process.argv.find((arg) => arg.startsWith("--iterations="))?.split("=")[1] ||
    "1000",
);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function bench(name, fn, iterations = ITERATIONS) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return {
    name,
    iterations,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: Math.max(...samples),
  };
}

function makePayload(productCount) {
  const products = Array.from({ length: productCount }, (_, i) => ({
    id: `p-${i}`,
    name: `Product ${i}`,
    category: "General",
    description: "Sample description for benchmark payload sizing",
    price: 999,
    price_unit: "INR",
    duration: 30,
    available: true,
    imageUrl: "https://example.com/image.jpg",
    variants: [],
    sizes: ["S", "M"],
    colors: ["Red"],
  }));

  return {
    business_id: "bench_business",
    business_name: "Benchmark Store",
    industry: "retail",
    description: "Benchmark business profile",
    contact: { phone: "+919999999999", email: "bench@example.com" },
    social_media: {},
    location: { city: "Chennai", google_maps_link: "" },
    timings: {
      monday: { open: "09:00", close: "18:00", is_closed: false },
    },
    products_services: products,
    policies: {
      refund: "7 days",
      cancellation: "24h",
      delivery: "3-5 days",
      payment_methods: ["UPI"],
    },
    ecommerce_policies: {
      shipping_policy: "Standard",
      cod_available: true,
    },
    faqs: [{ question: "Hours?", answer: "9-6" }],
    brand_voice: {
      tone: "friendly",
      language_preference: "en",
      greeting_style: "warm",
      tagline: "We help you",
      unique_selling_points: ["Fast support"],
      avoid_topics: [],
      custom_greeting: "Hello!",
    },
  };
}

function stringifyDirtyCheck(current, initial) {
  return JSON.stringify(current) === JSON.stringify(initial);
}

const scenarios = [
  { label: "small_no_products", productCount: 0 },
  { label: "medium_10_products", productCount: 10 },
  { label: "large_100_products", productCount: 100 },
];

console.log(`AI Settings save microbench (${ITERATIONS} iterations each)`);
console.log("---");

for (const scenario of scenarios) {
  const payload = makePayload(scenario.productCount);
  const initial = structuredClone(payload);
  payload.brand_voice.tagline = "Updated tagline";

  const jsonBody = JSON.stringify(payload);
  const stringifyResult = bench(
    `${scenario.label}:json.stringify`,
    () => JSON.stringify(payload),
  );
  const dirtyCheckResult = bench(
    `${scenario.label}:dirty_check_stringify`,
    () => stringifyDirtyCheck(payload, initial),
  );

  console.log(
    JSON.stringify(
      {
        scenario: scenario.label,
        payload_bytes: jsonBody.length,
        json_stringify: stringifyResult,
        dirty_check: dirtyCheckResult,
      },
      null,
      2,
    ),
  );
}
