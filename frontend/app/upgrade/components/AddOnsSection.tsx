'use client';

/**
 * AddOnsSection — Available Add-Ons Display
 * ========================================
 *
 * Design: Grid of add-on cards with purchase CTAs
 */

interface AddOn {
  addon_slug: string;
  display_name: string;
  description?: string;
  amount_paise: number;
  feature_key?: string;
  limit_increase?: number;
}

interface AddOnsSectionProps {
  addons: AddOn[];
  domain: string;
}

export default function AddOnsSection({ addons, domain }: AddOnsSectionProps) {
  if (!addons || addons.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 pt-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-black">Add-Ons</h2>
        <p className="mt-2 text-gray-600">
          Boost your limits with optional add-ons
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {addons.map((addon) => (
          <div
            key={addon.addon_slug}
            className="rounded-lg border-2 border-gray-200 bg-white p-6 hover:border-black transition-colors duration-200"
          >
            {/* Add-on Name */}
            <h4 className="text-lg font-semibold text-black">
              {addon.display_name}
            </h4>

            {/* Description */}
            {addon.description && (
              <p className="mt-2 text-sm text-gray-600">{addon.description}</p>
            )}

            {/* Limit Increase */}
            {addon.limit_increase && (
              <div className="mt-3 inline-flex px-3 py-1 bg-gray-100 text-black text-sm font-medium rounded-full">
                +{addon.limit_increase}{' '}
                {addon.feature_key?.replace(/_/g, ' ')}
              </div>
            )}

            {/* Price */}
            <div className="mt-4 flex items-baseline">
              <span className="text-2xl font-bold text-black">
                ₹{Math.floor(addon.amount_paise / 100)}
              </span>
              <span className="ml-2 text-gray-600">/month</span>
            </div>

            {/* Add Button */}
            <button
              className="mt-4 w-full px-4 py-2 bg-black text-white font-medium hover:bg-gray-800 transition-colors duration-200"
              onClick={() => {
                // Would trigger add-on purchase flow
                alert('Add-on purchase flow - coming soon!');
              }}
            >
              Add to Plan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
