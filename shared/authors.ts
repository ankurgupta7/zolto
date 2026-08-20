/**
 * Authorship for Gwinn's published content.
 *
 * Identifying a named author with real credentials is a meaningful trust signal
 * for both readers and AI assistants deciding whether to cite a page. Until now
 * every article asserted `author: { "@type": "Organization", name: "Gwinn" }`,
 * which says nothing about who stands behind the claims.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Naming gate (mirrors CONTENT_RELEASE_SIGNED in ./marketing)
 * ─────────────────────────────────────────────────────────────────────────────
 * Publishing a real person's name, role and credentials to market Gwinn needs
 * that person's explicit ok — the same principle already applied to the maker's
 * identity, and the one flagged in
 * docs/planning/phase1/content/about-founder.md ("real names/photos of the
 * founder and his wife/her business need their explicit ok").
 *
 * The founder page is still a draft with unresolved placeholders, so no named
 * author is asserted here. Content is attributed to the organization, which is
 * accurate, until someone real signs off.
 *
 * WHEN AN AUTHOR IS CONFIRMED: fill in NAMED_AUTHOR and set
 * AUTHOR_IDENTITY_RELEASED to `true`. Bylines, Article JSON-LD and the llms
 * briefs all pick it up. Do not invent credentials — list only what the person
 * actually holds, since the whole point of the signal is that it can be checked.
 */

import { PLATFORM } from "./platform";

export interface Author {
  /** Display name. */
  name: string;
  /** Role at Gwinn, e.g. "Founder". */
  role: string;
  /**
   * Verifiable credentials — degrees, years of practice, prior work. Only
   * things that are true and checkable; an unverifiable claim is worse than none.
   */
  credentials: string[];
  /** One- or two-sentence bio for the byline block. */
  bio: string;
  /** Optional profile URL (LinkedIn, personal site) for schema `sameAs`. */
  profileUrl?: string;
}

/** Flip to `true` once a real author has agreed to be named. */
export const AUTHOR_IDENTITY_RELEASED = false;

/**
 * The named human author, once released. Left null deliberately — see the gate
 * above. Populating this without a real person's sign-off would fabricate
 * credentials, which is exactly the signal this is meant to establish.
 */
export const NAMED_AUTHOR: Author | null = null;

/** Organizational attribution — accurate, and the honest default. */
export const EDITORIAL_AUTHOR: Author = {
  name: PLATFORM.name,
  role: "Editorial",
  credentials: [],
  bio: `Written by the team building ${PLATFORM.name}, from what we see running the platform and working with the makers on it.`,
};

/** The author to attribute content to right now. */
export const author: Author =
  AUTHOR_IDENTITY_RELEASED && NAMED_AUTHOR ? NAMED_AUTHOR : EDITORIAL_AUTHOR;

/** Whether the current attribution is to a named person rather than the org. */
export function hasNamedAuthor(): boolean {
  return AUTHOR_IDENTITY_RELEASED && NAMED_AUTHOR !== null;
}

/**
 * schema.org author node. A `Person` (with credentials) once an author is
 * named, otherwise the `Organization` — never a Person with empty credentials,
 * which would look like a trust signal while carrying no information.
 */
export function authorJsonLd(baseUrl: string): Record<string, unknown> {
  if (!hasNamedAuthor()) {
    return { "@type": "Organization", name: EDITORIAL_AUTHOR.name };
  }
  const a = NAMED_AUTHOR!;
  return {
    "@type": "Person",
    name: a.name,
    jobTitle: a.role,
    description: a.bio,
    ...(a.credentials.length > 0 ? { knowsAbout: a.credentials } : {}),
    ...(a.profileUrl ? { sameAs: [a.profileUrl] } : {}),
    worksFor: { "@id": `${baseUrl}/#organization` },
  };
}
