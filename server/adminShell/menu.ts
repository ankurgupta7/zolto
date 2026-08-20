/**
 * The menu — every administrative operation Gwinn has, arranged in tiers.
 *
 * This file is data. Adding an operation means adding an entry here and a
 * function in actions/; the navigation, the read-only guard and the error
 * handling are the shell's business, not each action's.
 *
 * The top tier is organised by *what the operator is thinking about* (stores,
 * money, people, stock, sales, setup, the platform itself) rather than by
 * which router a procedure happens to live on. Everything under a store-scoped
 * tier asks which store if the shell isn't already pointed at one.
 */

import { BRAND } from "@shared/brand";
import * as billing from "./actions/billing";
import * as catalogue from "./actions/catalogue";
import * as orders from "./actions/orders";
import * as people from "./actions/people";
import * as platformOps from "./actions/platformOps";
import * as settings from "./actions/settings";
import * as stores from "./actions/stores";
import type { MenuItem } from "./types";

export const menu: MenuItem = {
  key: "root",
  title: `${BRAND.name} admin`,
  children: [
    {
      key: "stores",
      title: "Stores",
      hint: "Who is on the platform, and which store this shell is pointed at.",
      children: [
        {
          key: "stores.list",
          title: "List every store",
          hint: "Plan, subscription, Stripe connection, admin count, custom domain.",
          run: stores.listStores,
        },
        {
          key: "stores.inspect",
          title: "Inspect a store",
          hint: "One store in full, including everyone who can sign in to it.",
          run: stores.inspectStore,
        },
        {
          key: "stores.select",
          title: "Choose the working store",
          hint: "Every store-scoped option below acts on this one until it is changed.",
          run: stores.chooseWorkingStore,
        },
        {
          key: "stores.clear",
          title: "Clear the working store",
          hint: "Go back to being asked each time.",
          run: stores.clearWorkingStore,
        },
        {
          key: "stores.create",
          title: "Create a store",
          hint: "Same provisioning as self-service signup; prints the one-time claim token.",
          mutates: true,
          run: stores.createStore,
        },
      ],
    },
    {
      key: "billing",
      title: "Plans, subscriptions & comps",
      hint: "What each store pays for, and what it has been given for nothing.",
      children: [
        {
          key: "billing.overview",
          title: "Subscription overview — every store",
          hint: "Paid plan, comp, subscription status and trial end, side by side.",
          run: billing.subscriptionOverview,
        },
        {
          key: "billing.store",
          title: "Billing status for one store",
          hint: "The merchant's own billing page: entitlements, AI usage, fees owed.",
          run: billing.storeBilling,
        },
        {
          key: "billing.plans",
          title: "What the plans include",
          hint: "Prices, fees, allowances and limits, read from the pricing source of truth.",
          run: billing.showPlans,
        },
        {
          key: "billing.setPlan",
          title: "Change a store's paid plan",
          hint: "Billing repair. Stripe owns this column and may overwrite it — comps do not.",
          mutates: true,
          run: billing.changePlan,
        },
        {
          key: "billing.comp",
          title: "Comp a store (grant a plan / waive the fee)",
          hint: "A durable gift that survives Stripe's webhooks and reads as deliberate.",
          mutates: true,
          run: billing.compStore,
        },
        {
          key: "billing.revokeComp",
          title: "Revoke a comp",
          hint: "Takes the grant away. Never touches what the store actually pays for.",
          mutates: true,
          run: billing.revokeComp,
        },
        {
          key: "billing.photoCredits",
          title: "AI photo credit ledger",
          hint: "Grants and consumption for one store, newest first.",
          run: billing.photoCredits,
        },
      ],
    },
    {
      key: "people",
      title: "People & access",
      hint: "Who can sign in to a store, and with what rights.",
      children: [
        {
          key: "people.list",
          title: "Everyone on a store",
          hint: "Roles, sign-in method, and unredeemed signup claims.",
          run: people.listPeople,
        },
        {
          key: "people.setRole",
          title: "Set a user's role (admin / staff)",
          hint: "The fix for a store whose owner never became its admin.",
          mutates: true,
          run: people.setUserRole,
        },
        {
          key: "people.team",
          title: "Team seats & pending invites",
          hint: "Seats used against the plan's limit.",
          run: people.listTeam,
        },
        {
          key: "people.invite",
          title: "Invite a teammate",
          hint: "Emails a 7-day claim link and holds a seat until it is accepted.",
          mutates: true,
          run: people.inviteTeammate,
        },
        {
          key: "people.revokeInvite",
          title: "Revoke a pending invite",
          hint: "Frees the seat it was holding.",
          mutates: true,
          run: people.revokeInvite,
        },
        {
          key: "people.removeStaff",
          title: "Remove a staff member",
          hint: "Deletes their login row. Admins must be demoted first.",
          mutates: true,
          run: people.removeStaff,
        },
      ],
    },
    {
      key: "catalogue",
      title: "Catalogue & stock",
      hint: "A store's products, and the categories they sit in.",
      children: [
        {
          key: "catalogue.list",
          title: "List products",
          hint: "Everything, hidden rows included, with a live/sold/hidden tally.",
          run: catalogue.listProducts,
        },
        {
          key: "catalogue.visibility",
          title: "Show or hide a product",
          mutates: true,
          run: catalogue.toggleVisibility,
        },
        {
          key: "catalogue.sold",
          title: "Mark a product sold or available",
          mutates: true,
          run: catalogue.toggleSold,
        },
        {
          key: "catalogue.quantity",
          title: "Set stock quantity",
          hint: "Reaching zero also marks the piece sold.",
          mutates: true,
          run: catalogue.setQuantity,
        },
        {
          key: "catalogue.delete",
          title: "Delete a product",
          hint: "Hard delete. Hiding keeps the order history readable instead.",
          mutates: true,
          run: catalogue.deleteProduct,
        },
        {
          key: "catalogue.duplicates",
          title: "Find and clean up duplicates",
          hint: "Groups products sharing a name and offers to keep the most complete row.",
          mutates: true,
          run: catalogue.findDuplicates,
        },
        {
          key: "catalogue.categories",
          title: "Categories",
          hint: "The store's own category vocabulary.",
          children: [
            {
              key: "categories.list",
              title: "List categories",
              run: catalogue.listCategories,
            },
            {
              key: "categories.add",
              title: "Add a category",
              mutates: true,
              run: catalogue.addCategory,
            },
            {
              key: "categories.rename",
              title: "Rename a category",
              hint: "A key rename cascades to every product in it, in one transaction.",
              mutates: true,
              run: catalogue.renameCategory,
            },
            {
              key: "categories.delete",
              title: "Delete a category",
              hint: "Its products must be moved somewhere — you'll be asked where.",
              mutates: true,
              run: catalogue.deleteCategory,
            },
            {
              key: "categories.reorder",
              title: "Reorder categories",
              hint: "Sets the order the storefront's filter chips appear in.",
              mutates: true,
              run: catalogue.reorderCategories,
            },
            {
              key: "categories.preset",
              title: "Re-apply the vertical preset",
              hint: "Adds anything missing from the preset. Never removes or renames.",
              mutates: true,
              run: catalogue.applyCategoryPreset,
            },
          ],
        },
      ],
    },
    {
      key: "orders",
      title: "Orders, payments & reconciliation",
      hint: "What sold, what didn't reconcile, and how the store is doing.",
      children: [
        {
          key: "orders.recent",
          title: "Recent paid online orders",
          run: orders.recentOrders,
        },
        {
          key: "orders.refulfil",
          title: "Re-run fulfilment for a Stripe session",
          hint: "The fix for an order whose webhook never arrived.",
          mutates: true,
          run: orders.refulfilSession,
        },
        {
          key: "orders.reconcileStripe",
          title: "Reconcile this store against Stripe",
          hint: "Finds payments with no local order and emails the merchant to confirm.",
          mutates: true,
          run: orders.reconcileStripe,
        },
        {
          key: "orders.reconcilePos",
          title: "Attribute amount-only POS sales",
          hint: "End-of-day pass over till sales that were never tied to a piece.",
          mutates: true,
          run: orders.reconcilePos,
        },
        {
          key: "orders.insights",
          title: "Sales & inventory summary",
          hint: "The store's own numbers for the last 30 days.",
          run: orders.salesInsights,
        },
      ],
    },
    {
      key: "setup",
      title: "Store setup & channels",
      hint: "Settings, custom domain, registers, and channel credentials.",
      children: [
        {
          key: "setup.settings",
          title: "Show a store's settings",
          run: settings.showSettings,
        },
        {
          key: "setup.editSetting",
          title: "Edit a setting",
          hint: "Plan gates and validation are the procedure's, exactly as on the web.",
          mutates: true,
          run: settings.editSetting,
        },
        {
          key: "setup.domain",
          title: "Custom domain status",
          hint: "Whether DNS actually points here yet — no certificate is issued until it does.",
          run: settings.domainStatus,
        },
        {
          key: "setup.onboarding",
          title: "Onboarding checklist",
          hint: "What this store still has to do, derived from its real data.",
          run: settings.onboardingStatus,
        },
        {
          key: "setup.stripeConnect",
          title: "Stripe Connect status & onboarding link",
          run: settings.stripeConnectLink,
        },
        {
          key: "setup.rotatePosKey",
          title: "Rotate the store's POS key",
          hint: "Shown once. Every register for this store must be re-paired.",
          mutates: true,
          run: settings.rotatePosKey,
        },
        {
          key: "setup.pairRegister",
          title: "Mint a register pairing link",
          hint: "Single use, expires in minutes; the POS key itself never travels.",
          mutates: true,
          run: settings.pairRegister,
        },
        {
          key: "setup.channelSecrets",
          title: "Channel credentials (stored)",
          hint: "Masked listing — the vault is write-only by design.",
          run: settings.listChannelSecrets,
        },
        {
          key: "setup.setChannelSecret",
          title: "Store or rotate a channel credential",
          mutates: true,
          run: settings.setChannelSecret,
        },
        {
          key: "setup.deleteChannelSecret",
          title: "Delete a channel credential",
          mutates: true,
          run: settings.deleteChannelSecret,
        },
      ],
    },
    {
      key: "platform",
      title: "Platform",
      hint: "Operations that cross every tenant by design.",
      children: [
        {
          key: "platform.metrics",
          title: "Operating metrics",
          hint: "The north star, GMV, fees and subscriptions for the current month.",
          run: platformOps.operatingMetrics,
        },
        {
          key: "platform.reconcileAll",
          title: "Reconcile every store against Stripe",
          hint: "Each store scanned against its own account; one failure never aborts the sweep.",
          mutates: true,
          run: platformOps.reconcileEveryStore,
        },
        {
          key: "platform.posTestKey",
          title: "Rotate the platform POS test key",
          hint: "The key the POS apps' CI uses. Shown once; CI must be updated with it.",
          mutates: true,
          run: platformOps.rotatePosTestKey,
        },
        {
          key: "platform.health",
          title: "Service health",
          run: platformOps.serviceHealth,
        },
        {
          key: "platform.whoami",
          title: "Who am I acting as?",
          hint: "The superadmin account whose authority every call here carries.",
          run: platformOps.whoAmI,
        },
      ],
    },
  ],
};
