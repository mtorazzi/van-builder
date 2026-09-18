// Dev-only bridge between the running app and the local project file the
// MCP server reads/writes (see vite-project-bridge.ts). Two-way:
//   - file -> browser: on load, and live via a custom Vite HMR event,
//     whatever's in the bridge file gets imported into the store — so
//     changes an MCP-connected agent makes show up without a manual refresh.
//   - browser -> file: store changes (including your own manual edits in
//     the UI) get debounce-POSTed back to the file, so the bridge file
//     never goes stale just because you were clicking around in the app.
//
// Entirely inert outside `npm run dev` (guarded by import.meta.env.DEV) —
// none of this exists in a production build/preview.

import { useStore } from './store';
import { BRIDGE_HTTP_PATH, BRIDGE_HMR_EVENT } from '../bridge-protocol';
import { PROJECT_SCHEMA_VERSION } from './projectOps';
import type { ProjectState } from './types';

const POST_DEBOUNCE_MS = 300;

export function initDevSync(opts: { readOnly?: boolean } = {}) {
  if (!import.meta.env.DEV) return;

  let applyingRemoteUpdate = false;
  let postTimer: ReturnType<typeof setTimeout> | null = null;

  function applyRemoteProject(data: ProjectState) {
    applyingRemoteUpdate = true;
    useStore.getState().importProject(data);
    // Let the store-subscribe callback below observe this update and skip
    // echoing it straight back out as a POST.
    setTimeout(() => (applyingRemoteUpdate = false), 0);
  }

  // Initial sync: if the bridge file already holds a project (e.g. an MCP
  // session set one up before you opened the browser), load it.
  fetch(BRIDGE_HTTP_PATH)
    .then((r) => r.json())
    .then((data) => {
      if (data) applyRemoteProject(data as ProjectState);
    })
    .catch(() => {
      // dev server not up yet / bridge unavailable — non-fatal
    });

  // Live updates pushed by the Vite plugin whenever the bridge file changes
  // on disk (i.e. the MCP server wrote to it).
  if (import.meta.hot) {
    import.meta.hot.on(BRIDGE_HMR_EVENT, (data: ProjectState) => {
      applyRemoteProject(data);
    });
  }

  // Keep the bridge file in sync with the browser's own state too, so a
  // person editing in the UI doesn't get silently overwritten by whatever
  // an agent wrote earlier, and an agent reading the file sees your edits.
  // Viewer mode (phone) never writes back — a second device with its own
  // stale localStorage must not be able to clobber the desktop's layout.
  if (opts.readOnly) return;

  useStore.subscribe((state) => {
    if (applyingRemoteUpdate) return;
    if (postTimer) clearTimeout(postTimer);
    postTimer = setTimeout(() => {
      const project: ProjectState = {
        version: PROJECT_SCHEMA_VERSION,
        shell: state.shell,
        defs: state.defs,
        instances: state.instances,
        overlapMatrix: state.overlapMatrix,
      };
      fetch(BRIDGE_HTTP_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {
        // best-effort — dev convenience only
      });
    }, POST_DEBOUNCE_MS);
  });
}
