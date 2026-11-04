/**
 * Host half of dsh-preview-theme-dark.
 *
 * The whole feature lives in the browser half (./client.js): it reads the
 * built-in document preview's stable data attributes ([data-pdf-preview],
 * [data-excel-preview]), overrides one theme token for the paper color and
 * applies a CSS filter/blend to the page surfaces. Nothing needs the Host, so
 * this entry is deliberately a no-op.
 *
 * It still exists on purpose: the client-modules loader only ships a package's
 * dsh.client bundle when the package has an enabled Loader entry, and the
 * bundle patch in cordis.patch.yml is what creates that entry.
 *
 * @module dsh-preview-theme-dark
 */

/** Cordis plugin name (matches the bundle row id). */
export const name = 'preview-theme-dark'

/** No Host services are required. */
export const inject = []

/**
 * Mount the Host half (intentionally empty).
 * @param {object} _ctx - Cordis context, unused.
 * @returns {void}
 */
export function apply(_ctx) {
	// All behavior is implemented in lib/client.js.
}
