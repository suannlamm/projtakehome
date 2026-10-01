// The temporary accounts the end-to-end test signs in as. setup.ts creates them before the run and
// deletes them (and everything they made) afterwards.
export const PASSWORD = "e2e-reel-2026";

export const accounts = {
  // The main user: starts with an empty list.
  ana: { email: "e2e-ana@example.com", handle: "e2e_ana" },
  // Someone to follow: has watched and rated The Dark Knight.
  ben: { email: "e2e-ben@example.com", handle: "e2e_ben" },
  // Signed up but hasn't picked a handle yet.
  cal: { email: "e2e-cal@example.com", handle: null },
};
