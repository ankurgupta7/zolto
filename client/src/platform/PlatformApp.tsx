/**
 * Operator console router, mounted on the MARKETING surface (zolto.ch) rather
 * than inside a tenant's admin — see PlatformLayout for why.
 *
 * Routes here render outside MarketingShell: the console is not a marketing
 * page and should not carry the pricing nav or the footer.
 */

import { Route, Switch } from "wouter";
import PlatformLayout from "./PlatformLayout";
import PlatformMetrics from "@/pages/admin/Platform";
import Stores from "./pages/Stores";
import StoreDetail from "./pages/StoreDetail";

export default function PlatformApp() {
  return (
    <Switch>
      <Route path="/platform">
        <PlatformLayout title="Platform metrics">
          <PlatformMetrics />
        </PlatformLayout>
      </Route>
      <Route path="/platform/stores">
        <PlatformLayout title="Stores">
          <Stores />
        </PlatformLayout>
      </Route>
      <Route path="/platform/stores/:id">
        {(params) => (
          <PlatformLayout title="Store">
            <StoreDetail tenantId={Number(params.id)} />
          </PlatformLayout>
        )}
      </Route>
    </Switch>
  );
}
