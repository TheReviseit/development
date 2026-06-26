jest.mock("server-only", () => ({}), { virtual: true });

const mockGetSupabaseServiceClient = jest.fn();

jest.mock("@/lib/supabase/service-client", () => ({
  getSupabaseServiceClient: (...args: unknown[]) =>
    mockGetSupabaseServiceClient(...args),
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type PricingQueryBuilder = {
  select: jest.MockedFunction<() => PricingQueryBuilder>;
  eq: jest.MockedFunction<() => PricingQueryBuilder>;
  is: jest.MockedFunction<() => PricingQueryBuilder>;
  order: jest.MockedFunction<() => Promise<QueryResult>>;
};

type FlagQueryBuilder = {
  select: jest.MockedFunction<() => FlagQueryBuilder>;
  eq: jest.MockedFunction<() => FlagQueryBuilder>;
  maybeSingle: jest.MockedFunction<() => Promise<QueryResult>>;
};

const pricingRows = [
  {
    plan_slug: "starter",
    display_name: "Starter",
    description: "Start selling",
    amount_paise: 199900,
    currency: "INR",
    billing_cycle: "monthly",
    features_json: ["Storefront", "WhatsApp"],
    limits_json: { products: 100 },
  },
];

const flagRow = {
  feature_key: "onboarding_pricing_trial_toggle",
  is_enabled_globally: true,
  updated_at: "2026-05-16T07:35:03.610272+00:00",
};

function createSupabaseMock(results: {
  pricing: QueryResult;
  flag: QueryResult;
}) {
  const calls = {
    pricing: 0,
    flag: 0,
  };

  const client = {
    from(table: string) {
      if (table === "pricing_plans") {
        calls.pricing += 1;
        const builder = {} as PricingQueryBuilder;
        builder.select = jest.fn(() => builder);
        builder.eq = jest.fn(() => builder);
        builder.is = jest.fn(() => builder);
        builder.order = jest.fn(() => Promise.resolve(results.pricing));
        return builder;
      }

      if (table === "feature_flags") {
        calls.flag += 1;
        const builder = {} as FlagQueryBuilder;
        builder.select = jest.fn(() => builder);
        builder.eq = jest.fn(() => builder);
        builder.maybeSingle = jest.fn(() => Promise.resolve(results.flag));
        return builder;
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { client, calls };
}

describe("onboarding bootstrap server cache", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
    mockGetSupabaseServiceClient.mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  async function loadModule() {
    const mod = await import("@/lib/onboarding/bootstrap.server");
    mod.__resetOnboardingBootstrapCacheForTests();
    return mod;
  }

  it("returns pricing plans and onboarding trial flag in one bootstrap payload", async () => {
    const supabase = createSupabaseMock({
      pricing: { data: pricingRows, error: null },
      flag: { data: flagRow, error: null },
    });
    mockGetSupabaseServiceClient.mockReturnValue(supabase.client);

    const { getOnboardingBootstrapConfig } = await loadModule();
    const result = await getOnboardingBootstrapConfig("shop");

    expect(result).toMatchObject({
      success: true,
      domain: "shop",
      pricing: {
        plans: [
          {
            id: "starter",
            name: "Starter",
            priceDisplay: "₹1,999",
            price: 199900,
            currency: "INR",
          },
        ],
      },
      features: {
        onboardingPricingTrialToggle: {
          enabled: true,
          featureKey: "onboarding_pricing_trial_toggle",
          updatedAt: flagRow.updated_at,
        },
      },
    });
  });

  it("dedupes concurrent bootstrap requests for the same domain", async () => {
    const supabase = createSupabaseMock({
      pricing: { data: pricingRows, error: null },
      flag: { data: flagRow, error: null },
    });
    mockGetSupabaseServiceClient.mockReturnValue(supabase.client);

    const { getOnboardingBootstrapConfig } = await loadModule();
    const [first, second] = await Promise.all([
      getOnboardingBootstrapConfig("shop"),
      getOnboardingBootstrapConfig("shop"),
    ]);

    expect(first).toEqual(second);
    expect(supabase.calls.pricing).toBe(1);
    expect(supabase.calls.flag).toBe(1);
  });

  it("serves stale bootstrap data when refresh fails within the stale window", async () => {
    jest.useFakeTimers().setSystemTime(0);
    const successfulSupabase = createSupabaseMock({
      pricing: { data: pricingRows, error: null },
      flag: { data: flagRow, error: null },
    });
    mockGetSupabaseServiceClient.mockReturnValue(successfulSupabase.client);

    const { getOnboardingBootstrapConfig } = await loadModule();
    const first = await getOnboardingBootstrapConfig("shop");

    const failingSupabase = createSupabaseMock({
      pricing: { data: null, error: { message: "database unavailable" } },
      flag: { data: null, error: { message: "database unavailable" } },
    });
    mockGetSupabaseServiceClient.mockReturnValue(failingSupabase.client);
    jest.setSystemTime(90_000);

    await expect(getOnboardingBootstrapConfig("shop")).resolves.toEqual(first);
  });

  it("rejects invalid domain query values", async () => {
    const { resolveProductDomainFromRequest } = await loadModule();
    const request = {
      nextUrl: new URL("http://localhost:3001/api/onboarding/bootstrap?domain=bad!"),
      headers: new Headers({ host: "localhost:3001" }),
    };

    expect(() => resolveProductDomainFromRequest(request as any)).toThrow(
      "INVALID_DOMAIN",
    );
  });
});
