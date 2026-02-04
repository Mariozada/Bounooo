/**
 * Vite plugin to precompile Nunjucks templates
 *
 * This allows .jinja templates to be used in Chrome extensions
 * by precompiling them at build time (no eval() needed at runtime).
 *
 * Features:
 * - Precompiles .jinja files to JS at build time
 * - Uses nunjucks-slim runtime (no eval)
 * - Flexible variable handling: ignores extra/missing variables
 */

import nunjucks from 'nunjucks'
import type { Plugin } from 'vite'

export function nunjucksPrecompile(): Plugin {
  return {
    name: 'vite-plugin-nunjucks-precompile',

    transform(code: string, id: string) {
      if (!id.endsWith('.jinja')) {
        return null
      }

      // Get template name from path
      const templateName = id.split('/').pop() || 'template'

      // Precompile the template
      const precompiled = nunjucks.precompileString(code, {
        name: templateName,
        asFunction: false,
      })

      // Return a module that exports a render function
      // Configure environment to be lenient with missing/extra variables
      return {
        code: `
          import nunjucks from 'nunjucks/browser/nunjucks-slim.js';

          // Configure lenient environment:
          // - throwOnUndefined: false = missing variables render as empty
          // - Extra variables passed but not used are automatically ignored
          const env = new nunjucks.Environment(null, {
            throwOnUndefined: false,
            autoescape: false
          });

          // Register the precompiled template
          ${precompiled}

          /**
           * Render template with flexible variable handling
           * - Extra variables not in template: ignored
           * - Missing variables in template: render as empty string
           */
          export function render(context = {}) {
            return env.render('${templateName}', context);
          }

          export default render;
        `,
        map: null,
      }
    },
  }
}
