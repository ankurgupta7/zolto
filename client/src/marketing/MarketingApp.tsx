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
import WhyPlatform from "./pages/WhyPlatform";
import Research from "./pages/Research";
import Segment from "./pages/Segment";
import Sovereignty from "./pages/Sovereignty";
import { Privacy, Terms } from "./pages/Legal";
import PlatformApp from "../platform/PlatformApp";
import { isPlatformPath } from "../platform/nav";

function ScrollToTop() {
  const [location] = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every route change to reset scroll position
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

/**
 * The Gwinn marketing / SaaS surface — rendered when the hostname resolves to the
 * platform apex (gwinn.com) rather than a tenant storefront. Shares the warm
 * oyster/gold/ink + serif brand system of the storefront (a handcrafted identity
 * for a maker audience), with its own marketing chrome.
 */
export default function MarketingApp() {
  const [location] = useLocation();

  // The operator console lives on this surface but is not a marketing page —
  // it renders outside MarketingShell so it carries no pricing nav or footer.
  // It is mounted here because /admin/* only exists on tenant hosts, which
  // left the platform owner with no way to reach their own console from
  // gwinn.ch (see platform/PlatformLayout).
  if (isPlatformPath(location)) {
    return <PlatformApp />;
  }

  return (
    <MarketingShell>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/faq" component={Faq} />
        <Route path="/made-in-switzerland" component={Sovereignty} />
        <Route path="/compare" component={Compare} />
        {/* The AI-native argument in full — the bands the homepage reel could
            not hold at one viewport each. Linked from the reel's "what's
            coming" chapter. */}
        <Route path="/why-gwinn" component={WhyPlatform} />
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
