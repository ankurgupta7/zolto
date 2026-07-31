import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { MarketingShell } from "./components/MarketingChrome";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import Signup from "./pages/Signup";
import SignIn from "./pages/SignIn";
import Onboarding from "./pages/Onboarding";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Story from "./pages/Story";
import Faq from "./pages/Faq";
import Compare from "./pages/Compare";
import Research from "./pages/Research";
import Segment from "./pages/Segment";
import { Privacy, Terms } from "./pages/Legal";

function ScrollToTop() {
  const [location] = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every route change to reset scroll position
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
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
        <Route path="/faq" component={Faq} />
        <Route path="/compare" component={Compare} />
        <Route path="/compare/:slug" component={Compare} />
        <Route path="/signup" component={Signup} />
        <Route path="/signin" component={SignIn} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/for" component={Segment} />
        <Route path="/for/:segment" component={Segment} />
        <Route path="/research/:slug" component={Research} />
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
