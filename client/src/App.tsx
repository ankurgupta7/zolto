import { useEffect } from "react";
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
import { useSmoothScroll, lenisRef } from "./hooks/useSmoothScroll";

function ScrollToTop() {
  const [location] = useLocation();
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

function Router() {
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
          <Route path="/admin" component={Admin} />
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
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
