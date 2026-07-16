import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { MarketingShell } from "./components/MarketingChrome";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import { Privacy, Terms } from "./pages/Legal";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold text-white">Page not found</h1>
      <a href="/" className="mt-6 inline-block text-violet-300 hover:underline">
        Back to home
      </a>
    </div>
  );
}

/**
 * The Zolto marketing / SaaS surface — rendered when the hostname resolves to the
 * platform apex (zolto.com) rather than a tenant storefront. Has its own Zolto
 * identity and chrome, independent of the warm storefront theme.
 */
export default function MarketingApp() {
  return (
    <MarketingShell>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/signup" component={Signup} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/legal/privacy" component={Privacy} />
        <Route path="/legal/terms" component={Terms} />
        <Route component={NotFound} />
      </Switch>
    </MarketingShell>
  );
}
