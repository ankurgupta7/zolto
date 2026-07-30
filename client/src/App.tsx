import { useEffect, useState, type ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import Billing from "./pages/Billing";
import ClaimStaff from "./pages/ClaimStaff";
import SupportChat from "./components/SupportChat";
import BulkUpload from "./pages/BulkUpload";
import CsvImport from "./pages/CsvImport";
import DuplicateCleanup from "./pages/DuplicateCleanup";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import Policy from "./pages/Policy";
import Impressum from "./pages/Impressum";
import FAQ from "./pages/FAQ";
import ProductDetail from "./pages/ProductDetail";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import CartDrawer from "./components/CartDrawer";
import { CartProvider } from "./contexts/CartContext";
import { TenantProvider } from "./contexts/TenantContext";
import { useSmoothScroll, lenisRef } from "./hooks/useSmoothScroll";
import { resolveSurface, type SurfaceResolution } from "./lib/surface";
import MarketingApp from "./marketing/MarketingApp";
import { ADMIN_NAV } from "./admin/nav";
import AdminLayout from "./components/admin/AdminLayout";
import AdminPlaceholder from "./components/admin/AdminPlaceholder";
import Storefront from "./pages/admin/Storefront";
import Domain from "./pages/admin/Domain";
import Channels from "./pages/admin/Channels";
import Pos from "./pages/admin/Pos";
import Orders from "./pages/admin/Orders";
import Reconciliation from "./pages/admin/Reconciliation";
import AdminInsights from "./pages/admin/Insights";
import AdminImport from "./pages/admin/Import";
import ShopProfile from "./pages/admin/ShopProfile";
import Team from "./pages/admin/Team";
import Credits from "./pages/admin/Credits";
import Platform from "./pages/admin/Platform";
import Keys from "./pages/admin/Keys";
import DataPrivacy from "./pages/admin/DataPrivacy";
import Support from "./pages/admin/Support";
import Legal from "./pages/admin/Legal";

function ScrollToTop() {
  const [location] = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every route change to reset scroll position
  useEffect(() => {
    if (lenisRef.current) {
      // Tell Lenis to jump to the top immediately (no inertia carry-over).
      lenisRef.current.scrollTo(0, { immediate: true });
    } else {
      // Fallback for environments where Lenis hasn't initialised yet.
      window.scrollTo(0, 0);
    }
  }, [location]);
  return null;
}

/** Resolve the surface once from the current hostname (+ dev overrides). */
function useSurface(): SurfaceResolution {
  const [surface] = useState<SurfaceResolution>(() =>
    resolveSurface({
      hostname: window.location.hostname,
      search: window.location.search,
      defaultTenantSlug: import.meta.env.VITE_DEFAULT_TENANT_SLUG || "demo",
    }),
  );
  return surface;
}

/**
 * Manifest ids → real pages. Anything not mapped renders AdminPlaceholder
 * until its slice of the admin migration lands (docs/ARCHITECTURE-ADMIN.md §9).
 * The legacy routes below stay live until their sections are extracted.
 */
const ADMIN_PAGES: Record<string, ComponentType> = {
  // Store plane
  home: Admin,
  products: Admin, // the catalogue manager (monolith) until Home splits into a dashboard
  import: AdminImport,
  orders: Orders,
  reconciliation: Reconciliation,
  storefront: Storefront,
  domain: Domain,
  channels: Channels,
  pos: Pos,
  insights: AdminInsights,
  // Account plane
  account: ShopProfile,
  team: Team,
  plan: Billing,
  credits: Credits,
  keys: Keys,
  data: DataPrivacy,
  support: Support,
  legal: Legal,
  platform: Platform,
};

function StorefrontRouter() {
  useSmoothScroll();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={Shop} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/checkout/success" component={CheckoutSuccess} />
          <Route path="/checkout/cancel" component={CheckoutCancel} />
          <Route path="/policy" component={Policy} />
          <Route path="/impressum" component={Impressum} />
          <Route path="/faq" component={FAQ} />
          <Route path="/product/:id" component={ProductDetail} />
          {ADMIN_NAV.map((item) => {
            const Page = ADMIN_PAGES[item.id];
            return (
              <Route key={item.id} path={item.path}>
                {() => (
                  <AdminLayout title={item.label}>
                    {Page ? (
                      <Page />
                    ) : (
                      <AdminPlaceholder label={item.label} icon={item.icon} />
                    )}
                  </AdminLayout>
                )}
              </Route>
            );
          })}
          {/* Legacy admin routes — kept until each section moves into the shell. */}
          <Route path="/admin/billing" component={Billing} />
          <Route path="/claim-staff" component={ClaimStaff} />
          <Route path="/admin/bulk-upload" component={BulkUpload} />
          <Route path="/admin/csv-import" component={CsvImport} />
          <Route path="/admin/duplicates" component={DuplicateCleanup} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <WhatsAppButton />
      <CartDrawer />
      <SupportChat />
    </div>
  );
}

function App() {
  const surface = useSurface();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        {surface.surface === "marketing" ? (
          <TooltipProvider>
            <Toaster />
            <MarketingApp />
          </TooltipProvider>
        ) : (
          <TenantProvider slug={surface.tenantSlug}>
            <CartProvider>
              <TooltipProvider>
                <Toaster />
                <StorefrontRouter />
              </TooltipProvider>
            </CartProvider>
          </TenantProvider>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
