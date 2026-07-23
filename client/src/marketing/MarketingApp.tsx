import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { MarketingShell } from "./components/MarketingChrome";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Story from "./pages/Story";
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
      <h1 className="font-serif text-3xl text-[var(--brand-text)]">
        Page not found
      </h1>
      <a
        href="/"
        className="mt-6 inline-block text-[var(--brand-accent)] hover:underline"
      >
        Back to home
      </a>
    </div>
  );
}

/**
 * The Zolto marketing / SaaS surface — rendered when the hostname resolves to the
 * platform apex (zolto.com) rather than a tenant storefront. Shares the warm
 * oyster/gold/ink + serif brand system of the storefront (a handcrafted identity
 * for a maker audience), with its own marketing chrome.
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
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/stories/:slug" component={Story} />
        <Route path="/legal/privacy" component={Privacy} />
        <Route path="/legal/terms" component={Terms} />
        <Route component={NotFound} />
      </Switch>
    </MarketingShell>
  );
}
