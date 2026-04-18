import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { api, PlanDefinition } from '@/services/api';
import { Button } from '../common/Button';
import { Toast } from '../common/Toast';

/**
 * Plan selection — spec 2.3.2 "Plan Selection".
 *
 * Dedicated page where newcomers pick the tier they want to self-register on.
 * In v1, only Starter is actually self-servable; Professional / Business show
 * a "Coming soon" state (disabled CTA), and Enterprise shows "Contact sales".
 *
 * When the user picks a self-servable plan, we route to
 * /register?plan=<id>&panelOwner=1 so the RegisterPage can prefill the plan
 * field and show the Panel Owner sign-up variant (with companyName).
 */
export const PlanSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const highlightedPlanId = searchParams.get('highlight');

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPlans();
      setPlans(res.plans);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error;
      setError(
        serverMsg ||
          (err?.code === 'ERR_NETWORK'
            ? 'Could not connect to the server. Please check your connection and try again.'
            : 'Something went wrong loading the plans. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const selectable = useMemo(
    () => plans.filter((p) => p.publiclySelfServable),
    [plans]
  );

  const handleSelect = (plan: PlanDefinition) => {
    if (plan.publiclySelfServable) {
      navigate(`/register?plan=${plan.id}&panelOwner=1`);
      return;
    }
    if (plan.id === 'enterprise') {
      // v1: no real contact-sales form — nudge to Starter for now.
      window.alert(
        'Enterprise is available by custom arrangement. Please reach out to your OmniLink contact. In the meantime, you can start on the free Starter plan.'
      );
      return;
    }
    // Professional / Business: Coming soon.
    window.alert(
      `${plan.name} is launching soon. You can start on Starter today and upgrade later — all your data stays with your workspace.`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[36rem] h-[36rem] bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute bottom-0 right-0 w-[32rem] h-[32rem] bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg shadow-md">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">OmniLink</span>
          </Link>
        </div>

        {/* Intro */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Step 1 of 3 — Choose your plan
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
            Pick a plan to start your workspace
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            You'll be the owner of a new OmniLink workspace. You can invite your team right
            after signing in. In this release only the free Starter plan is self-servable;
            paid tiers are rolling out soon.
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
            Loading plans…
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto text-center py-8">
            <Toast message={error} type="error" onClose={() => setError(null)} />
            <button
              onClick={fetchPlans}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                highlight={plan.id === highlightedPlanId}
                onSelect={() => handleSelect(plan)}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        {!loading && !error && (
          <div className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {selectable.length > 0 ? (
              <>
                Starting on the{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {selectable[0].name}
                </span>{' '}
                plan? You can upgrade any time without losing your data.
              </>
            ) : (
              <>Self-serve signup is paused — please contact us to get access.</>
            )}
          </div>
        )}

        <div className="mt-10 text-center">
          <p className="text-gray-700 dark:text-gray-300">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

interface PlanCardProps {
  plan: PlanDefinition;
  highlight: boolean;
  onSelect: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, highlight, onSelect }) => {
  const isRecommended = plan.recommended;
  const isDisabled = !plan.publiclySelfServable;
  const priceLabel =
    plan.priceMonthly === 0 ? 'Free' : plan.priceMonthly < 0 ? 'Custom' : `$${plan.priceMonthly}`;

  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-lg ${
        isRecommended
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400'
          : highlight
          ? 'border-purple-400 dark:border-purple-500 ring-2 ring-purple-400 dark:ring-purple-500'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow">
          Most popular
        </div>
      )}
      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 min-h-[2.5rem]">{plan.tagline}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{priceLabel}</span>
        {plan.priceMonthly > 0 && (
          <span className="text-gray-500 dark:text-gray-400 text-sm">/ user / mo</span>
        )}
      </div>
      <ul className="mt-5 space-y-2 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onSelect}
        variant={isRecommended ? 'primary' : 'secondary'}
        fullWidth
        className="mt-6"
      >
        {plan.ctaLabel}
      </Button>
      {isDisabled && plan.id !== 'enterprise' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
          Coming soon — start on Starter and upgrade later.
        </p>
      )}
      {plan.id === 'enterprise' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
          Need custom SLAs or dedicated hosting? Talk to us.
        </p>
      )}
    </div>
  );
};
